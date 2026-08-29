import { describe, expect, it } from 'vitest';
import { makeUser } from '../../test/factories';
import { resolveLandingTab, shouldSkipPoll } from './liveSync';

const clear = {
  socketOpen: false,
  inFlightSyncCount: 0,
  msSinceLocalChange: 60_000,
  isUserTyping: false,
};

describe('shouldSkipPoll', () => {
  it('polls when the socket is down and nothing else is happening', () => {
    expect(shouldSkipPoll(clear)).toBe(false);
  });

  it.each([
    ['the WebSocket is live', { socketOpen: true }],
    ['a save is in flight', { inFlightSyncCount: 1 }],
    ['a local edit just happened', { msSinceLocalChange: 1000 }],
    ['the user is typing', { isUserTyping: true }],
  ])('stands down while %s', (_label, override) => {
    expect(shouldSkipPoll({ ...clear, ...override })).toBe(true);
  });

  it('resumes exactly at the local-edit cooldown boundary', () => {
    expect(shouldSkipPoll({ ...clear, msSinceLocalChange: 5000 })).toBe(false);
    expect(shouldSkipPoll({ ...clear, msSinceLocalChange: 4999 })).toBe(true);
  });
});

describe('resolveLandingTab', () => {
  it.each([
    ['GM', 'Dashboard'],
    ['GeneralManager', 'Dashboard'],
    ['Director', 'Dashboard'],
    ['Manager', 'Dashboard'],
    ['Assistant', 'Tasks'],
    ['Coordinator', 'Tasks'],
  ] as const)('sends a %s to %s', (role, tab) => {
    expect(resolveLandingTab(makeUser({ role }))).toBe(tab);
  });
});
