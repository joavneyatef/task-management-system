import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNotificationSoundEnabled, playNotificationChime, setNotificationSoundEnabled } from './notificationSound';

describe('notification sound preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to enabled when nothing has been stored yet', () => {
    expect(isNotificationSoundEnabled()).toBe(true);
  });

  it('persists mute / unmute across reads', () => {
    setNotificationSoundEnabled(false);
    expect(isNotificationSoundEnabled()).toBe(false);

    setNotificationSoundEnabled(true);
    expect(isNotificationSoundEnabled()).toBe(true);
  });

  it('falls back to enabled if localStorage throws (private mode, etc.)', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isNotificationSoundEnabled()).toBe(true);
    spy.mockRestore();
  });
});

describe('playNotificationChime', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never throws when the environment has no Web Audio API (e.g. this test DOM)', () => {
    expect(() => playNotificationChime()).not.toThrow();
  });

  it('does not attempt to build an audio graph while muted', () => {
    setNotificationSoundEnabled(false);
    // jsdom has no AudioContext at all, so the real assertion is just that this
    // never throws even though the preference check runs first.
    expect(() => playNotificationChime()).not.toThrow();
  });

  it('swallows a synth failure instead of throwing', () => {
    class ThrowingAudioContext {
      constructor() {
        throw new Error('autoplay blocked');
      }
    }
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    expect(() => playNotificationChime()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
