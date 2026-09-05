import { describe, expect, it } from 'vitest';
import {
  makeChecklist,
  makeComplaint,
  makeOrg,
  makeTask,
  makeUser,
} from '../../test/factories';
import type { SystemData } from '../../src/types';
import {
  authorizeStateMutation,
  deepEqual,
  didItemChange,
  mergeStateWithServer,
  publicUser,
  sanitizeStateForClient,
} from './stateMerge';

/** A complete-enough SystemData for the merge/authorize functions. */
const makeState = (over: Partial<SystemData> = {}): SystemData =>
  ({
    users: [],
    departments: [],
    tasks: [],
    checklists: [],
    checklistHistory: [],
    projects: [],
    complaints: [],
    notifications: [],
    chats: [],
    ...over,
  }) as SystemData;

// -------------------------------------------------------------------------------------

describe('deepEqual', () => {
  it('compares primitives and null', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
  });

  it('is order-independent on keys and recurses into nested structures', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toBe(true);
    expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toBe(false);
  });

  it('ignores the metadata keys version / updatedAt / lockedBy', () => {
    expect(deepEqual({ title: 'x', version: 1 }, { title: 'x', version: 99 })).toBe(true);
    expect(deepEqual({ title: 'x', updatedAt: 'a', lockedBy: 'u1' }, { title: 'x' })).toBe(true);
  });

  it('treats a differing count of *meaningful* keys as not equal', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('treats absent / undefined / null as the same "not set" value', () => {
    // A task the server returns with `lastTransferredById: undefined` must
    // round-trip equal after JSON.stringify drops the key — otherwise an
    // untouched task looks modified and authorizeStateMutation 403s the sync.
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: null }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: null }, { a: 1, b: undefined })).toBe(true);
    expect(deepEqual({ lastTransferredById: null, title: 'x' }, { title: 'x' })).toBe(true);
    // a real value on one side only is still a difference
    expect(deepEqual({ a: 1, b: 0 }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1, b: '' }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1, b: false }, { a: 1 })).toBe(false);
  });
});

describe('didItemChange', () => {
  it('is the negation of a metadata-insensitive deepEqual', () => {
    expect(didItemChange({ a: 1 }, { a: 1 })).toBe(false);
    expect(didItemChange({ a: 1 }, { a: 2 })).toBe(true);
    expect(didItemChange({ t: 'x', version: 1 }, { t: 'x', version: 2 })).toBe(false);
  });
});

describe('publicUser / sanitizeStateForClient', () => {
  it('strips password and pin from a single user', () => {
    const clean = publicUser(makeUser({ password: 'scrypt$aa$bb', pin: 'scrypt$cc$dd' } as any));
    expect(clean).not.toHaveProperty('password');
    expect(clean).not.toHaveProperty('pin');
  });

  it('strips credentials from every user in a state snapshot', () => {
    const state = makeState({
      users: [makeUser({ password: 'x', pin: 'y' } as any), makeUser({ password: 'z' } as any)],
    });
    for (const u of sanitizeStateForClient(state).users) {
      expect(u).not.toHaveProperty('password');
      expect(u).not.toHaveProperty('pin');
    }
  });
});

// -------------------------------------------------------------------------------------

describe('mergeStateWithServer — tasks', () => {
  it('adds a task that is new to the server with version 1', () => {
    const server = makeState({ users: [makeUser({ id: 'u1' })] });
    const incoming = makeState({ users: server.users, tasks: [makeTask({ id: 't-new', version: undefined })] });

    const { mergedState } = mergeStateWithServer(incoming, server, 'u1');
    const t = mergedState.tasks.find((x) => x.id === 't-new')!;
    expect(t.version).toBe(1);
    expect(t.updatedAt).toBeTruthy();
  });

  it('keeps both edits when two clients touch different tasks', () => {
    const t1 = makeTask({ id: 't1', title: 'one', version: 1 });
    const t2 = makeTask({ id: 't2', title: 'two', version: 1 });
    const server = makeState({ users: [makeUser({ id: 'u1' })], tasks: [t1, t2] });
    const incoming = makeState({
      users: server.users,
      tasks: [{ ...t1, title: 'one EDITED' }, { ...t2 }],
    });

    const { mergedState } = mergeStateWithServer(incoming, server, 'u1');
    expect(mergedState.tasks.find((x) => x.id === 't1')!.title).toBe('one EDITED');
    expect(mergedState.tasks.find((x) => x.id === 't2')!.title).toBe('two');
  });

  it('accepts a client edit and bumps version to server+1', () => {
    const t1 = makeTask({ id: 't1', title: 'orig', version: 4 });
    const server = makeState({ users: [makeUser({ id: 'u1' })], tasks: [t1] });
    const incoming = makeState({ users: server.users, tasks: [{ ...t1, title: 'changed', version: 4 }] });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.tasks[0];
    expect(merged.title).toBe('changed');
    expect(merged.version).toBe(5);
  });

  it('discards a stale client edit in favour of the server copy — and reports NO conflict', () => {
    const serverTask = makeTask({ id: 't1', title: 'server wins', status: 'Completed', version: 5 });
    const server = makeState({ users: [makeUser({ id: 'u1' })], tasks: [serverTask] });
    const incoming = makeState({
      users: server.users,
      tasks: [makeTask({ id: 't1', title: 'stale client', status: 'Archived', version: 3 })],
    });

    const { mergedState, conflicts } = mergeStateWithServer(incoming, server, 'u1');
    expect(mergedState.tasks[0].title).toBe('server wins');
    expect(mergedState.tasks[0].version).toBe(5);
    // The merge silently prefers the server; the `conflicts` channel stays empty
    // by design (see the note in mergeStateWithServer — the live client sends
    // version-stale snapshots during normal sync races, so 409 is not raised).
    expect(conflicts).toEqual([]);
  });

  it('never silently deletes a server task the client did not send back', () => {
    const t1 = makeTask({ id: 't1' });
    const t2 = makeTask({ id: 't2' });
    const server = makeState({ users: [makeUser({ id: 'u1' })], tasks: [t1, t2] });
    const incoming = makeState({ users: server.users, tasks: [t1] });

    const ids = mergeStateWithServer(incoming, server, 'u1').mergedState.tasks.map((t) => t.id);
    expect(ids.sort()).toEqual(['t1', 't2']);
  });
});

describe('mergeStateWithServer — server-generated task notifications', () => {
  const orgState = () => {
    const { all } = makeOrg();
    return makeState({ users: all });
  };

  it('notifies each recipient of a brand-new task, but not the actor', () => {
    const server = orgState();
    const incoming = makeState({
      users: server.users,
      tasks: [makeTask({ id: 't1', title: 'Fix switch', createdBy: 'mgr', assigneeIds: ['asst', 'mgr'] })],
    });

    const { mergedState } = mergeStateWithServer(incoming, server, 'mgr');
    const newNotifs = mergedState.notifications.filter((n) => n.eventKey?.startsWith('task:t1:new:'));
    expect(newNotifs.map((n) => n.recipientUserId)).toEqual(['asst']); // 'mgr' is the actor -> skipped
  });

  it('ignores a recipient who does not exist on the server', () => {
    const server = orgState();
    const incoming = makeState({
      users: server.users,
      tasks: [makeTask({ id: 't1', createdBy: 'mgr', assigneeIds: ['ghost'] })],
    });
    const { mergedState } = mergeStateWithServer(incoming, server, 'mgr');
    expect(mergedState.notifications.filter((n) => n.eventKey?.includes(':new:'))).toHaveLength(0);
  });

  it('is idempotent — an already-present notification for the same event is not duplicated', () => {
    const server = orgState();
    server.notifications = [
      { id: 'pre', title: 'x', message: 'y', category: 'Task', createdAt: new Date().toISOString(), isRead: false, recipientUserId: 'asst', eventKey: 'task:t1:new:asst', channels: { inApp: true, telegram: true, email: true } },
    ];
    const incoming = makeState({
      users: server.users,
      tasks: [makeTask({ id: 't1', createdBy: 'mgr', assigneeIds: ['asst'] })],
    });
    const { mergedState } = mergeStateWithServer(incoming, server, 'mgr');
    expect(mergedState.notifications.filter((n) => n.eventKey === 'task:t1:new:asst')).toHaveLength(1);
  });

  it('keeps the existing DB id when the client sends its own optimistic copy of the same event, and lets the client read/ack flags win', () => {
    const server = orgState();
    server.notifications = [
      { id: 'db-row', title: 'New task', message: 'y', category: 'Task', createdAt: '2026-09-01T00:00:00Z', isRead: false, recipientUserId: 'asst', eventKey: 'task:t1:new:asst', channels: { inApp: true, telegram: true, email: true } },
    ];
    const incoming = makeState({
      users: server.users,
      // Client's locally-minted copy: different random id, same event, now read + acknowledged.
      notifications: [
        { id: 'client-random', title: 'New task', message: 'y', category: 'Task', createdAt: '2026-09-01T00:00:00Z', isRead: true, acknowledgedAt: '2026-09-02T00:00:00Z', recipientUserId: 'asst', eventKey: 'task:t1:new:asst', channels: { inApp: true, telegram: true, email: true } },
      ],
    });
    const { mergedState } = mergeStateWithServer(incoming, server, 'mgr');
    const rows = mergedState.notifications.filter((n) => n.eventKey === 'task:t1:new:asst');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('db-row'); // persisted identity is preserved — no orphan
    expect(rows[0].isRead).toBe(true); // client's read state still wins
    expect(rows[0].acknowledgedAt).toBe('2026-09-02T00:00:00Z');
  });

  it('on completion, notifies the switch owner (not the direct sender) plus every GM', () => {
    const server = orgState();
    const serverTask = makeTask({ id: 't1', title: 'Rack audit', status: 'In Progress', createdBy: 'gm', assignedBy: 'dir', lastTransferredById: 'mgr', assigneeIds: ['asst'] });
    server.tasks = [serverTask];
    const incoming = makeState({
      users: server.users,
      tasks: [{ ...serverTask, status: 'Completed', completedById: 'asst', completedAt: new Date().toISOString() }],
    });

    const { mergedState } = mergeStateWithServer(incoming, server, 'asst');
    const completed = mergedState.notifications.filter((n) => n.eventKey?.includes(':completed:'));
    const recipients = completed.map((n) => n.recipientUserId).sort();
    expect(recipients).toContain('mgr'); // the switch owner
    expect(recipients).toContain('gm'); // GM always
    expect(recipients).not.toContain('dir'); // direct sender is skipped once a switch happened
  });

  it('on a task moving into In Progress, notifies the assigning owner and the GM', () => {
    const server = orgState();
    const serverTask = makeTask({ id: 't3', title: 'UPS check', status: 'Open', createdBy: 'gm', assignedBy: 'mgr', assigneeIds: ['asst'] });
    server.tasks = [serverTask];
    const incoming = makeState({
      users: server.users,
      tasks: [{ ...serverTask, status: 'In Progress', startedAt: new Date().toISOString() }],
    });

    const recipients = mergeStateWithServer(incoming, server, 'asst')
      .mergedState.notifications.filter((n) => n.eventKey?.includes(':started:'))
      .map((n) => n.recipientUserId)
      .sort();
    expect(recipients).toEqual(['gm', 'mgr']);
  });

  it('on completion without a switch, notifies the direct sender plus the GM', () => {
    const server = orgState();
    const serverTask = makeTask({ id: 't2', title: 'Patch panel', status: 'In Progress', createdBy: 'gm', assignedBy: 'mgr', assigneeIds: ['asst'] });
    server.tasks = [serverTask];
    const incoming = makeState({
      users: server.users,
      tasks: [{ ...serverTask, status: 'Completed', completedById: 'asst', completedAt: new Date().toISOString() }],
    });

    const recipients = mergeStateWithServer(incoming, server, 'asst')
      .mergedState.notifications.filter((n) => n.eventKey?.includes(':completed:'))
      .map((n) => n.recipientUserId)
      .sort();
    expect(recipients).toEqual(['gm', 'mgr']);
  });

  it('falls back to the acting user for the completed-by name when completedById is unset', () => {
    const server = orgState();
    const serverTask = makeTask({ id: 't4', title: 'Cable trace', status: 'In Progress', createdBy: 'gm', assignedBy: 'mgr', assigneeIds: ['asst'] });
    server.tasks = [serverTask];
    const incoming = makeState({
      users: server.users,
      tasks: [{ ...serverTask, status: 'Completed', completedById: undefined, completedAt: new Date().toISOString() }],
    });

    const note = mergeStateWithServer(incoming, server, 'asst')
      .mergedState.notifications.find((n) => n.eventKey?.includes(':completed:') && n.recipientUserId === 'gm')!;
    expect(note.message).toContain('Sam Assistant'); // acting user's name, not "Employee"
  });
});

describe('mergeStateWithServer — checklists, projects, complaints, users', () => {
  it('bumps an edited existing checklist and keeps a client-new one', () => {
    const server = makeState({ users: [makeUser({ id: 'u1' })], checklists: [makeChecklist({ id: 'c1', version: 1 })] });
    const incoming = makeState({
      users: server.users,
      checklists: [makeChecklist({ id: 'c1', title: 'renamed', version: 1 }), makeChecklist({ id: 'c-new', title: 'skeleton' })],
    });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.checklists;
    // The freshly auto-provisioned skeleton must survive the merge — mapping only
    // over the DB rows would drop it and the client would re-add it forever.
    expect(merged.map((c) => c.id).sort()).toEqual(['c-new', 'c1']);
    expect(merged.find((c) => c.id === 'c1')).toMatchObject({ title: 'renamed', version: 2 });
    expect(merged.find((c) => c.id === 'c-new')).toMatchObject({ title: 'skeleton', version: 1 });
  });

  it('does not let an empty client checklist wipe items already saved on the server', () => {
    const server = makeState({
      users: [makeUser({ id: 'u1' })],
      checklists: [makeChecklist({ id: 'c1', version: 2, items: [{ id: 'i1', text: 'Check UPS', completed: true }] as any })],
    });
    const incoming = makeState({
      users: server.users,
      checklists: [makeChecklist({ id: 'c1', version: 2, items: [] })],
    });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.checklists;
    expect(merged.find((c) => c.id === 'c1')!.items).toHaveLength(1);
    expect(merged.find((c) => c.id === 'c1')).toMatchObject({ version: 2 });
  });

  it('discards a stale checklist edit and keeps an unchanged one untouched', () => {
    const c1 = makeChecklist({ id: 'c1', title: 'server', version: 5 });
    const c2 = makeChecklist({ id: 'c2', title: 'same', version: 2 });
    const server = makeState({ users: [makeUser({ id: 'u1' })], checklists: [c1, c2] });
    const incoming = makeState({
      users: server.users,
      checklists: [makeChecklist({ id: 'c1', title: 'stale', version: 3 }), { ...c2 }],
    });
    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.checklists;
    expect(merged.find((c) => c.id === 'c1')).toMatchObject({ title: 'server', version: 5 });
    expect(merged.find((c) => c.id === 'c2')).toBe(c2);
  });

  it('bumps an edited existing project and rejects a stale one', () => {
    const p1 = { id: 'p1', name: 'orig', version: 4 } as any;
    const p2 = { id: 'p2', name: 'srv', version: 9 } as any;
    const server = makeState({ users: [makeUser({ id: 'u1' })], projects: [p1, p2] });
    const incoming = makeState({
      users: server.users,
      projects: [{ id: 'p1', name: 'edited', version: 4 } as any, { id: 'p2', name: 'stale', version: 2 } as any],
    });
    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.projects;
    expect(merged.find((p) => p.id === 'p1')).toMatchObject({ name: 'edited', version: 5 });
    expect(merged.find((p) => p.id === 'p2')).toMatchObject({ name: 'srv', version: 9 });
  });

  it('bumps an edited existing complaint and rejects a stale one', () => {
    const server = makeState({
      users: [makeUser({ id: 'u1' })],
      complaints: [makeComplaint({ id: 'x1', title: 'orig', version: 3 }), makeComplaint({ id: 'x2', title: 'srv', version: 7 })],
    });
    const incoming = makeState({
      users: server.users,
      complaints: [makeComplaint({ id: 'x1', title: 'edited', version: 3 }), makeComplaint({ id: 'x2', title: 'stale', version: 1 })],
    });
    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.complaints;
    expect(merged.find((c) => c.id === 'x1')).toMatchObject({ title: 'edited', version: 4 });
    expect(merged.find((c) => c.id === 'x2')).toMatchObject({ title: 'srv', version: 7 });
  });

  it('leaves an unchanged existing project / complaint exactly as the server had it', () => {
    const proj = { id: 'p1', name: 'stable', version: 2 } as any;
    const cmp = makeComplaint({ id: 'x1', title: 'stable', version: 2 });
    const server = makeState({ users: [makeUser({ id: 'u1' })], projects: [proj], complaints: [cmp] });
    const incoming = makeState({ users: server.users, projects: [{ ...proj }], complaints: [{ ...cmp }] });
    const { mergedState } = mergeStateWithServer(incoming, server, 'u1');
    expect(mergedState.projects[0]).toBe(proj);
    expect(mergedState.complaints[0]).toBe(cmp);
  });

  it('adds a new project with version 1 and preserves a project the client dropped', () => {
    const server = makeState({ users: [makeUser({ id: 'u1' })], projects: [{ id: 'p1', name: 'keep' } as any] });
    const incoming = makeState({ users: server.users, projects: [{ id: 'p2', name: 'fresh' } as any] });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.projects;
    expect(merged.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(merged.find((p) => p.id === 'p2')!.version).toBe(1);
  });

  it('adds a new complaint with version 1 and preserves one the client dropped', () => {
    const server = makeState({ users: [makeUser({ id: 'u1' })], complaints: [makeComplaint({ id: 'x1' })] });
    const incoming = makeState({ users: server.users, complaints: [makeComplaint({ id: 'x2', version: undefined })] });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.complaints;
    expect(merged.map((c) => c.id).sort()).toEqual(['x1', 'x2']);
    expect(merged.find((c) => c.id === 'x2')!.version).toBe(1);
  });

  it('never lets a state sync overwrite a stored password / pin hash', () => {
    const serverUser = makeUser({ id: 'u1' });
    (serverUser as unknown as Record<string, unknown>).password = 'scrypt$real$hash';
    (serverUser as unknown as Record<string, unknown>).pin = 'scrypt$real$pin';
    const server = makeState({ users: [serverUser] });
    const incoming = makeState({
      users: [{ ...makeUser({ id: 'u1', name: 'Renamed' }), password: 'attacker-plaintext', pin: '0000' } as any],
    });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.users[0] as unknown as Record<string, unknown>;
    expect(merged.name).toBe('Renamed'); // profile field still updates
    expect(merged.password).toBe('scrypt$real$hash');
    expect(merged.pin).toBe('scrypt$real$pin');
  });

  it('hashes a plaintext password on a genuinely new user', () => {
    const server = makeState({ users: [] });
    const incoming = makeState({
      users: [{ ...makeUser({ id: 'new' }), password: 'PlainText1' } as any],
    });
    const created = mergeStateWithServer(incoming, server, 'admin').mergedState.users[0] as unknown as Record<string, unknown>;
    expect(String(created.password)).toMatch(/^scrypt\$/);
  });

  it('honours a client-side user deletion (unlike tasks, users are not preserved)', () => {
    const server = makeState({ users: [makeUser({ id: 'keep' }), makeUser({ id: 'remove-me' })] });
    const incoming = makeState({ users: [makeUser({ id: 'keep' })] });
    const ids = mergeStateWithServer(incoming, server, 'admin').mergedState.users.map((u) => u.id);
    expect(ids).toEqual(['keep']);
  });

  it('merges incoming notifications by identity, letting a client ack win without dropping other accounts', () => {
    const base = (over: Record<string, unknown>) => ({
      id: 'n', title: 't', message: 'm', category: 'Task' as const, createdAt: '2026-08-29T10:00:00Z',
      isRead: false, channels: { inApp: true, telegram: false, email: false }, ...over,
    });
    const server = makeState({
      users: [makeUser({ id: 'u1' })],
      notifications: [
        base({ id: 'a', recipientUserId: 'u1', eventKey: 'task:t1:new:u1' }),
        base({ id: 'b', recipientUserId: 'u2', eventKey: 'task:t2:new:u2', createdAt: '2026-08-29T09:00:00Z' }),
      ],
    });
    const incoming = makeState({
      users: server.users,
      notifications: [base({ id: 'a', recipientUserId: 'u1', eventKey: 'task:t1:new:u1', acknowledgedAt: '2026-08-29T11:00:00Z' })],
    });

    const merged = mergeStateWithServer(incoming, server, 'u1').mergedState.notifications;
    expect(merged.find((n) => n.eventKey === 'task:t1:new:u1')!.acknowledgedAt).toBe('2026-08-29T11:00:00Z');
    expect(merged.find((n) => n.recipientUserId === 'u2')).toBeDefined(); // other account's notice preserved
    expect(merged[0].createdAt >= merged[1].createdAt).toBe(true); // sorted newest first
  });

  it('replaces the simple passthrough collections from the incoming state', () => {
    const server = makeState({ users: [makeUser({ id: 'u1' })], departments: [{ id: 'old' } as any], chats: [], checklistHistory: [] });
    const incoming = makeState({
      users: server.users,
      departments: [{ id: 'new' } as any],
      chats: [{ id: 'c1' } as any],
      checklistHistory: [{ date: '2026-08-29' } as any],
    });
    const { mergedState } = mergeStateWithServer(incoming, server, 'u1');
    expect(mergedState.departments).toEqual([{ id: 'new' }]);
    expect(mergedState.chats).toHaveLength(1);
    expect(mergedState.checklistHistory).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------

describe('authorizeStateMutation', () => {
  const withTask = (state: SystemData, task: ReturnType<typeof makeTask>) => ({ ...state, tasks: [task] });

  it('lets the GM change any task', () => {
    const { gm, all } = makeOrg();
    const server = makeState({ users: all, tasks: [makeTask({ id: 't1', createdBy: 'other', assigneeIds: ['other'] })] });
    const incoming = withTask(makeState({ users: all }), makeTask({ id: 't1', title: 'GM edit', createdBy: 'other', assigneeIds: ['other'] }));
    expect(authorizeStateMutation(incoming, server, gm)).toBeNull();
  });

  it('freezes server-managed collections when a non-management user syncs', () => {
    const { asst, all } = makeOrg();
    const server = makeState({ users: all, departments: [{ id: 'd1' } as any], projects: [{ id: 'p1' } as any] });
    const incoming = makeState({ users: [makeUser({ id: 'asst', role: 'GeneralManager' })], departments: [], projects: [] });

    authorizeStateMutation(incoming, server, asst);
    expect(incoming.departments).toEqual(server.departments);
    expect(incoming.projects).toEqual(server.projects);
    expect(incoming.users.map((u) => u.id).sort()).toEqual(all.map((u) => u.id).sort());
    expect(incoming.users.find((u) => u.id === 'asst')!.role).toBe('Assistant'); // client's escalation dropped
  });

  it('freezes checklists to the server copy when a Manager syncs (inspection-only)', () => {
    const { mgr, all } = makeOrg();
    const serverChk = makeChecklist({ id: 'c1', title: 'server', items: [{ id: 'i1', text: 'x', completed: false }] as any });
    const server = makeState({ users: all, checklists: [serverChk] });
    const incoming = makeState({
      users: all,
      checklists: [makeChecklist({ id: 'c1', title: 'manager tampered', items: [{ id: 'i1', text: 'x', completed: true }] as any })],
    });

    expect(authorizeStateMutation(incoming, server, mgr)).toBeNull();
    expect(incoming.checklists).toBe(server.checklists);
  });

  it('leaves checklists untouched for a Director sync (they own the checklist)', () => {
    const { dir, all } = makeOrg();
    const server = makeState({ users: all, checklists: [makeChecklist({ id: 'c1', title: 'server' })] });
    const incoming = makeState({ users: all, checklists: [makeChecklist({ id: 'c1', title: 'director edit' })] });

    authorizeStateMutation(incoming, server, dir);
    expect(incoming.checklists).not.toBe(server.checklists);
    expect(incoming.checklists[0].title).toBe('director edit');
  });

  it('silently reverts an Assistant editing a task that is not theirs (no 403 for the whole sync)', () => {
    const { asst, all } = makeOrg();
    const server = makeState({ users: all, tasks: [makeTask({ id: 't1', title: 'original', createdBy: 'mgr', assigneeIds: ['other'] })] });
    const incoming = withTask(makeState({ users: all }), makeTask({ id: 't1', title: 'sneaky edit', createdBy: 'mgr', assigneeIds: ['other'] }));
    // No error string — one foreign task must never strand the rest of the sync.
    expect(authorizeStateMutation(incoming, server, asst)).toBeNull();
    // ...but the unauthorized change is dropped: the server copy wins.
    expect(incoming.tasks[0]).toBe(server.tasks[0]);
    expect(incoming.tasks[0].title).toBe('original');
  });

  it('lets an Assistant edit a task assigned to them', () => {
    const { asst, all } = makeOrg();
    const server = makeState({ users: all, tasks: [makeTask({ id: 't1', createdBy: 'mgr', assigneeIds: ['asst'] })] });
    const incoming = withTask(makeState({ users: all }), makeTask({ id: 't1', status: 'In Progress', createdBy: 'mgr', assigneeIds: ['asst'] }));
    expect(authorizeStateMutation(incoming, server, asst)).toBeNull();
  });

  it('does not check authorization for an unchanged task', () => {
    const { asst, all } = makeOrg();
    const task = makeTask({ id: 't1', createdBy: 'mgr', assigneeIds: ['other'] });
    const server = makeState({ users: all, tasks: [task] });
    const incoming = withTask(makeState({ users: all }), { ...task });
    expect(authorizeStateMutation(incoming, server, asst)).toBeNull();
  });

  it('lets a Manager edit a task assigned into their team subtree, but reverts one outside it', () => {
    const { mgr, all } = makeOrg();
    const server = makeState({
      users: all,
      tasks: [makeTask({ id: 'in', createdBy: 'x', assigneeIds: ['asst'] }), makeTask({ id: 'out', title: 'original', createdBy: 'x', assigneeIds: ['other'] })],
    });
    const inScope = withTask(makeState({ users: all }), makeTask({ id: 'in', title: 'edit', createdBy: 'x', assigneeIds: ['asst'] }));
    const outScope = withTask(makeState({ users: all }), makeTask({ id: 'out', title: 'edit', createdBy: 'x', assigneeIds: ['other'] }));
    expect(authorizeStateMutation(inScope, server, mgr)).toBeNull();
    expect(inScope.tasks[0].title).toBe('edit');
    // Out-of-scope change is neutralised, not rejected wholesale.
    expect(authorizeStateMutation(outScope, server, mgr)).toBeNull();
    expect(outScope.tasks[0].title).toBe('original');
  });

  it('keeps a brand-new task the acting user legitimately created even when the snapshot carries a foreign task drifted out of scope', () => {
    const { dir, all } = makeOrg();
    const foreign = makeTask({ id: 'foreign', title: 'server', createdBy: 'gm', assigneeIds: ['other'] });
    const server = makeState({ users: all, tasks: [foreign] });
    const drifted = makeTask({ id: 'foreign', title: 'locally archived', status: 'Archived', createdBy: 'gm', assigneeIds: ['other'] });
    const created = makeTask({ id: 'mine', title: 'from the director', createdBy: dir.id, assignedBy: dir.id, assigneeIds: ['asst'] });
    const incoming = { ...makeState({ users: all }), tasks: [created, drifted] };

    expect(authorizeStateMutation(incoming, server, dir)).toBeNull();
    expect(incoming.tasks.find((t) => t.id === 'mine')!.title).toBe('from the director');
    expect(incoming.tasks.find((t) => t.id === 'foreign')!.title).toBe('server'); // drift reverted
  });
});

describe('authorizeStateMutation — single GeneralManager invariant', () => {
  it('reverts a Director trying to promote an Assistant to GeneralManager', () => {
    const { dir, all } = makeOrg();
    const server = makeState({ users: all });
    const incoming = makeState({ users: all.map((u) => (u.id === 'asst' ? { ...u, role: 'GeneralManager' as const } : u)) });

    expect(authorizeStateMutation(incoming, server, dir)).toBeNull();
    expect(incoming.users.find((u) => u.id === 'asst')!.role).toBe('Assistant');
  });

  it('reverts the GM\'s own sync trying to promote someone else to GeneralManager too', () => {
    const { gm, all } = makeOrg();
    const server = makeState({ users: all });
    const incoming = makeState({ users: all.map((u) => (u.id === 'mgr' ? { ...u, role: 'GeneralManager' as const } : u)) });

    expect(authorizeStateMutation(incoming, server, gm)).toBeNull();
    expect(incoming.users.find((u) => u.id === 'mgr')!.role).toBe('Manager');
  });

  it('leaves the real GeneralManager alone', () => {
    const { gm, all } = makeOrg();
    const server = makeState({ users: all });
    const incoming = makeState({ users: all.map((u) => (u.id === 'gm' ? { ...u, title: 'Updated title' } : u)) });

    expect(authorizeStateMutation(incoming, server, gm)).toBeNull();
    const updatedGm = incoming.users.find((u) => u.id === 'gm')!;
    expect(updatedGm.role).toBe('GeneralManager');
    expect(updatedGm.title).toBe('Updated title');
  });

  it('forces a brand-new user claiming the GeneralManager role down to Assistant', () => {
    const { dir, all } = makeOrg();
    const server = makeState({ users: all });
    const rogue = makeUser({ id: 'rogue-gm', role: 'GeneralManager' as const });
    const incoming = makeState({ users: [...all, rogue] });

    expect(authorizeStateMutation(incoming, server, dir)).toBeNull();
    expect(incoming.users.find((u) => u.id === 'rogue-gm')!.role).toBe('Assistant');
  });
});
