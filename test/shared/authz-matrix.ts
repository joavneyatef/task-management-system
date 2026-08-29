/**
 * Single source of truth for "who can do what".
 *
 * Phase 2 feeds this into src/utils/permissions.ts unit tests.
 * Phase 4 feeds it into Supertest route-guard tests.
 * Phase 6 feeds it into Playwright UI-visibility tests.
 * Phase 7 feeds it into privilege-escalation tests.
 *
 * Change a permission rule -> update one row here -> every layer's tests fail
 * until the code and all layers agree again.
 */

export type Role = 'gm' | 'dir' | 'mgr' | 'asst';
export const ROLES: readonly Role[] = ['gm', 'dir', 'mgr', 'asst'] as const;

export interface Capability {
  /** stable id used in test names */
  cap: string;
  /** human description */
  describe: string;
  /** a representative guarded route: [method, pathTemplate] */
  route: [method: 'get' | 'post' | 'put' | 'delete', path: string];
  /** roles allowed to perform it; every other role must be rejected (403) */
  allow: readonly Role[];
}

export const AUTHZ_MATRIX: readonly Capability[] = [
  {
    cap: 'delete-user',
    describe: "Delete a user account",
    route: ['delete', '/api/users/asst'],
    allow: ['gm'],
  },
  {
    cap: 'delete-task',
    describe: 'Delete a task',
    route: ['delete', '/api/tasks/task-seed-1'],
    allow: ['gm', 'dir', 'mgr'],
  },
  {
    cap: 'delete-complaint',
    describe: 'Delete a complaint',
    route: ['delete', '/api/complaints/cmp-seed-1'],
    allow: ['gm', 'dir', 'mgr'],
  },
  {
    cap: 'report-completed-tasks',
    describe: 'Read the completed-tasks report',
    route: ['get', '/api/reports/completed-tasks'],
    allow: ['gm'],
  },
  {
    cap: 'report-performance',
    describe: 'Read the performance report',
    route: ['get', '/api/reports/performance'],
    allow: ['gm'],
  },
  {
    cap: 'audit-log',
    describe: 'Open the audit log',
    route: ['get', '/api/audit-log'],
    allow: ['gm', 'dir', 'mgr'],
  },
] as const;
