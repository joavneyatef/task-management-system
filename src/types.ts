/**
 * Domain types for IT Operations Management System
 */

// GeneralManager = top-of-hierarchy oversight role (e.g. Mr. Hany): assigns to Managers & Coordinators,
// sees everything across departments, audit logs, and complaint accountability.
// Manager = departmental manager: creates/assigns tasks to their own Coordinators only.
// Coordinator = Employee/Assistant/Staff: self-assigned tasks, checklist execution, marking work done.
export type UserRole = 'GM' | 'Director' | 'Manager' | 'Assistant' | 'GeneralManager' | 'Coordinator';

export type UserStatus = 'Active' | 'On Leave' | 'Off Duty';

export interface Department {
  id: string;
  name: string;
  description?: string;
  managerIds: string[];
  directorId?: string; // Executive complaint owner for this department
  complaintReasons?: string[];
  isActive: boolean;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  phone: string;
  avatar: string;
  status: UserStatus;
  skills: string[];
  pin?: string;
  updatedAt?: string;
  departmentId?: string;
  managerId?: string; // Legacy compatibility
  parentId?: string; // Actual organizational reporting line
  password?: string; // Account password/PIN used by login
  positionCode?: string; // Exact position from the organization structure
}

export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TaskStatus = 'Open' | 'In Progress' | 'Completed' | 'Archived';

export interface TaskHistoryEntry {
  id: string;
  type: 'create' | 'claim' | 'start' | 'complete' | 'note' | 'assign';
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: string;
  details?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null; // null means 'Open / Unassigned'
  assigneeIds?: string[]; // Multiple operators assigned
  createdBy: string; // User ID of the creator
  assignedBy?: string; // User ID of the latest person who assigned/transferred this task; original creator remains in createdBy
  originalAssigneeId?: string; // First person the task was assigned to; preserved across switches for final GM completion notice
  lastTransferredById?: string; // Latest person who explicitly switched/delegated the task
  delegatedFromId?: string; // User ID of the manager/director who switched/delegated the task to the current assignee
  departmentId?: string; // Department this task belongs to
  completedById?: string; // User ID who actual resolved/completed it
  deadline: string; // ISO date string
  createdAt: string; // ISO date string
  startedAt?: string; // ISO date string when timer started
  completedAt?: string; // ISO date string when completed
  actualDurationSec?: number; // Total duration in seconds taken to complete
  notes: string[];
  attachments: string[];
  isOverdue?: boolean;
  isAlerted?: boolean;
  history?: TaskHistoryEntry[];
  version?: number;
  updatedAt?: string;
}

export type ChecklistType = 'Daily' | 'Weekly' | 'Monthly';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string; // User ID
  note?: string;
}

export interface Checklist {
  id: string;
  type: ChecklistType;
  title: string;
  description: string;
  departmentId?: string; // Which department this fixed checklist belongs to
  assignedToId?: string | null; // Automatically assigned to an available employee
  items: ChecklistItem[];
  lastResetPeriod?: string;
  version?: number;
  updatedAt?: string;
}

export interface ChecklistHistory {
  date: string; // YYYY-MM-DD
  type: ChecklistType;
  itemsAttempted: number;
  itemsCompleted: number;
  completedBy: string; // User ID
  timestamp: string; // ISO string
  items?: ChecklistItem[];
}

export interface ProjectMilestone {
  id: string;
  title: string;
  deadline: string;
  completed: boolean;
}

export interface ProjectDocument {
  id: string;
  name: string;
  category: string;
  uploadedAt: string;
  size: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  progress: number; // 0 to 100
  managerId: string;
  teamIds: string[]; // User IDs of coordinators
  milestones: ProjectMilestone[];
  documents: ProjectDocument[];
  deadline: string;
  delayStatus: boolean; // true if any milestone is missed or delayed
  notes: string[];
  version?: number;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  category: 'Task' | 'Checklist' | 'Project' | 'Complaint' | 'Alert' | 'System';
  createdAt: string;
  isRead: boolean;
  channels: {
    inApp: boolean;
    telegram: boolean;
    whatsapp?: boolean;
    email: boolean;
  };
  recipientRole?: UserRole;
  recipientUserId?: string; // Private notification: visible only to this account
  // Acknowledgement makes the notification disappear permanently for this recipient.
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  eventKey?: string; // Idempotency key: one notification per business event + recipient.
  relatedEntityId?: string;
}

/* =========================================================
   COMPLAINTS (Exclusivi)
========================================================= */

export type ComplaintPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type ComplaintStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface ComplaintHistoryEntry {
  id: string;
  type: 'create' | 'assign' | 'start' | 'update' | 'resolve' | 'close' | 'note';
  userId: string;
  userName: string;
  timestamp: string;
  details?: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  source: 'Exclusivi';
  departmentId: string;
  assignedToId?: string | null;
  createdBy: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  history?: ComplaintHistoryEntry[];
  version?: number;
}

/* =========================================================
   AUDIT LOG (derived, server-aggregated from task / complaint /
   checklist history entries — see GET /api/audit-log)
========================================================= */
export type AuditEntityType = 'Task' | 'Complaint' | 'Checklist';

export interface AuditLogEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  entityTitle: string;
  action: string; // e.g. 'create' | 'assign' | 'start' | 'complete' | 'resolve' ...
  userId: string;
  userName: string;
  departmentId?: string;
  timestamp: string; // ISO string
  details?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface SystemData {
  users: User[];
  departments: Department[];
  tasks: Task[];
  checklists: Checklist[];
  checklistHistory: ChecklistHistory[];
  projects: Project[];
  complaints: Complaint[];
  notifications: Notification[];
  chats: ChatMessage[];
  telegramConfig?: {
    enabled: boolean;
    chatId: string;
    botToken: string;
  };
}
