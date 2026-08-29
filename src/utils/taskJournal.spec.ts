import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeNotification, makeTask } from '../../test/factories';
import { clearTaskJournal, readTaskJournal, saveTaskJournal, TASK_JOURNAL_KEY } from './taskJournal';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('taskJournal', () => {
  it('round-trips tasks and notifications with a savedAt stamp', () => {
    const tasks = [makeTask({ id: 't1' })];
    const notifications = [makeNotification({ id: 'n1' })];
    saveTaskJournal(tasks, notifications);

    const back = readTaskJournal()!;
    expect(back.tasks).toEqual(tasks);
    expect(back.notifications).toEqual(notifications);
    expect(typeof back.savedAt).toBe('number');
  });

  it('returns null when nothing has been journalled', () => {
    expect(readTaskJournal()).toBeNull();
  });

  it('returns null instead of throwing on corrupt JSON', () => {
    localStorage.setItem(TASK_JOURNAL_KEY, '{ not json');
    expect(readTaskJournal()).toBeNull();
  });

  it('swallows a storage write failure (quota / private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveTaskJournal([makeTask()], [])).not.toThrow();
  });

  it('swallows a storage read failure', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(readTaskJournal()).toBeNull();
  });

  it('clears the journal and tolerates a remove failure', () => {
    saveTaskJournal([makeTask()], []);
    clearTaskJournal();
    expect(localStorage.getItem(TASK_JOURNAL_KEY)).toBeNull();

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => clearTaskJournal()).not.toThrow();
  });
});
