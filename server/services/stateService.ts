import prisma from '../db';
import { sanitizePublicUser } from './authService';
import { SystemData, Task, Checklist, ChecklistHistory, Project, Notification, Department } from '../../src/types';

export async function getSystemState(forPublic: boolean = false): Promise<SystemData> {
  const [departments, users, tasks, taskHistories, checklists, checklistHistories, projects, notifications] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.task.findMany({ orderBy: { deadline: 'asc' } }),
    prisma.taskHistory.findMany({ orderBy: { timestamp: 'desc' } }),
    prisma.checklist.findMany({ orderBy: { title: 'asc' } }),
    prisma.checklistHistory.findMany({ orderBy: { timestamp: 'desc' } }),
    prisma.project.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.notification.findMany({ orderBy: { createdAt: 'desc' } })
  ]);

  // Map departments
  const mappedDepartments: Department[] = departments.map(d => ({
    id: d.id,
    name: d.name,
    description: d.description || undefined,
    directorId: d.directorId || undefined,
    managerIds: users.filter(u => u.departmentId === d.id && u.role === 'Manager').map(u => u.id),
    complaintReasons: d.complaintReasons ? JSON.parse(d.complaintReasons) : [],
    isActive: d.isActive
  }));

  // Map users
  const mappedUsers = users.map(u => (forPublic ? sanitizePublicUser(u) : sanitizePublicUser(u)));

  // Map tasks with histories
  const historyByTask = new Map<string, any[]>();
  taskHistories.forEach(h => {
    const list = historyByTask.get(h.taskId) || [];
    list.push({
      id: h.id,
      taskId: h.taskId,
      type: h.type as any,
      userId: h.userId,
      userName: h.userName,
      userAvatar: h.userAvatar || undefined,
      details: h.details || undefined,
      timestamp: h.timestamp.toISOString()
    });
    historyByTask.set(h.taskId, list);
  });

  const now = new Date();
  const mappedTasks: Task[] = tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as any,
    status: t.status as any,
    deadline: t.deadline.toISOString(),
    isOverdue: t.status !== 'Completed' && t.deadline < now,
    departmentId: t.departmentId || null,
    createdBy: t.creatorId || t.assignedBy || 'system',
    assignedBy: t.assignedBy || t.creatorId || 'system',
    assigneeId: t.assigneeId || null,
    assigneeIds: t.assigneeIds ? JSON.parse(t.assigneeIds) : (t.assigneeId ? [t.assigneeId] : []),
    lastTransferredById: t.lastTransferredById || null,
    originalAssigneeId: t.originalAssigneeId || undefined,
    delegatedFromId: t.delegatedFromId || undefined,
    completedById: t.completedById || undefined,
    startedAt: t.startedAt ? t.startedAt.toISOString() : undefined,
    completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
    actualDurationSec: t.actualDurationSec ?? undefined,
    notes: t.notes ? JSON.parse(t.notes) : [],
    attachments: [],
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    history: historyByTask.get(t.id) || []
  }));

  // Map checklists
  const mappedChecklists: Checklist[] = checklists.map(c => ({
    id: c.id,
    type: c.type as any,
    title: c.title,
    description: c.description || '',
    departmentId: c.departmentId || undefined,
    assignedToId: c.assignedToId || null,
    items: c.items ? JSON.parse(c.items) : [],
    version: c.version,
    updatedAt: c.updatedAt.toISOString()
  }));

  // Map checklist history
  const mappedChecklistHistories: ChecklistHistory[] = checklistHistories.map(h => ({
    date: h.date,
    type: (h.type as any) || 'Daily',
    itemsAttempted: h.itemsAttempted,
    itemsCompleted: h.itemsCompleted,
    completedBy: h.completedBy,
    timestamp: h.timestamp.toISOString(),
    items: h.items ? JSON.parse(h.items) : undefined
  }));

  // Map projects
  const mappedProjects: Project[] = projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    progress: p.progress,
    managerId: p.managerId || '',
    teamIds: p.teamIds ? JSON.parse(p.teamIds) : [],
    milestones: p.milestones ? JSON.parse(p.milestones) : [],
    documents: p.documents ? JSON.parse(p.documents) : [],
    deadline: p.deadline ? p.deadline.toISOString() : new Date().toISOString(),
    delayStatus: p.delayStatus,
    notes: p.notes ? JSON.parse(p.notes) : [],
    version: p.version,
    updatedAt: p.updatedAt.toISOString()
  }));

  // Map notifications
  const mappedNotifications: Notification[] = notifications.map(n => ({
    id: n.id,
    recipientUserId: n.recipientUserId,
    title: n.title,
    message: n.message,
    category: n.category as any,
    createdAt: n.createdAt.toISOString(),
    isRead: n.isRead,
    acknowledgedAt: n.acknowledgedAt ? n.acknowledgedAt.toISOString() : undefined,
    eventKey: n.eventKey || undefined,
    channels: n.channels ? JSON.parse(n.channels) : { inApp: true, telegram: true, email: true }
  }));

  return {
    departments: mappedDepartments,
    users: mappedUsers,
    tasks: mappedTasks,
    checklists: mappedChecklists,
    checklistHistory: mappedChecklistHistories,
    projects: mappedProjects,
    notifications: mappedNotifications,
    complaints: [],
    chats: []
  };
}

export async function saveSystemState(state: Partial<SystemData>) {
  // Sync in dependency order: departments -> users -> tasks/checklists -> history
  // -> notifications. Tasks and checklists have a real FK on `departmentId`, so
  // writing them before their department row exists throws P2003 and silently
  // aborts the sync.

  // Sync departments (first — everything else may reference them)
  if (state.departments && Array.isArray(state.departments)) {
    for (const d of state.departments) {
      await prisma.department.upsert({
        where: { id: d.id },
        update: {
          name: d.name,
          description: d.description || null,
          directorId: d.directorId || null,
          isActive: d.isActive !== false,
          complaintReasons: JSON.stringify(d.complaintReasons || [])
        },
        create: {
          id: d.id,
          name: d.name,
          description: d.description || null,
          directorId: d.directorId || null,
          isActive: d.isActive !== false,
          complaintReasons: JSON.stringify(d.complaintReasons || [])
        }
      });
    }
  }

  // The set of departments that actually exist now — used to null out dangling
  // `departmentId` FKs on users / tasks / checklists rather than fail the write.
  const knownDeptIds = new Set(
    (await prisma.department.findMany({ select: { id: true } })).map(d => d.id)
  );
  const deptOrNull = (id?: string | null) => (id && knownDeptIds.has(id) ? id : null);

  // Sync users
  if (state.users && Array.isArray(state.users)) {
    for (const u of state.users) {
      const updatePayload: any = {
        name: u.name,
        role: u.role,
        title: u.title,
        status: u.status,
        departmentId: deptOrNull(u.departmentId),
        parentId: u.parentId || u.managerId || null,
        skills: JSON.stringify(u.skills || [])
      };
      if (u.phone !== undefined) updatePayload.phone = u.phone;
      if (u.avatar !== undefined) updatePayload.avatar = u.avatar;

      await prisma.user.updateMany({
        where: { id: u.id },
        data: updatePayload
      });
    }
  }

  // Sync tasks
  if (state.tasks && Array.isArray(state.tasks)) {
    for (const t of state.tasks) {
      const deadlineDate = t.deadline ? new Date(t.deadline) : new Date(Date.now() + 86400000);
      const createdAtDate = t.createdAt ? new Date(t.createdAt) : new Date();
      const toDate = (v?: string) => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };

      const lifecycle = {
        originalAssigneeId: t.originalAssigneeId || null,
        delegatedFromId: t.delegatedFromId || null,
        completedById: t.completedById || null,
        startedAt: toDate(t.startedAt),
        completedAt: toDate(t.completedAt),
        actualDurationSec: typeof t.actualDurationSec === 'number' ? t.actualDurationSec : null,
      };

      await prisma.task.upsert({
        where: { id: t.id },
        update: {
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          status: t.status,
          deadline: isNaN(deadlineDate.getTime()) ? new Date() : deadlineDate,
          isOverdue: !!t.isOverdue,
          departmentId: deptOrNull(t.departmentId),
          creatorId: t.createdBy || t.assignedBy || 'system',
          assignedBy: t.assignedBy || t.createdBy || 'system',
          assigneeId: t.assigneeId || null,
          assigneeIds: JSON.stringify(t.assigneeIds || (t.assigneeId ? [t.assigneeId] : [])),
          lastTransferredById: t.lastTransferredById || null,
          notes: JSON.stringify(t.notes || []),
          version: t.version || 1,
          ...lifecycle
        },
        create: {
          id: t.id,
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          status: t.status,
          deadline: isNaN(deadlineDate.getTime()) ? new Date() : deadlineDate,
          isOverdue: !!t.isOverdue,
          departmentId: deptOrNull(t.departmentId),
          creatorId: t.createdBy || t.assignedBy || 'system',
          assignedBy: t.assignedBy || t.createdBy || 'system',
          assigneeId: t.assigneeId || null,
          assigneeIds: JSON.stringify(t.assigneeIds || (t.assigneeId ? [t.assigneeId] : [])),
          lastTransferredById: t.lastTransferredById || null,
          notes: JSON.stringify(t.notes || []),
          version: t.version || 1,
          createdAt: isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate,
          ...lifecycle
        }
      });
    }
  }

  // Sync checklists
  if (state.checklists && Array.isArray(state.checklists)) {
    for (const c of state.checklists) {
      await prisma.checklist.upsert({
        where: { id: c.id },
        update: {
          type: c.type,
          title: c.title,
          description: c.description || null,
          departmentId: deptOrNull(c.departmentId),
          assignedToId: c.assignedToId || null,
          items: JSON.stringify(c.items || []),
          version: c.version || 1
        },
        create: {
          id: c.id,
          type: c.type,
          title: c.title,
          description: c.description || null,
          departmentId: deptOrNull(c.departmentId),
          assignedToId: c.assignedToId || null,
          items: JSON.stringify(c.items || []),
          version: c.version || 1
        }
      });
    }
  }

  // Sync checklist histories — the schema requires a real parent checklist; if
  // there is none yet, skip rather than throw an FK error.
  if (state.checklistHistory && Array.isArray(state.checklistHistory) && state.checklistHistory.length > 0) {
    const parentChecklist =
      (await prisma.checklist.findFirst({ where: { type: 'Daily' } })) ||
      (await prisma.checklist.findFirst());
    if (parentChecklist) {
      for (const h of state.checklistHistory) {
        // Deterministic id from the entry's identity (one record per
        // date + type + completer) so re-syncing the same state is idempotent
        // and can never collide on `Date.now()`.
        const historyId = `chkhist-${h.date}-${h.type || 'Daily'}-${h.completedBy}`;
        const payload = {
          checklistId: parentChecklist.id,
          date: h.date,
          type: h.type,
          itemsAttempted: h.itemsAttempted,
          itemsCompleted: h.itemsCompleted,
          completedBy: h.completedBy,
          timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
          items: JSON.stringify(h.items || [])
        };
        await prisma.checklistHistory.upsert({
          where: { id: historyId },
          update: payload,
          create: { id: historyId, ...payload }
        });
      }
    }
  }

  // Sync notifications
  if (state.notifications && Array.isArray(state.notifications)) {
    for (const n of state.notifications) {
      await prisma.notification.upsert({
        where: { id: n.id },
        update: {
          isRead: n.isRead,
          acknowledgedAt: n.acknowledgedAt ? new Date(n.acknowledgedAt) : null
        },
        create: {
          id: n.id,
          recipientUserId: n.recipientUserId || '',
          title: n.title,
          message: n.message,
          category: n.category || 'System',
          isRead: n.isRead,
          acknowledgedAt: n.acknowledgedAt ? new Date(n.acknowledgedAt) : null,
          eventKey: n.eventKey || null,
          channels: JSON.stringify(n.channels || {})
        }
      });

      // One notification per (recipient, eventKey). Concurrent state syncs can
      // each generate their own row for the same event before either commits,
      // leaving orphans that never get marked read. Collapse them onto the row
      // we just wrote.
      if (n.eventKey) {
        await prisma.notification.deleteMany({
          where: { recipientUserId: n.recipientUserId || '', eventKey: n.eventKey, id: { not: n.id } }
        });
      }
    }
  }

  return await getSystemState(true);
}
