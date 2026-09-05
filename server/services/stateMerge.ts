import type { Notification, SystemData, User } from '../../src/types';
import { getDescendantIds, isGeneralManager } from '../../src/utils/permissions';
import { hashPassword } from './authService';

/**
 * Optimistic full-state sync internals, extracted verbatim from server.ts for
 * unit testing (see stateMerge.spec.ts). Pure functions: no fs, no Prisma, no
 * network. `mergeStateWithServer` and `authorizeStateMutation` mutate the
 * objects passed to them, matching the original behaviour.
 */

export function publicUser(user: User): Omit<User, 'password' | 'pin'> {
  const { password, pin, ...safe } = user;
  return safe;
}

export function sanitizeStateForClient(state: SystemData): SystemData {
  return {
    ...state,
    users: state.users.map(publicUser) as User[]
  };
}

// Keys ignored entirely (server-managed), plus a rule that an absent key, an
// explicit `undefined`, and an explicit `null` are all "not set" and compare
// equal. Without this a task the server returns with `lastTransferredById:
// undefined` never round-trips equal to the same task after JSON.stringify (which
// drops the key) — so an untouched task looks "modified" and blocks the whole
// state sync in authorizeStateMutation.
const META_KEYS = new Set(['version', 'updatedAt', 'lockedBy']);
const meaningfulKeys = (o: Record<string, any>): string[] =>
  Object.keys(o).filter(k => !META_KEYS.has(k) && o[k] !== undefined && o[k] !== null);

export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null && obj2 == null) return true;
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;

  const keys1 = meaningfulKeys(obj1);
  const keys2 = meaningfulKeys(obj2);
  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
}

export function didItemChange(clientItem: any, serverItem: any): boolean {
  return !deepEqual(clientItem, serverItem);
}

export function mergeStateWithServer(incomingState: SystemData, currentDb: SystemData, currentUserId?: string): { 
  mergedState: SystemData; 
  conflicts: Array<{ type: string; id: string; title: string; clientVersion?: number; serverVersion: number; updatedBy: string; reason: 'STALE' | 'LOCKED' }>;
} {
  const conflicts: any[] = [];
  const mergedState: SystemData = { ...currentDb };

  // NOTE (optimistic concurrency): when a client submits a stale item the merge
  // below silently keeps the server copy. The `conflicts` channel — and the
  // matching 409 path in POST /api/state and the client's conflict modal — stay
  // dormant on purpose. The live client routinely POSTs slightly version-stale
  // snapshots during broadcast/poll races (e.g. rapid tab switches), so raising
  // 409 here pops spurious conflict modals in normal use. Activating it needs
  // the client to stop sending stale snapshots first.

  // 1. Process Tasks
  if (incomingState.tasks) {
    const updatedTasks = incomingState.tasks.map(clientTask => {
      const serverTask = currentDb.tasks.find(t => t.id === clientTask.id);
      
      // If indeed new
      if (!serverTask) {
        return {
          ...clientTask,
          version: 1,
          updatedAt: new Date().toISOString()
        };
      }
      
      // Version-gating check: Ignore if client version is stale (less than server version)
      if (clientTask.version !== undefined && serverTask.version !== undefined && clientTask.version < serverTask.version) {
        // stale + changed: server wins silently (see note at top of function)
        return serverTask;
      }
      
      // Check if item details changed - accept client version directly
      const changed = didItemChange(clientTask, serverTask);
      if (changed) {
        return {
          ...clientTask,
          version: (serverTask.version || 1) + 1,
          updatedAt: new Date().toISOString()
        };
      }
      return serverTask;
    });
    
    const clientTaskIds = new Set(incomingState.tasks.map(t => t.id));
    // To prevent silent deletions of items edited by other crew members, we ALWAYS preserve missing server tasks.
    // Deletion is handled explicitly via /api/tasks/:id route.
    const preservedTasks = currentDb.tasks.filter(t => !clientTaskIds.has(t.id));
    
    mergedState.tasks = [...updatedTasks, ...preservedTasks].filter((item, index, self) =>
      self.findIndex(t => t.id === item.id) === index
    );
  }
  
  // Server-side task notifications: keep assignment/completion notifications reliable
  // even if the browser that performed the mutation refreshes or loses sync.
  // The frontend may also create these notifications; eventKey keeps this idempotent.
  if (incomingState.tasks) {
    if (!Array.isArray(mergedState.notifications)) mergedState.notifications = [];

    const addTaskNotification = (
      recipientUserId: string | undefined,
      title: string,
      message: string,
      eventKey: string
    ) => {
      if (!recipientUserId || recipientUserId === currentUserId) return;
      if (!currentDb.users.some(u => u.id === recipientUserId)) return;
      if (mergedState.notifications.some(n => n.recipientUserId === recipientUserId && n.eventKey === eventKey)) return;

      mergedState.notifications.unshift({
        id: `notif-${Date.now()}-${Math.random()}`,
        title,
        message,
        category: 'Task',
        createdAt: new Date().toISOString(),
        isRead: false,
        recipientUserId,
        eventKey,
        channels: { inApp: true, telegram: true, email: true }
      });
    };

    incomingState.tasks.forEach(clientTask => {
      const serverTaskBefore = currentDb.tasks.find(t => t.id === clientTask.id);

      // New task: notify each selected recipient privately.
      if (!serverTaskBefore) {
        if (!clientTask.originalAssigneeId) {
          const firstAssignee = clientTask.assigneeIds?.[0] || clientTask.assigneeId || undefined;
          clientTask.originalAssigneeId = firstAssignee;
        }
        const recipients = clientTask.assigneeIds?.length
          ? clientTask.assigneeIds
          : (clientTask.assigneeId ? [clientTask.assigneeId] : []);
        const senderId = clientTask.lastTransferredById || clientTask.assignedBy || clientTask.createdBy;
        const senderName = currentDb.users.find(u => u.id === senderId)?.name || 'Operations';

        recipients.forEach(uid => addTaskNotification(
          uid,
          'New task',
          `New task from: ${senderName} — ${clientTask.title}`,
          `task:${clientTask.id}:new:${uid}`
        ));
        return;
      }

      // Started task: notify the sender/switch owner and the GM as soon as the
      // assignee begins active work — mirrors the completion notice below so the
      // sender is never left in the dark between "assigned" and "done".
      if (serverTaskBefore.status !== 'In Progress' && clientTask.status === 'In Progress') {
        const starterName =
          currentDb.users.find(u => u.id === currentUserId)?.name || 'Employee';
        const startKey = clientTask.startedAt || clientTask.updatedAt || 'now';
        const startOwnerId = clientTask.lastTransferredById || clientTask.assignedBy || clientTask.createdBy;

        if (startOwnerId && startOwnerId !== currentUserId) {
          addTaskNotification(
            startOwnerId,
            'Task started',
            `${starterName} started working on: ${clientTask.title}`,
            `task:${clientTask.id}:started:${startKey}:owner:${startOwnerId}`
          );
        }
        currentDb.users.filter(u => isGeneralManager(u)).forEach(gm => {
          addTaskNotification(
            gm.id,
            'Task started',
            `${starterName} started the task you sent them: ${clientTask.title}`,
            `task:${clientTask.id}:started:${startKey}:gm:${gm.id}`
          );
        });
      }

      // Completed task: notify the latest switch owner first, then the original GM sender.
      // The original creator (createdBy) is never overwritten by a switch.
      if (serverTaskBefore.status !== 'Completed' && clientTask.status === 'Completed') {
        const completedByName =
          currentDb.users.find(u => u.id === clientTask.completedById)?.name ||
          currentDb.users.find(u => u.id === currentUserId)?.name ||
          'Employee';
        const completionKey = clientTask.completedAt || clientTask.updatedAt || 'now';
        // `assignedBy` is the person who directly assigned the task to the
        // current assignee. `lastTransferredById` exists only after a Switch.
        // This distinction is important for the workflow:
        //   Hany -> Matar -> (Switch) Khaled -> Complete
        //   Khaled notifies Matar, then Hany is told that Matar completed
        //   the task Hany originally sent to Matar.
        const switchOwnerId = clientTask.lastTransferredById;
        const directSenderId = clientTask.assignedBy || clientTask.createdBy;
        const originalAssigneeId = clientTask.originalAssigneeId || clientTask.assigneeId;

        // If the task was switched, notify ONLY the person who performed the
        // Switch about the actual person who completed it.
        if (switchOwnerId) {
          addTaskNotification(
            switchOwnerId,
            'Task completed',
            `${completedByName} completed the task you switched to them: ${clientTask.title}`,
            `task:${clientTask.id}:completed:${completionKey}:switch-owner:${switchOwnerId}`
          );
        } else if (directSenderId && directSenderId !== clientTask.completedById) {
          // No Switch: the employee who directly assigned the task gets the
          // completion notification (e.g. Manager -> Assistant).
          addTaskNotification(
            directSenderId,
            'Task completed',
            `${completedByName} completed the task you sent them: ${clientTask.title}`,
            `task:${clientTask.id}:completed:${completionKey}:direct-sender:${directSenderId}`
          );
        }

        // The GM is ALWAYS told when any task is completed, regardless of who
        // sent it or whether it was switched — this must never depend on
        // switchOwnerId being set, or a direct (non-switched) assignment from
        // the GM would silently never reach them. Uses its own eventKey
        // (":gm:") so it is independent of the notifications sent above.
        const originalAssignee = currentDb.users.find(u => u.id === originalAssigneeId);
        const gmCompletionName = originalAssignee?.name || completedByName;
        currentDb.users.filter(u => isGeneralManager(u)).forEach(gm => {
          addTaskNotification(
            gm.id,
            'Task completed',
            `${gmCompletionName} completed the task you sent them: ${clientTask.title}`,
            `task:${clientTask.id}:completed:${completionKey}:gm:${gm.id}`
          );
        });
      }
    });
  }

  // 2. Process Checklists
  if (incomingState.checklists) {
    const reconciled = currentDb.checklists.map(serverChk => {
      const clientChk = incomingState.checklists.find(c => c.id === serverChk.id);
      if (!clientChk) return serverChk;

      // Version-gating check: Ignore if client version is stale (less than server version)
      if (clientChk.version !== undefined && serverChk.version !== undefined && clientChk.version < serverChk.version) {
        // stale + changed: server wins silently (see note at top of function)
        return serverChk;
      }

      // Never let a sync that carries an empty item list wipe a checklist that
      // already has items on the server. A client that POSTs before its initial
      // state fetch has settled would otherwise blank the department's real
      // checklist with the freshly auto-provisioned empty skeleton.
      const clientItems = Array.isArray(clientChk.items) ? clientChk.items : [];
      const serverItems = Array.isArray(serverChk.items) ? serverChk.items : [];
      if (clientItems.length === 0 && serverItems.length > 0) {
        return serverChk;
      }

      const changed = didItemChange(clientChk, serverChk);
      if (changed) {
        return {
          ...clientChk,
          version: (serverChk.version || 1) + 1,
          updatedAt: new Date().toISOString()
        };
      }
      return serverChk;
    });

    // Keep checklists the client just created that the DB has not seen yet
    // (e.g. the fixed Daily/Weekly/Monthly skeleton auto-provisioned the first
    // time a department's checklist tab is opened). Mapping only over
    // `currentDb.checklists` above would silently discard them, so the client
    // re-adds them on the next render — an endless save/re-add loop. Mirrors the
    // Projects reconciliation below.
    const serverChkIds = new Set(currentDb.checklists.map(c => c.id));
    const newClientChecklists = incomingState.checklists
      .filter(c => !serverChkIds.has(c.id))
      .map(c => ({
        ...c,
        version: c.version || 1,
        updatedAt: c.updatedAt || new Date().toISOString()
      }));

    mergedState.checklists = [...reconciled, ...newClientChecklists];
  }
  
  // 3. Process Projects
  if (incomingState.projects) {
    const updatedProjects = incomingState.projects.map(clientProj => {
      const serverProj = currentDb.projects.find(p => p.id === clientProj.id);
      if (!serverProj) {
        return {
          ...clientProj,
          version: 1,
          updatedAt: new Date().toISOString()
        };
      }
      
      // Version-gating check: Ignore if client version is stale (less than server version)
      if (clientProj.version !== undefined && serverProj.version !== undefined && clientProj.version < serverProj.version) {
        // stale + changed: server wins silently (see note at top of function)
        return serverProj;
      }
      
      const changed = didItemChange(clientProj, serverProj);
      if (changed) {
        return {
          ...clientProj,
          version: (serverProj.version || 1) + 1,
          updatedAt: new Date().toISOString()
        };
      }
      return serverProj;
    });
    
    const clientProjIds = new Set(incomingState.projects.map(p => p.id));
    const preservedProjects = currentDb.projects.filter(p => !clientProjIds.has(p.id));
    
    mergedState.projects = [...updatedProjects, ...preservedProjects].filter((item, index, self) =>
      self.findIndex(p => p.id === item.id) === index
    );
  }
  
  // Merge users with smart timestamp checks to avoid stale/idle overwrites of user credentials
  if (incomingState.users) {
    mergedState.users = incomingState.users.map(clientUser => {
      const serverUser = currentDb.users.find(u => u.id === clientUser.id);
      if (!serverUser) {
        const created = { ...clientUser };
        if (created.password && !created.password.startsWith('scrypt$')) created.password = hashPassword(created.password);
        if (created.pin && !created.pin.startsWith('scrypt$')) created.pin = hashPassword(created.pin);
        return created;
      }
      // Frontend receives sanitized users. Never allow a state sync to erase or replace
      // the server-side password/PIN hashes. Profile fields can still be updated.
      return { ...serverUser, ...clientUser, password: serverUser.password, pin: serverUser.pin };
    });;
    
    // Explicit deletions of users are handled by admins in the admin panel. 
    // No preservedUsers auto-appended here so a user deleted on the client is actually deleted.
  }
  if (incomingState.notifications) {
    // Merge by stable notification identity/event key instead of replacing the whole
    // list. Different accounts can be open at the same time while testing, so one
    // browser must never erase another account's freshly generated notification.
    const mergedByIdentity = new Map<string, Notification>();
    [...mergedState.notifications, ...incomingState.notifications].forEach(n => {
      const key = n.eventKey ? `event:${n.recipientUserId}:${n.eventKey}` : `id:${n.id}`;
      const existing = mergedByIdentity.get(key);
      // Acknowledgement/read changes from the client should still win for that exact event.
      mergedByIdentity.set(key, existing ? { ...existing, ...n } : n);
    });
    mergedState.notifications = Array.from(mergedByIdentity.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  if (incomingState.checklistHistory) mergedState.checklistHistory = incomingState.checklistHistory;
  if (incomingState.chats) mergedState.chats = incomingState.chats;
  if (incomingState.telegramConfig) mergedState.telegramConfig = incomingState.telegramConfig;

  // 4. Process Departments (simple list managed by Admin panel)
  if (incomingState.departments) {
    mergedState.departments = incomingState.departments;
  }

  // 5. Process Complaints (Exclusive complaints)
  if (incomingState.complaints) {
    const currentComplaints = currentDb.complaints || [];
    const updatedComplaints = incomingState.complaints.map(clientComplaint => {
      const serverComplaint = currentComplaints.find(c => c.id === clientComplaint.id);

      if (!serverComplaint) {
        return {
          ...clientComplaint,
          version: 1
        };
      }

      // Version-gating check: Ignore if client version is stale
      if (clientComplaint.version !== undefined && serverComplaint.version !== undefined && clientComplaint.version < serverComplaint.version) {
        // stale + changed: server wins silently (see note at top of function)
        return serverComplaint;
      }

      const changed = didItemChange(clientComplaint, serverComplaint);
      if (changed) {
        return {
          ...clientComplaint,
          version: (serverComplaint.version || 1) + 1
        };
      }
      return serverComplaint;
    });

    const clientComplaintIds = new Set(incomingState.complaints.map(c => c.id));
    const preservedComplaints = currentComplaints.filter(c => !clientComplaintIds.has(c.id));

    mergedState.complaints = [...updatedComplaints, ...preservedComplaints].filter((item, index, self) =>
      self.findIndex(c => c.id === item.id) === index
    );
  }
  
  return { mergedState, conflicts };
}

export function authorizeStateMutation(incomingState: SystemData, currentDb: SystemData, actingUser: User): string | null {
  // Exactly one GeneralManager may ever exist — whoever already holds the role.
  // No sync, from anyone (including the GM's own client), may promote another
  // user to GeneralManager or introduce a new one with that role. Applied before
  // the management freeze below so it holds even for a GM's own payload.
  if (incomingState.users) {
    const currentGmId = currentDb.users.find(u => isGeneralManager(u))?.id;
    incomingState.users = incomingState.users.map(u => {
      if (!isGeneralManager(u) || u.id === currentGmId) return u;
      const serverCopy = currentDb.users.find(s => s.id === u.id);
      return { ...u, role: serverCopy ? serverCopy.role : 'Assistant' };
    });
  }

  const management = isGeneralManager(actingUser) || actingUser.role === 'Director' || actingUser.role === 'Manager';

  // If non-management user sent the state, preserve server-managed entities
  if (!management) {
    incomingState.users = sanitizeStateForClient(currentDb).users;
    incomingState.departments = currentDb.departments;
    incomingState.projects = currentDb.projects;
  }

  // A Manager only inspects the Inspection Checklist — authoring items is the
  // Director's job and signing is the technicians'. Freeze checklists to the DB
  // copy so a stray Manager sync can't add, delete, or tick anything.
  if (actingUser.role === 'Manager') {
    incomingState.checklists = currentDb.checklists;
  }

  if (incomingState.tasks) {
    // The client POSTs its ENTIRE task list on every sync. A task the acting
    // user has no business changing must not be allowed through — but neither
    // should it 403 the whole request. A stale or client-mutated copy of some
    // unrelated task (e.g. the background auto-archive flipping a long-Completed
    // ticket to Archived on every logged-in browser, regardless of who owns it)
    // would otherwise permanently block that user's own legitimate edits,
    // including brand-new tasks they just created. So: silently pin a
    // disallowed change back to the server copy (drop it outright if it is a
    // brand-new task they may not create) and let the rest of the sync proceed.
    // Mirrors the "server wins silently" stance the merge already takes.
    const reconciledTasks: typeof incomingState.tasks = [];
    for (const clientTask of incomingState.tasks) {
      const serverTask = currentDb.tasks.find(t => t.id === clientTask.id);

      // Stale copy — the merge discards it anyway; pass it straight through.
      if (serverTask && clientTask.version != null && serverTask.version != null
          && clientTask.version < serverTask.version) { reconciledTasks.push(clientTask); continue; }

      const changed = !serverTask || !deepEqual(clientTask, serverTask);
      if (!changed || isGeneralManager(actingUser)) { reconciledTasks.push(clientTask); continue; }

      const scope = new Set([actingUser.id, ...getDescendantIds(actingUser.id, currentDb.users)]);
      const oldRecipients = serverTask ? (serverTask.assigneeIds?.length ? serverTask.assigneeIds : (serverTask.assigneeId ? [serverTask.assigneeId] : [])) : [];
      const newRecipients = clientTask.assigneeIds?.length ? clientTask.assigneeIds : (clientTask.assigneeId ? [clientTask.assigneeId] : []);
      const allowed = actingUser.role === 'Director' || actingUser.role === 'Manager'
        ? (clientTask.createdBy === actingUser.id || oldRecipients.some(id => scope.has(id)) || newRecipients.every(id => scope.has(id)))
        : (clientTask.createdBy === actingUser.id || oldRecipients.includes(actingUser.id) || newRecipients.includes(actingUser.id));

      if (allowed) {
        reconciledTasks.push(clientTask);
      } else if (serverTask) {
        // Not theirs to touch — keep the authoritative copy, no error.
        reconciledTasks.push(serverTask);
      }
      // else: a brand-new task attributed to someone else — drop it entirely.
    }
    incomingState.tasks = reconciledTasks;
  }

  return null;
}
