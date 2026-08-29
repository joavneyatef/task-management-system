/**
 * Phase 5 — API contract schemas.
 *
 * One Zod schema per response the browser actually consumes. The rule for what
 * goes in a schema: **exactly the fields the client reads**, nothing more.
 * Every object is `.passthrough()` so a server that returns extra keys still
 * satisfies the contract — the contract is the intersection both sides must
 * honour, not a full mirror of either payload.
 *
 * These schemas are exercised from two directions:
 *   - contract.api.server.spec.ts  — real Express + Prisma responses (Supertest)
 *   - contract.msw.web.spec.ts     — the MSW mock handlers the web suite runs on
 * If the two ever drift, one of those specs goes red.
 */
import { z } from 'zod';

/** `z.object(...).passthrough()` — tolerate unknown keys, keep them at runtime. */
const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

/* ------------------------------------------------------------------ *
 * Enumerations — kept in lock-step with src/types.ts by contract.types.web.spec.ts
 * ------------------------------------------------------------------ */
export const UserRoleSchema = z.enum([
  'GM', 'Director', 'Manager', 'Assistant', 'GeneralManager', 'Coordinator',
]);
export const UserStatusSchema = z.enum(['Active', 'On Leave', 'Off Duty']);
export const TaskPrioritySchema = z.enum(['Critical', 'High', 'Medium', 'Low']);
export const TaskStatusSchema = z.enum(['Open', 'In Progress', 'Completed', 'Archived']);
export const ChecklistTypeSchema = z.enum(['Daily', 'Weekly', 'Monthly']);
export const NotificationCategorySchema = z.enum([
  'Task', 'Checklist', 'Project', 'Complaint', 'Alert', 'System',
]);
export const ComplaintStatusSchema = z.enum(['Open', 'In Progress', 'Resolved', 'Closed']);
export const ComplaintPrioritySchema = z.enum(['Critical', 'High', 'Medium', 'Low']);
export const AuditEntityTypeSchema = z.enum(['Task', 'Complaint', 'Checklist']);

/* ------------------------------------------------------------------ *
 * Domain objects
 * ------------------------------------------------------------------ */

/**
 * A user as the client is allowed to see it. The credential columns
 * (`password`, `pin`) must never appear — `sanitizeStateForClient` /
 * `publicUser` strip them server-side, and this refinement is the tripwire.
 */
export const PublicUserSchema = loose({
  id: z.string().min(1),
  name: z.string(),
  role: UserRoleSchema,
  email: z.string(),
  status: UserStatusSchema,
}).refine(
  (u) => !('password' in u) && !('pin' in u),
  { message: 'user payload leaks a credential field (password/pin)' },
);

export const DepartmentSchema = loose({
  id: z.string().min(1),
  name: z.string(),
  managerIds: z.array(z.string()),
  isActive: z.boolean(),
});

export const TaskSchema = loose({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  assigneeId: z.string().nullable(),
  createdBy: z.string(),
  deadline: z.string(),
  createdAt: z.string(),
  notes: z.array(z.string()),
  attachments: z.array(z.string()),
});

export const ChecklistItemSchema = loose({
  id: z.string().min(1),
  text: z.string(),
  completed: z.boolean(),
});

export const ChecklistSchema = loose({
  id: z.string().min(1),
  type: ChecklistTypeSchema,
  title: z.string(),
  items: z.array(ChecklistItemSchema),
});

export const NotificationSchema = loose({
  id: z.string().min(1),
  title: z.string(),
  message: z.string(),
  category: NotificationCategorySchema,
  createdAt: z.string(),
  isRead: z.boolean(),
  channels: loose({
    inApp: z.boolean(),
    telegram: z.boolean(),
    email: z.boolean(),
  }),
});

export const ComplaintSchema = loose({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  source: z.literal('Exclusivi'),
  departmentId: z.string(),
  createdBy: z.string(),
  status: ComplaintStatusSchema,
  priority: ComplaintPrioritySchema,
  createdAt: z.string(),
});

export const ChatMessageSchema = loose({
  id: z.string().min(1),
  sender: z.enum(['user', 'assistant']),
  text: z.string(),
  timestamp: z.string(),
});

/* ------------------------------------------------------------------ *
 * Response envelopes
 * ------------------------------------------------------------------ */

/** `GET /api/state`, `POST /api/state`, and the `state` field of mutation replies. */
export const SystemDataSchema = loose({
  users: z.array(PublicUserSchema),
  departments: z.array(DepartmentSchema),
  tasks: z.array(TaskSchema),
  checklists: z.array(ChecklistSchema),
  checklistHistory: z.array(z.unknown()),
  projects: z.array(z.unknown()),
  complaints: z.array(ComplaintSchema),
  notifications: z.array(NotificationSchema),
  chats: z.array(ChatMessageSchema),
});

/** `{ error, message? }` — every 4xx/5xx the client branches on. */
export const ErrorBodySchema = loose({
  error: z.string(),
  message: z.string().optional(),
});

/** `POST /api/auth/login`, `/signup`, `PUT /api/auth/profile` success shape. */
export const AuthOkSchema = loose({
  success: z.literal(true),
  user: PublicUserSchema,
});

/** `GET /api/auth/me` */
export const MeSchema = loose({ user: PublicUserSchema });

/** `GET /api/auth/users` — the public directory the login screen reads. */
export const UsersDirectorySchema = loose({
  users: z.array(PublicUserSchema),
  departments: z.array(DepartmentSchema),
});

/** `GET /api/auth/departments` */
export const DepartmentsSchema = loose({ departments: z.array(DepartmentSchema) });

/** `POST /api/notifications/:id/acknowledge` — client reads `data.notification`. */
export const AcknowledgeSchema = loose({ notification: NotificationSchema });

/** `POST /api/tasks/:id/switch` — client reads `data.task`. */
export const TaskSwitchSchema = loose({ task: TaskSchema });

/** `DELETE /api/tasks|complaints|users/:id` — client only needs 2xx, but the body carries the trimmed state. */
export const StateMutationSchema = loose({
  success: z.boolean(),
  state: SystemDataSchema,
});

/** `GET /api/env`, `POST /api/env` */
export const EnvSchema = loose({ env: z.enum(['production', 'test']) });

/** `GET /api/audit-log` (json) — client reads `data.rows`. */
export const AuditRowSchema = loose({
  id: z.string(),
  entityType: AuditEntityTypeSchema,
  entityId: z.string(),
  entityTitle: z.string(),
  action: z.string(),
  userId: z.string(),
  userName: z.string(),
  timestamp: z.string(),
});
export const AuditLogResponseSchema = loose({ rows: z.array(AuditRowSchema) });

/** `GET /api/reports/*` (json) — the shared report envelope from `sendReport`. */
export const ReportEnvelopeSchema = loose({
  generatedAt: z.string(),
  count: z.number(),
  rows: z.array(z.record(z.unknown())),
});

/** `GET /api/backups` — one row per file on disk. */
export const BackupMetaSchema = loose({
  id: z.string(),
  filename: z.string(),
  timestamp: z.string(),
  size: z.number(),
  createdBy: z.string(),
  type: z.string(),
});
export const BackupListSchema = z.array(BackupMetaSchema);

/** `POST /api/backups/create` — client reads `data.filename`. */
export const BackupCreateSchema = loose({ filename: z.string() });

/** `POST /api/backups/upload` — client reads `data.filename` + `data.metadata`. */
export const BackupUploadSchema = loose({
  filename: z.string(),
  metadata: loose({ type: z.string() }),
});

export type SystemDataContract = z.infer<typeof SystemDataSchema>;
export type PublicUserContract = z.infer<typeof PublicUserSchema>;
export type TaskContract = z.infer<typeof TaskSchema>;
export type NotificationContract = z.infer<typeof NotificationSchema>;
