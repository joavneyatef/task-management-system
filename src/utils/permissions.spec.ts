import { describe, expect, it } from 'vitest';
import { makeOrg, makeUser } from '../../test/factories';
import type { Task, User } from '../types';
import {
  canAccessAuditLog,
  canAuthorChecklist,
  canSendTasks,
  canSignChecklistItems,
  canViewComplaint,
  canViewTask,
  getAssignableUsers,
  getDescendantIds,
  isAssistant,
  isDirector,
  isGeneralManager,
  isManager,
} from './permissions';

/** Shrinks a Task down to the shape canViewTask actually reads. */
const asTask = (over: Partial<Task>): Parameters<typeof canViewTask>[1] => ({
  assigneeId: null,
  assigneeIds: [],
  createdBy: 'nobody',
  ...over,
});

describe('role predicates', () => {
  it.each([
    ['GM', true],
    ['GeneralManager', true],
    ['Director', false],
    ['Manager', false],
    ['Assistant', false],
    ['Coordinator', false],
  ] as const)('isGeneralManager(%s) === %s', (role, expected) => {
    expect(isGeneralManager(makeUser({ role }))).toBe(expected);
  });

  it('treats null / undefined as not-a-GM (and every other predicate too)', () => {
    for (const fn of [isGeneralManager, isDirector, isManager, isAssistant, canAccessAuditLog, canSendTasks]) {
      expect(fn(null)).toBe(false);
      expect(fn(undefined)).toBe(false);
    }
  });

  it('isDirector / isManager match their exact role only', () => {
    expect(isDirector(makeUser({ role: 'Director' }))).toBe(true);
    expect(isDirector(makeUser({ role: 'Manager' }))).toBe(false);
    expect(isManager(makeUser({ role: 'Manager' }))).toBe(true);
    expect(isManager(makeUser({ role: 'Director' }))).toBe(false);
  });

  it('isAssistant covers both Assistant and legacy Coordinator', () => {
    expect(isAssistant(makeUser({ role: 'Assistant' }))).toBe(true);
    expect(isAssistant(makeUser({ role: 'Coordinator' }))).toBe(true);
    expect(isAssistant(makeUser({ role: 'Manager' }))).toBe(false);
  });

  it.each([
    ['GM', true],
    ['Director', true],
    ['Manager', true],
    ['Assistant', false],
    ['Coordinator', false],
  ] as const)('canSendTasks for %s === %s', (role, expected) => {
    expect(canSendTasks(makeUser({ role }))).toBe(expected);
  });

  it.each([
    ['GM', true],
    ['GeneralManager', true],
    ['Director', false],
    ['Manager', false],
    ['Assistant', false],
    ['Coordinator', false],
  ] as const)('canAccessAuditLog for %s === %s (GM only)', (role, expected) => {
    expect(canAccessAuditLog(makeUser({ role }))).toBe(expected);
  });

  it.each([
    ['GM', true],
    ['Director', true],
    ['Manager', false],
    ['Assistant', false],
    ['Coordinator', false],
  ] as const)('canAuthorChecklist for %s === %s (GM + Director own it)', (role, expected) => {
    expect(canAuthorChecklist(makeUser({ role }))).toBe(expected);
  });

  it.each([
    ['GM', true],
    ['Director', true],
    ['Manager', false],
    ['Assistant', true],
    ['Coordinator', true],
  ] as const)('canSignChecklistItems for %s === %s (everyone but a Manager)', (role, expected) => {
    expect(canSignChecklistItems(makeUser({ role }))).toBe(expected);
  });

  it('canAuthorChecklist / canSignChecklistItems treat null as false', () => {
    expect(canAuthorChecklist(null)).toBe(false);
    expect(canSignChecklistItems(undefined)).toBe(false);
  });
});

describe('getDescendantIds', () => {
  it('walks the whole reporting subtree, not just direct reports', () => {
    const { all } = makeOrg();
    expect(getDescendantIds('gm', all).sort()).toEqual(['asst', 'dir', 'mgr']);
    expect(getDescendantIds('dir', all).sort()).toEqual(['asst', 'mgr']);
    expect(getDescendantIds('mgr', all)).toEqual(['asst']);
  });

  it('returns [] for a leaf and for an unknown root', () => {
    const { all } = makeOrg();
    expect(getDescendantIds('asst', all)).toEqual([]);
    expect(getDescendantIds('does-not-exist', all)).toEqual([]);
  });

  it('follows the legacy managerId link as well as parentId', () => {
    const boss = makeUser({ id: 'boss', role: 'Manager' });
    const viaManagerId = makeUser({ id: 'legacy', parentId: undefined, managerId: 'boss' });
    expect(getDescendantIds('boss', [boss, viaManagerId])).toEqual(['legacy']);
  });

  it('is cycle-safe when the reporting links form a loop', () => {
    const a = makeUser({ id: 'a', parentId: 'b' });
    const b = makeUser({ id: 'b', parentId: 'a' });
    let out: string[] = [];
    expect(() => {
      out = getDescendantIds('a', [a, b]);
    }).not.toThrow();
    expect(out.sort()).toEqual(['a', 'b']);
  });
});

describe('getAssignableUsers', () => {
  const ids = (list: User[]) => list.map((u) => u.id).sort();

  it('GM can assign to everyone, listed once, minus anyone On Leave', () => {
    const { gm, all } = makeOrg();
    const onLeave = makeUser({ id: 'away', status: 'On Leave' });
    const result = getAssignableUsers(gm, [...all, onLeave]);
    expect(ids(result)).toEqual(['asst', 'dir', 'gm', 'mgr', 'other']);
    expect(result.filter((u) => u.id === 'gm')).toHaveLength(1);
  });

  it('Director reaches their own department and direct reports only', () => {
    const { dir, all } = makeOrg();
    expect(ids(getAssignableUsers(dir, all))).toEqual(['asst', 'dir', 'mgr']);
  });

  it('Director cannot assign to another department that is not a direct report', () => {
    const { dir, other, all } = makeOrg();
    expect(getAssignableUsers(dir, all).map((u) => u.id)).not.toContain(other.id);
  });

  it('Director CAN assign to a direct report even in another department', () => {
    const { dir, all } = makeOrg();
    const crossDeptReport = makeUser({ id: 'x-dept', role: 'Assistant', departmentId: 'dept-fnb', parentId: 'dir' });
    expect(getAssignableUsers(dir, [...all, crossDeptReport]).map((u) => u.id)).toContain('x-dept');
  });

  it('Manager reaches department Assistants only — never Managers or other departments', () => {
    const { mgr, all } = makeOrg();
    const result = ids(getAssignableUsers(mgr, all));
    expect(result).toEqual(['asst', 'mgr']);
    expect(result).not.toContain('dir');
    expect(result).not.toContain('other');
  });

  it('excludes On Leave staff for Director and Manager', () => {
    const { dir, mgr, all } = makeOrg();
    const sickAsst = makeUser({ id: 'sick', role: 'Assistant', departmentId: 'dept-it', parentId: 'mgr', status: 'On Leave' });
    const pool = [...all, sickAsst];
    expect(getAssignableUsers(dir, pool).map((u) => u.id)).not.toContain('sick');
    expect(getAssignableUsers(mgr, pool).map((u) => u.id)).not.toContain('sick');
  });

  it('Assistant and Coordinator get an empty list', () => {
    const { asst, all } = makeOrg();
    expect(getAssignableUsers(asst, all)).toEqual([]);
    expect(getAssignableUsers(makeUser({ role: 'Coordinator' }), all)).toEqual([]);
  });
});

describe('canViewTask', () => {
  it('GM sees every task, including one with no link to them', () => {
    const { gm, all } = makeOrg();
    expect(canViewTask(gm, asTask({ createdBy: 'other', assigneeIds: ['other'], departmentId: 'dept-fnb' }), all)).toBe(true);
  });

  it('Assistant sees a task only when they are a recipient', () => {
    const { asst, all } = makeOrg();
    expect(canViewTask(asst, asTask({ assigneeIds: ['asst'] }), all)).toBe(true);
    expect(canViewTask(asst, asTask({ assigneeIds: ['mgr'] }), all)).toBe(false);
  });

  it('Assistant recipient check falls back to the legacy single assigneeId', () => {
    const { asst, all } = makeOrg();
    expect(canViewTask(asst, asTask({ assigneeId: 'asst', assigneeIds: [] }), all)).toBe(true);
  });

  it('Director sees tasks they created, were assigned by, or that belong to their department', () => {
    const { dir, all } = makeOrg();
    expect(canViewTask(dir, asTask({ createdBy: 'dir' }), all)).toBe(true);
    expect(canViewTask(dir, asTask({ createdBy: 'x', assignedBy: 'dir' }), all)).toBe(true);
    expect(canViewTask(dir, asTask({ createdBy: 'x', departmentId: 'dept-it' }), all)).toBe(true);
  });

  it('Director does not see an unrelated cross-department task', () => {
    const { dir, all } = makeOrg();
    expect(canViewTask(dir, asTask({ createdBy: 'other', assigneeIds: ['other'], departmentId: 'dept-fnb' }), all)).toBe(false);
  });

  it('Director sees a task assigned directly to them', () => {
    const { dir, all } = makeOrg();
    expect(canViewTask(dir, asTask({ createdBy: 'other', assigneeIds: ['dir'], departmentId: 'dept-fnb' }), all)).toBe(true);
  });

  it('Manager sees tasks they created or were assigned', () => {
    const { mgr, all } = makeOrg();
    expect(canViewTask(mgr, asTask({ createdBy: 'mgr', departmentId: 'dept-fnb' }), all)).toBe(true);
    expect(canViewTask(mgr, asTask({ createdBy: 'x', assignedBy: 'mgr' }), all)).toBe(true);
    expect(canViewTask(mgr, asTask({ createdBy: 'x', assigneeIds: ['mgr'] }), all)).toBe(true);
  });

  it('Manager sees a task assigned to someone in their team subtree, but not outside it', () => {
    const { mgr, all } = makeOrg();
    expect(canViewTask(mgr, asTask({ assigneeIds: ['asst'] }), all)).toBe(true);
    expect(canViewTask(mgr, asTask({ createdBy: 'other', assigneeIds: ['other'] }), all)).toBe(false);
  });

  it('falls back to recipient-or-creator for an unrecognised role', () => {
    // Defensive branch: every real UserRole is handled above, so this only
    // fires if an unexpected role slips through.
    const rogue = makeUser({ id: 'rogue', role: 'Weird' as User['role'] });
    expect(canViewTask(rogue, asTask({ assigneeIds: ['rogue'] }), [rogue])).toBe(true);
    expect(canViewTask(rogue, asTask({ createdBy: 'rogue' }), [rogue])).toBe(true);
    expect(canViewTask(rogue, asTask({ createdBy: 'someone-else' }), [rogue])).toBe(false);
  });
});

describe('canViewComplaint', () => {
  const complaint = (over: Partial<Parameters<typeof canViewComplaint>[1]>) => ({ departmentId: 'dept-it', assignedToId: null, ...over });

  it('GM sees every complaint', () => {
    const { gm, all } = makeOrg();
    expect(canViewComplaint(gm, complaint({ departmentId: 'dept-fnb', assignedToId: 'other' }), all)).toBe(true);
  });

  it('Director sees an unassigned complaint in their own department', () => {
    const { dir, all } = makeOrg();
    expect(canViewComplaint(dir, complaint({ assignedToId: null }), all)).toBe(true);
  });

  it('Director is blocked from another department', () => {
    const { dir, all } = makeOrg();
    expect(canViewComplaint(dir, complaint({ departmentId: 'dept-fnb' }), all)).toBe(false);
  });

  it('Director sees a complaint assigned to someone in their subtree but not outside it', () => {
    const { dir, all } = makeOrg();
    expect(canViewComplaint(dir, complaint({ assignedToId: 'asst' }), all)).toBe(true);
    expect(canViewComplaint(dir, complaint({ assignedToId: 'stranger' }), all)).toBe(false);
  });

  it('Assistant sees a complaint only when it is assigned to them', () => {
    const { asst, all } = makeOrg();
    expect(canViewComplaint(asst, complaint({ assignedToId: 'asst' }), all)).toBe(true);
    expect(canViewComplaint(asst, complaint({ assignedToId: null }), all)).toBe(false);
  });

  it('department match is case-sensitive here (unlike canViewTask)', () => {
    const { dir, all } = makeOrg();
    // Documents current behaviour: canViewComplaint compares departmentId with
    // a strict !==, so a casing difference denies access.
    expect(canViewComplaint(dir, complaint({ departmentId: 'DEPT-IT' }), all)).toBe(false);
  });
});
