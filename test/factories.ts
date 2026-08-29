/**
 * Shared test data builders. Every field has a sensible default; pass a partial
 * to override. Used by unit specs, MSW handlers, and the DB seed helper so the
 * whole suite talks about the same cast of users.
 */
import type {
  Checklist,
  ChecklistItem,
  Complaint,
  Department,
  Notification,
  Task,
  User,
  UserRole,
} from '../src/types';

let seq = 0;
export const nextId = (prefix: string): string => `${prefix}-${++seq}`;
export const resetSeq = (): void => {
  seq = 0;
};

const DAY = 86_400_000;

export function makeUser(over: Partial<User> = {}): User {
  const n = ++seq;
  return {
    id: `user-${n}`,
    username: `user${n}`,
    name: `User ${n}`,
    role: 'Assistant',
    title: 'IT Assistant',
    email: `user${n}@hotel.test`,
    phone: '',
    avatar: '',
    status: 'Active',
    skills: [],
    departmentId: 'dept-it',
    ...over,
  };
}

export function makeTask(over: Partial<Task> = {}): Task {
  const n = ++seq;
  return {
    id: `task-${n}`,
    title: `Task ${n}`,
    description: '',
    priority: 'Medium',
    status: 'Open',
    assigneeId: null,
    assigneeIds: [],
    createdBy: 'user-1',
    departmentId: 'dept-it',
    deadline: new Date(Date.now() + DAY).toISOString(),
    createdAt: new Date().toISOString(),
    notes: [],
    attachments: [],
    isOverdue: false,
    version: 1,
    ...over,
  };
}

export function makeChecklistItem(over: Partial<ChecklistItem> = {}): ChecklistItem {
  const n = ++seq;
  return { id: `item-${n}`, text: `Item ${n}`, completed: false, ...over };
}

export function makeChecklist(over: Partial<Checklist> = {}): Checklist {
  const n = ++seq;
  return {
    id: `cl-${n}`,
    type: 'Daily',
    title: `Checklist ${n}`,
    description: '',
    departmentId: 'dept-it',
    assignedToId: null,
    items: [makeChecklistItem(), makeChecklistItem()],
    lastResetPeriod: undefined,
    version: 1,
    ...over,
  };
}

export function makeComplaint(over: Partial<Complaint> = {}): Complaint {
  const n = ++seq;
  return {
    id: `cmp-${n}`,
    title: `Complaint ${n}`,
    description: '',
    source: 'Exclusivi',
    departmentId: 'dept-it',
    assignedToId: null,
    createdBy: 'user-1',
    status: 'Open',
    priority: 'Medium',
    createdAt: new Date().toISOString(),
    version: 1,
    ...over,
  };
}

export function makeDepartment(over: Partial<Department> = {}): Department {
  const n = ++seq;
  return {
    id: `dept-${n}`,
    name: `Department ${n}`,
    managerIds: [],
    complaintReasons: [],
    isActive: true,
    ...over,
  };
}

export function makeNotification(over: Partial<Notification> = {}): Notification {
  const n = ++seq;
  return {
    id: `ntf-${n}`,
    title: `Notification ${n}`,
    message: '',
    category: 'System',
    createdAt: new Date().toISOString(),
    isRead: false,
    channels: { inApp: true, telegram: false, email: false },
    ...over,
  };
}

/**
 * A canonical five-person org spanning every role, all in one department except
 * `other`, who sits in a second department for cross-department denial tests.
 *
 *   gm ─ dir ─ mgr ─ asst          (dept-it)
 *              other               (dept-fnb)
 */
export function makeOrg() {
  const gm = makeUser({ id: 'gm', name: 'Gina GM', role: 'GeneralManager', title: 'General Manager', departmentId: undefined });
  const dir = makeUser({ id: 'dir', name: 'Dana Director', role: 'Director', title: 'Director IT', parentId: 'gm', departmentId: 'dept-it' });
  const mgr = makeUser({ id: 'mgr', name: 'Max Manager', role: 'Manager', title: 'IT Manager', parentId: 'dir', departmentId: 'dept-it' });
  const asst = makeUser({ id: 'asst', name: 'Sam Assistant', role: 'Assistant', title: 'IT Assistant', parentId: 'mgr', departmentId: 'dept-it' });
  const other = makeUser({ id: 'other', name: 'Otto Other', role: 'Assistant', title: 'F&B Assistant', parentId: 'x', departmentId: 'dept-fnb' });
  const all = [gm, dir, mgr, asst, other];
  const byRole = (role: UserRole) => all.find((u) => u.role === role)!;
  return { gm, dir, mgr, asst, other, all, byRole };
}

export const TEST_PASSWORD = 'Passw0rd!';
