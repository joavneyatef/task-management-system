const SOUND_PREF_KEY = 'notification_sound_enabled';

/**
 * Per-browser preference (defaults to on). A shared/front-desk PC may want it
 * off; stored in localStorage rather than the account so it never needs a
 * server round-trip and is never shared between viewers of the same account.
 */
export function isNotificationSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    /* localStorage unavailable (private mode, etc.) — preference just won't persist */
  }
}

// Lazily-created, reused across every call so we don't spin up a new audio
// graph per notification (and so the single context can pick up the
// "resumed after a user gesture" state browsers require for autoplay).
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/**
 * Plays a short two-note chime so a freshly arrived notification (e.g. "you
 * have a new task") is noticeable even if the user isn't looking at the
 * screen. Synthesized with the Web Audio API rather than an audio file, so it
 * needs no asset and works fully offline on a self-hosted LAN.
 *
 * Never throws: a missed chime (blocked autoplay, no Web Audio support, a
 * background tab) must never break the notification flow itself.
 */
export function playNotificationChime(): void {
  try {
    if (!isNotificationSoundEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notes: Array<{ freq: number; start: number; duration: number; peak: number }> = [
      { freq: 880, start: 0, duration: 0.14, peak: 0.2 },
      { freq: 1318.5, start: 0.09, duration: 0.24, peak: 0.22 },
    ];

    notes.forEach(({ freq, start, duration, peak }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const t0 = now + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    });
  } catch {
    /* audio is a nice-to-have; swallow any autoplay/API failure */
  }
}
