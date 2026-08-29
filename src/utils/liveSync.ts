import type { User } from '../types';
import { isDirector, isGeneralManager, isManager } from './permissions';

/**
 * The four guards that decide whether the 5-second polling fallback should run
 * this tick. Polling exists only for when the WebSocket is down; it must also
 * stand down while a save is in flight, right after a local edit, or while the
 * user is typing (so it can't yank focus or clobber an unsent change).
 *
 * Extracted from App.tsx's runPollingActiveSync for unit testing.
 */
export interface PollGuardState {
  socketOpen: boolean;
  inFlightSyncCount: number;
  msSinceLocalChange: number;
  isUserTyping: boolean;
}

export const LOCAL_EDIT_COOLDOWN_MS = 5000;

export function shouldSkipPoll(s: PollGuardState): boolean {
  if (s.socketOpen) return true;
  if (s.inFlightSyncCount > 0) return true;
  if (s.msSinceLocalChange < LOCAL_EDIT_COOLDOWN_MS) return true;
  if (s.isUserTyping) return true;
  return false;
}

/** Where a user lands after login: management roles get the Dashboard, others go straight to Tasks. */
export function resolveLandingTab(user: User): 'Dashboard' | 'Tasks' {
  return isGeneralManager(user) || isDirector(user) || isManager(user) ? 'Dashboard' : 'Tasks';
}
