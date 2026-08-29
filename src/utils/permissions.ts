import { User } from '../types';

export function isGeneralManager(user: User | null | undefined): boolean {
  return !!user && (user.role === 'GM' || user.role === 'GeneralManager');
}
export function isDirector(user: User | null | undefined): boolean { return !!user && user.role === 'Director'; }
export function isManager(user: User | null | undefined): boolean { return !!user && user.role === 'Manager'; }
// "Manager-level access or above" — the GM and Directors outrank a Manager, so
// anything a Manager can reach (admin panel, backup/restore, checklist
// authoring) they can reach too. Mirrors canAccessAuditLog / canSendTasks and
// the server-side requireRole('GeneralManager','Director','Manager') guard.
export function hasManagerAccess(user: User | null | undefined): boolean {
  return isGeneralManager(user) || isDirector(user) || isManager(user);
}
// Audit Log is a sensitive accountability trail: only the GM and the two
// management tiers below (Director, Manager) can open it — Assistants/
// Coordinators never can, regardless of department.
export function canAccessAuditLog(user: User | null | undefined): boolean {
  return isGeneralManager(user) || isDirector(user) || isManager(user);
}
export function isAssistant(user: User | null | undefined): boolean { return !!user && (user.role === 'Assistant' || user.role === 'Coordinator'); }
// Every management level can assign work only to its direct team.
export function canSendTasks(user: User | null | undefined): boolean {
  return isGeneralManager(user) || isDirector(user) || isManager(user);
}
export function getDescendantIds(rootId: string, users: User[]): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    users.filter(u => (u.parentId === id || u.managerId === id) && !visited.has(u.id)).forEach(u => {
      visited.add(u.id);
      result.push(u.id);
      visit(u.id);
    });
  };
  visit(rootId);
  return result;
}

export function getAssignableUsers(currentUser: User, allUsers: User[]): User[] {
  if (isGeneralManager(currentUser)) {
    return [currentUser, ...allUsers.filter(u => u.id !== currentUser.id && u.status !== 'On Leave')];
  }

  if (isDirector(currentUser)) {
    // A Director is the head of the department (e.g. IT, F&B, Rooms, Operations).
    // The Director can assign tasks to:
    // 1. Themselves
    // 2. All Managers in their department
    // 3. All Assistants/Coordinators in their department
    // 4. Anyone reporting to them directly or in their descendant tree
    return allUsers.filter(u => {
      if (u.id === currentUser.id) return true;
      if (u.status === 'On Leave') return false;
      const sameDept = !!(u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase());
      const isSubordinateRole = u.role === 'Manager' || u.role === 'Assistant' || u.role === 'Coordinator';
      const isDirectReport = u.parentId === currentUser.id || u.managerId === currentUser.id;
      return (sameDept && isSubordinateRole) || isDirectReport;
    });
  }

  if (isManager(currentUser)) {
    // A Manager can assign tasks to:
    // 1. Themselves
    // 2. All Assistants/Coordinators in their department or reporting directly to them
    return allUsers.filter(u => {
      if (u.id === currentUser.id) return true;
      if (u.status === 'On Leave') return false;
      const isDirectReport = (u.parentId === currentUser.id || u.managerId === currentUser.id) && isAssistant(u);
      const isDeptAssistant = !!(u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase() && isAssistant(u));
      return isDirectReport || isDeptAssistant;
    });
  }

  return [];
}

export function canViewTask(
  user: User,
  task: { assigneeId: string | null; assigneeIds?: string[]; createdBy: string; assignedBy?: string; departmentId?: string },
  users: User[]
): boolean {
  if (isGeneralManager(user)) return true;

  const recipients = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);

  if (isAssistant(user)) {
    return recipients.includes(user.id);
  }

  if (isDirector(user)) {
    if (task.createdBy === user.id || task.assignedBy === user.id) return true;
    if (recipients.includes(user.id)) return true;
    if (task.departmentId && user.departmentId && task.departmentId.toLowerCase() === user.departmentId.toLowerCase()) return true;
    const deptUserIds = new Set(
      users
        .filter(u => (u.departmentId && user.departmentId && u.departmentId.toLowerCase() === user.departmentId.toLowerCase()) || u.parentId === user.id || u.managerId === user.id)
        .map(u => u.id)
    );
    return recipients.some(id => deptUserIds.has(id));
  }

  if (isManager(user)) {
    if (task.createdBy === user.id || task.assignedBy === user.id) return true;
    if (recipients.includes(user.id)) return true;
    const teamUserIds = new Set([
      user.id,
      ...users
        .filter(u => u.parentId === user.id || u.managerId === user.id || (u.departmentId && user.departmentId && u.departmentId.toLowerCase() === user.departmentId.toLowerCase() && isAssistant(u)))
        .map(u => u.id),
      ...getDescendantIds(user.id, users)
    ]);
    return recipients.some(id => teamUserIds.has(id));
  }

  return recipients.includes(user.id) || task.createdBy === user.id;
}
export function canViewComplaint(user: User, complaint: { assignedToId?: string | null; departmentId?: string }, users: User[] = []): boolean {
  if (isGeneralManager(user)) return true;
  if (user.role === 'Director' || user.role === 'Manager') {
    if (user.departmentId && complaint.departmentId && user.departmentId !== complaint.departmentId) return false;
    const scope = new Set([user.id, ...getDescendantIds(user.id, users)]);
    return !complaint.assignedToId || scope.has(complaint.assignedToId);
  }
  return complaint.assignedToId === user.id;
}
