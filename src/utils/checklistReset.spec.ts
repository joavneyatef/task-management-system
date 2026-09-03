import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChecklist, makeChecklistItem, makeTask } from '../../test/factories';
import { autoArchiveTasksIfNeeded, autoResetChecklistsIfNeeded } from './checklistReset';

// Cairo is UTC+3 in August (Egypt observes DST) and UTC+2 in winter, so the
// UTC instants below are chosen for their Cairo-local calendar date.
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {}); // silence the "[Egypt Time Daemon]" notice
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('autoResetChecklistsIfNeeded — Daily', () => {
  const dailyDone = (over = {}) =>
    makeChecklist({
      type: 'Daily',
      lastResetPeriod: '2026-08-28',
      items: [makeChecklistItem({ completed: true, completedBy: 'asst', completedAt: 'x', note: 'n' })],
      ...over,
    });

  it('resets when the Cairo calendar date has rolled over', () => {
    at('2026-08-29T05:00:00Z'); // Cairo 08:00, 29 Aug
    const out = autoResetChecklistsIfNeeded([dailyDone()]);
    expect(out).not.toBeNull();
    expect(out![0].lastResetPeriod).toBe('2026-08-29');
    expect(out![0].items[0]).toMatchObject({ completed: false, completedBy: undefined, note: undefined });
  });

  it('does not reset later the same Cairo day', () => {
    at('2026-08-28T20:00:00Z'); // Cairo 23:00, still 28 Aug
    expect(autoResetChecklistsIfNeeded([dailyDone()])).toBeNull();
  });

  it('rolls over at Cairo midnight, not UTC midnight', () => {
    at('2026-08-28T22:30:00Z'); // UTC still 28th; Cairo already 01:30 on 29th
    const out = autoResetChecklistsIfNeeded([dailyDone()]);
    expect(out![0].lastResetPeriod).toBe('2026-08-29');
    expect(out![0].items[0].completed).toBe(false);
  });

  it('first run seeds lastResetPeriod without wiping progress', () => {
    at('2026-08-29T10:00:00Z');
    const out = autoResetChecklistsIfNeeded([dailyDone({ lastResetPeriod: undefined })]);
    expect(out![0].lastResetPeriod).toBe('2026-08-29');
    expect(out![0].items[0].completed).toBe(true); // seeded, not reset
  });
});

describe('autoResetChecklistsIfNeeded — Weekly', () => {
  const weekly = (over = {}) =>
    makeChecklist({ type: 'Weekly', lastResetPeriod: '2026-08-23', items: [makeChecklistItem({ completed: true })], ...over });

  it('resets on a Cairo Sunday', () => {
    at('2026-08-30T12:00:00Z'); // Cairo Sunday
    const out = autoResetChecklistsIfNeeded([weekly()]);
    expect(out![0].lastResetPeriod).toBe('2026-08-30');
    expect(out![0].items[0].completed).toBe(false);
  });

  it('does nothing on a non-Sunday', () => {
    at('2026-08-31T12:00:00Z'); // Cairo Monday
    expect(autoResetChecklistsIfNeeded([weekly()])).toBeNull();
  });

  it('resets only once per Sunday', () => {
    at('2026-08-30T09:00:00Z');
    const first = autoResetChecklistsIfNeeded([weekly()]);
    at('2026-08-30T18:00:00Z');
    expect(autoResetChecklistsIfNeeded(first!)).toBeNull();
  });

  it('first run on a Sunday seeds the period without wiping progress', () => {
    at('2026-08-30T12:00:00Z');
    const out = autoResetChecklistsIfNeeded([weekly({ lastResetPeriod: undefined })]);
    expect(out![0].lastResetPeriod).toBe('2026-08-30');
    expect(out![0].items[0].completed).toBe(true);
  });
});

describe('autoResetChecklistsIfNeeded — Monthly', () => {
  const monthly = (over = {}) =>
    makeChecklist({ type: 'Monthly', lastResetPeriod: '2026-08', items: [makeChecklistItem({ completed: true })], ...over });

  it('resets on day 1 of the Cairo month, keyed by YYYY-MM', () => {
    at('2026-09-01T12:00:00Z'); // Cairo 1 Sep
    const out = autoResetChecklistsIfNeeded([monthly()]);
    expect(out![0].lastResetPeriod).toBe('2026-09');
    expect(out![0].items[0].completed).toBe(false);
  });

  it('does nothing on any other day of the month', () => {
    at('2026-09-02T12:00:00Z');
    expect(autoResetChecklistsIfNeeded([monthly()])).toBeNull();
  });

  it('first run on day 1 seeds YYYY-MM without wiping progress', () => {
    at('2026-09-01T12:00:00Z');
    const out = autoResetChecklistsIfNeeded([monthly({ lastResetPeriod: undefined })]);
    expect(out![0].lastResetPeriod).toBe('2026-09');
    expect(out![0].items[0].completed).toBe(true);
  });
});

describe('autoResetChecklistsIfNeeded — misc', () => {
  it('returns null (and logs) when Intl date formatting fails', () => {
    const RealIntl = globalThis.Intl;
    class BrokenDTF {
      formatToParts(): never {
        throw new Error('no ICU data');
      }
      format() {
        return 'Monday';
      }
    }
    vi.stubGlobal('Intl', { ...RealIntl, DateTimeFormat: BrokenDTF });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    at('2026-08-29T10:00:00Z');

    expect(autoResetChecklistsIfNeeded([makeChecklist({ type: 'Daily' })])).toBeNull();
    expect(errSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
    errSpy.mockRestore();
  });

  it('only touches the checklists that changed, leaving others by reference', () => {
    at('2026-08-29T10:00:00Z'); // date rollover for Daily; not day 1, not Sunday
    const daily = makeChecklist({ type: 'Daily', lastResetPeriod: '2026-08-28' });
    const monthly = makeChecklist({ type: 'Monthly', lastResetPeriod: '2026-08' });
    const out = autoResetChecklistsIfNeeded([daily, monthly])!;
    expect(out[0]).not.toBe(daily); // reset -> new object
    expect(out[1]).toBe(monthly); // untouched -> same reference
  });
});

describe('autoArchiveTasksIfNeeded', () => {
  it('archives a task completed on an earlier Cairo day and bumps its version', () => {
    at('2026-08-29T12:00:00Z');
    const task = makeTask({ status: 'Completed', completedAt: '2026-08-28T09:00:00Z', version: 3 });
    const out = autoArchiveTasksIfNeeded([task]);
    expect(out![0]).toMatchObject({ status: 'Archived', version: 4 });
    expect(out![0].updatedAt).toBeTruthy();
  });

  it('leaves a task completed today alone', () => {
    at('2026-08-29T12:00:00Z');
    const task = makeTask({ status: 'Completed', completedAt: '2026-08-29T06:00:00Z' });
    expect(autoArchiveTasksIfNeeded([task])).toBeNull();
  });

  it('ignores non-completed tasks and completed tasks with no timestamp', () => {
    at('2026-08-29T12:00:00Z');
    expect(
      autoArchiveTasksIfNeeded([
        makeTask({ status: 'In Progress' }),
        makeTask({ status: 'Completed', completedAt: undefined }),
      ]),
    ).toBeNull();
  });

  it('defaults a missing version to 1 before bumping to 2', () => {
    at('2026-08-29T12:00:00Z');
    const task = makeTask({ status: 'Completed', completedAt: '2026-08-20T00:00:00Z', version: undefined });
    expect(autoArchiveTasksIfNeeded([task])![0].version).toBe(2);
  });

  it('falls back to the date prefix when completedAt is not a parseable timestamp', () => {
    at('2026-08-29T12:00:00Z');
    const task = makeTask({ status: 'Completed', completedAt: 'not-a-timestamp' });
    expect(autoArchiveTasksIfNeeded([task])![0].status).toBe('Archived');
  });

  describe('ownerId guard', () => {
    it('archives only the caller-owned stale tasks when an ownerId is given', () => {
      at('2026-08-29T12:00:00Z');
      const mine = makeTask({ id: 'mine', status: 'Completed', completedAt: '2026-08-20T00:00:00Z', assigneeId: 'me', assigneeIds: ['me'] });
      const alsoMine = makeTask({ id: 'dispatched', status: 'Completed', completedAt: '2026-08-20T00:00:00Z', createdBy: 'x', assignedBy: 'me' });
      const theirs = makeTask({ id: 'theirs', status: 'Completed', completedAt: '2026-08-20T00:00:00Z', createdBy: 'x', assignedBy: 'x', assigneeId: 'someone', assigneeIds: ['someone'] });

      const out = autoArchiveTasksIfNeeded([mine, alsoMine, theirs], 'me')!;
      expect(out.find((t) => t.id === 'mine')!.status).toBe('Archived');
      expect(out.find((t) => t.id === 'dispatched')!.status).toBe('Archived');
      expect(out.find((t) => t.id === 'theirs')!.status).toBe('Completed'); // untouched — not the caller's task
    });

    it('returns null when the only stale task belongs to someone else', () => {
      at('2026-08-29T12:00:00Z');
      const theirs = makeTask({ status: 'Completed', completedAt: '2026-08-20T00:00:00Z', createdBy: 'x', assignedBy: 'x', assigneeIds: ['someone'] });
      expect(autoArchiveTasksIfNeeded([theirs], 'me')).toBeNull();
    });

    it('still archives org-wide when no ownerId is passed (the GM path)', () => {
      at('2026-08-29T12:00:00Z');
      const theirs = makeTask({ status: 'Completed', completedAt: '2026-08-20T00:00:00Z', createdBy: 'x', assigneeIds: ['someone'] });
      expect(autoArchiveTasksIfNeeded([theirs])![0].status).toBe('Archived');
    });
  });

  it('returns null when Intl date formatting fails outright', () => {
    const RealIntl = globalThis.Intl;
    class BrokenDTF {
      formatToParts(): never {
        throw new Error('no ICU data');
      }
    }
    vi.stubGlobal('Intl', { ...RealIntl, DateTimeFormat: BrokenDTF });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    at('2026-08-29T12:00:00Z');

    expect(autoArchiveTasksIfNeeded([makeTask({ status: 'Completed', completedAt: '2026-08-01T00:00:00Z' })])).toBeNull();

    vi.unstubAllGlobals();
    errSpy.mockRestore();
  });
});
