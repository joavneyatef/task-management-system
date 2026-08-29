/**
 * Baseline happy-path HTTP handlers for the frontend test suite.
 *
 * These describe the "everything works" case. Individual specs override a single
 * endpoint for error / edge cases with `mswServer.use(http.<method>(...))`.
 * Phase 3 expands this set to every endpoint the client calls (see Appendix B of
 * the Test Cycle plan).
 */
import { HttpResponse, http } from 'msw';
import { makeChecklist, makeNotification, makeOrg, makeTask } from '../factories';

const org = makeOrg();

export const systemData = () => ({
  users: org.all,
  departments: [
    { id: 'dept-it', name: 'IT Department', managerIds: ['mgr'], complaintReasons: [], isActive: true },
    { id: 'dept-fnb', name: 'F&B Department', managerIds: [], complaintReasons: [], isActive: true },
  ],
  tasks: [makeTask({ id: 'task-seed-1', assigneeIds: ['asst'] })],
  checklists: [makeChecklist({ id: 'cl-seed-1' })],
  checklistHistory: [],
  projects: [],
  complaints: [],
  notifications: [],
  chats: [],
});

export const handlers = [
  http.get('/api/auth/me', () => HttpResponse.json({ user: org.mgr })),
  // Envelope shape must match the real server: { users, departments }, not a bare array.
  http.get('/api/auth/users', () => HttpResponse.json({ users: org.all, departments: systemData().departments })),
  http.get('/api/auth/departments', () => HttpResponse.json({ departments: systemData().departments })),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.password) {
      return HttpResponse.json({ error: 'MISSING_FIELDS', message: 'Please enter your name/email and password.' }, { status: 400 });
    }
    return HttpResponse.json({ success: true, user: org.mgr });
  }),
  http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),

  http.get('/api/state', () => HttpResponse.json(systemData())),
  http.post('/api/state', async ({ request }) => {
    // Echo the incoming state back as the accepted server state.
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json(body);
  }),

  http.get('/api/env', () => HttpResponse.json({ env: 'production' })),
  // Client reads `data.notification` off this response — the mock must return it.
  http.post('/api/notifications/:id/acknowledge', ({ params }) =>
    HttpResponse.json({
      success: true,
      notification: makeNotification({ id: String(params.id), acknowledgedAt: new Date().toISOString() }),
    }),
  ),

  http.get('/api/audit-log', () => HttpResponse.json({ rows: [] })),
  http.delete('/api/users/:id', () => HttpResponse.json({ success: true })),

  http.get('/api/backups', () => HttpResponse.json([])),
  http.post('/api/backups/create', () => HttpResponse.json({ filename: 'backup-stub.json' })),
  http.post('/api/backups/restore', () => HttpResponse.json({ state: {} })),
  http.post('/api/backups/restore-test', () => HttpResponse.json({ state: {} })),
];
