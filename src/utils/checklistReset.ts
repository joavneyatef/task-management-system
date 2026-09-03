import type { Checklist, Task } from '../types';

/**
 * Period-based auto-reset for recurring checklists, keyed to Africa/Cairo wall
 * clock (the hotel's local time), independent of the server/browser timezone.
 *
 * - Daily   resets when the Cairo calendar date changes.
 * - Weekly  resets on Sundays (once per Sunday).
 * - Monthly resets on the 1st of the Cairo month.
 *
 * Returns a new checklist array when anything changed (either a real reset or a
 * first-run seed of `lastResetPeriod`), or `null` when nothing changed.
 * Returns `null` and logs if `Intl.DateTimeFormat` cannot resolve the timezone.
 *
 * Extracted from App.tsx for unit testing (see checklistReset.spec.ts).
 */
export function autoResetChecklistsIfNeeded(currentChecklists: Checklist[]): Checklist[] | null {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  let parts;
  try {
    parts = formatter.formatToParts(new Date());
  } catch (e) {
    console.error('DateTimeFormat Egypt failed:', e);
    return null;
  }

  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const yearStr = partMap.year;
  const monthStr = partMap.month;
  const dayStr = partMap.day;

  const cairoDateStr = `${yearStr}-${monthStr}-${dayStr}`; // "YYYY-MM-DD"
  const cairoMonthStr = `${yearStr}-${monthStr}`; // "YYYY-MM"

  const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'long'
  });
  const cairoDayOfWeek = dayOfWeekFormatter.format(new Date()); // e.g. "Sunday"
  const cairoDayOfMonth = parseInt(dayStr, 10);

  let hasChanged = false;
  const updatedChecklists = currentChecklists.map(checklist => {
    let shouldReset = false;
    let newPeriod = checklist.lastResetPeriod;

    if (checklist.type === 'Daily') {
      // Daily resets after 12:00 AM (midnight) when Cairo Date shifts
      if (!checklist.lastResetPeriod) {
        newPeriod = cairoDateStr;
        hasChanged = true;
      } else if (checklist.lastResetPeriod !== cairoDateStr) {
        shouldReset = true;
        newPeriod = cairoDateStr;
        hasChanged = true;
      }
    } else if (checklist.type === 'Weekly') {
      // Weekly resets on Sunday (يوم الأحد / Sunday) of each week
      if (cairoDayOfWeek === 'Sunday') {
        if (!checklist.lastResetPeriod) {
          newPeriod = cairoDateStr;
          hasChanged = true;
        } else if (checklist.lastResetPeriod !== cairoDateStr) {
          shouldReset = true;
          newPeriod = cairoDateStr;
          hasChanged = true;
        }
      }
    } else if (checklist.type === 'Monthly') {
      // Monthly resets on day 1 of the month
      if (cairoDayOfMonth === 1) {
        if (!checklist.lastResetPeriod) {
          newPeriod = cairoMonthStr;
          hasChanged = true;
        } else if (checklist.lastResetPeriod !== cairoMonthStr) {
          shouldReset = true;
          newPeriod = cairoMonthStr;
          hasChanged = true;
        }
      }
    }

    if (shouldReset) {
      console.log(`[Egypt Time Daemon] Auto-resetting checklist: ${checklist.type} for period ${newPeriod}`);
      const resetItems = checklist.items.map(item => ({
        ...item,
        completed: false,
        completedAt: undefined,
        completedBy: undefined,
        note: undefined
      }));
      return {
        ...checklist,
        lastResetPeriod: newPeriod,
        items: resetItems
      };
    } else if (newPeriod !== checklist.lastResetPeriod) {
      return {
        ...checklist,
        lastResetPeriod: newPeriod
      };
    }

    return checklist;
  });

  if (hasChanged) {
    return updatedChecklists;
  }
  return null;
}

/**
 * Archives tasks that were Completed on an earlier Cairo calendar day, bumping
 * their optimistic-concurrency `version`. Returns a new array when anything
 * changed, otherwise `null`.
 *
 * `ownerId`, when given, restricts archiving to tasks that user actually owns
 * (assignee / creator / dispatcher). This runs on every logged-in browser, so
 * without the guard a Director in one department would keep re-archiving another
 * department's tickets locally — a change the server then refuses (it is outside
 * that user's scope), which used to 403 the whole state sync and silently strand
 * every task the user created. The GM passes no `ownerId` and still archives
 * org-wide.
 *
 * Extracted from App.tsx for unit testing.
 */
export function autoArchiveTasksIfNeeded(currentTasks: Task[], ownerId?: string): Task[] | null {
  const ownsTask = (task: Task): boolean => {
    if (!ownerId) return true;
    const recipients = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
    return recipients.includes(ownerId) || task.createdBy === ownerId || task.assignedBy === ownerId;
  };
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });

  let parts;
  try {
    parts = formatter.formatToParts(new Date());
  } catch (e) {
    console.error('DateTimeFormat Egypt failed:', e);
    return null;
  }

  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const yearStr = partMap.year;
  const monthStr = partMap.month;
  const dayStr = partMap.day;

  const cairoDateStr = `${yearStr}-${monthStr}-${dayStr}`; // "YYYY-MM-DD"

  let hasChanged = false;
  const updatedTasks = currentTasks.map(task => {
    if (task.status === 'Completed' && task.completedAt && ownsTask(task)) {
      let completedCairoDate = '';
      try {
        const completedDateParts = formatter.formatToParts(new Date(task.completedAt));
        const completedPartMap = Object.fromEntries(completedDateParts.map(p => [p.type, p.value]));
        completedCairoDate = `${completedPartMap.year}-${completedPartMap.month}-${completedPartMap.day}`;
      } catch (e) {
        completedCairoDate = task.completedAt.split('T')[0];
      }

      if (completedCairoDate !== cairoDateStr) {
        hasChanged = true;
        return {
          ...task,
          status: 'Archived' as const,
          updatedAt: new Date().toISOString(),
          version: (task.version || 1) + 1
        };
      }
    }
    return task;
  });

  if (hasChanged) {
    return updatedTasks;
  }
  return null;
}
