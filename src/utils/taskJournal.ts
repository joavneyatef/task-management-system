import type { Notification, Task } from '../types';

/**
 * Browser-side mutation journal. When a task is created/edited optimistically,
 * a copy is stashed here so a refresh or socket race before the server response
 * settles can't make the work vanish. Cleared once the server confirms.
 *
 * Extracted from App.tsx for unit testing. Every access is guarded: storage may
 * be unavailable (private mode), full (quota), or hold corrupt JSON.
 */
export const TASK_JOURNAL_KEY = 'long_beach_task_mutation_journal_v1';

export interface TaskJournal {
  tasks: Task[];
  notifications: Notification[];
  savedAt: number;
}

export function saveTaskJournal(tasks: Task[], notifications: Notification[]): void {
  try {
    localStorage.setItem(
      TASK_JOURNAL_KEY,
      JSON.stringify({ tasks, notifications, savedAt: Date.now() }),
    );
  } catch {
    /* quota exceeded or storage unavailable — server state stays authoritative */
  }
}

export function readTaskJournal(): TaskJournal | null {
  try {
    const raw = localStorage.getItem(TASK_JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as TaskJournal) : null;
  } catch {
    return null;
  }
}

export function clearTaskJournal(): void {
  try {
    localStorage.removeItem(TASK_JOURNAL_KEY);
  } catch {
    /* ignore */
  }
}
