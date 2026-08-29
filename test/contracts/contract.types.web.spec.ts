/**
 * Phase 5 — contract tests, type level.
 *
 * Zod schemas and src/types.ts are two hand-maintained descriptions of the same
 * payloads. These `expectTypeOf` assertions fail at `tsc` time (and in the
 * runner) the moment an enum or a field type drifts between them — e.g. someone
 * adds a TaskStatus in types.ts but forgets the schema, or vice versa.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  AuditEntityType,
  ChecklistType,
  Notification,
  Task,
  TaskPriority,
  TaskStatus,
  User,
  UserRole,
  UserStatus,
} from '../../src/types';
import type {
  AuditEntityTypeSchema,
  ChecklistTypeSchema,
  NotificationCategorySchema,
  NotificationSchema,
  PublicUserSchema,
  TaskPrioritySchema,
  TaskSchema,
  TaskStatusSchema,
  UserRoleSchema,
  UserStatusSchema,
} from './schemas';

type Infer<S> = S extends z.ZodType ? z.infer<S> : never;

describe('@contract enum parity: schema ⇄ src/types', () => {
  it('UserRole', () => {
    expectTypeOf<Infer<typeof UserRoleSchema>>().toEqualTypeOf<UserRole>();
  });
  it('UserStatus', () => {
    expectTypeOf<Infer<typeof UserStatusSchema>>().toEqualTypeOf<UserStatus>();
  });
  it('TaskPriority', () => {
    expectTypeOf<Infer<typeof TaskPrioritySchema>>().toEqualTypeOf<TaskPriority>();
  });
  it('TaskStatus', () => {
    expectTypeOf<Infer<typeof TaskStatusSchema>>().toEqualTypeOf<TaskStatus>();
  });
  it('ChecklistType', () => {
    expectTypeOf<Infer<typeof ChecklistTypeSchema>>().toEqualTypeOf<ChecklistType>();
  });
  it('Notification.category', () => {
    expectTypeOf<Infer<typeof NotificationCategorySchema>>().toEqualTypeOf<Notification['category']>();
  });
  it('AuditEntityType', () => {
    expectTypeOf<Infer<typeof AuditEntityTypeSchema>>().toEqualTypeOf<AuditEntityType>();
  });
});

describe('@contract field parity: schema ⇄ src/types', () => {
  it('PublicUser required fields line up with User', () => {
    type U = Infer<typeof PublicUserSchema>;
    expectTypeOf<U['id']>().toEqualTypeOf<User['id']>();
    expectTypeOf<U['role']>().toEqualTypeOf<User['role']>();
    expectTypeOf<U['status']>().toEqualTypeOf<User['status']>();
    expectTypeOf<U['email']>().toEqualTypeOf<User['email']>();
  });

  it('Task required fields line up with Task', () => {
    type T = Infer<typeof TaskSchema>;
    expectTypeOf<T['id']>().toEqualTypeOf<Task['id']>();
    expectTypeOf<T['priority']>().toEqualTypeOf<Task['priority']>();
    expectTypeOf<T['status']>().toEqualTypeOf<Task['status']>();
    expectTypeOf<T['assigneeId']>().toEqualTypeOf<Task['assigneeId']>();
    expectTypeOf<T['notes']>().toEqualTypeOf<Task['notes']>();
    expectTypeOf<T['attachments']>().toEqualTypeOf<Task['attachments']>();
  });

  it('Notification required fields line up with Notification', () => {
    type N = Infer<typeof NotificationSchema>;
    expectTypeOf<N['id']>().toEqualTypeOf<Notification['id']>();
    expectTypeOf<N['category']>().toEqualTypeOf<Notification['category']>();
    expectTypeOf<N['isRead']>().toEqualTypeOf<Notification['isRead']>();
    expectTypeOf<N['channels']['inApp']>().toEqualTypeOf<Notification['channels']['inApp']>();
  });

  it('a real Task satisfies the schema-required Task fields', () => {
    // Structural: the app's Task must carry everything the contract promises the client.
    expectTypeOf<Task>().toExtend<{
      id: string;
      title: string;
      priority: TaskPriority;
      status: TaskStatus;
      assigneeId: string | null;
      notes: string[];
      attachments: string[];
    }>();
  });
});
