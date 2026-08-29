import { describe, expect, it } from 'vitest';
import { makeUser } from '../../test/factories';
import {
  hashPassword,
  isValidPassword,
  sanitizePublicUser,
  signSession,
  verifyPassword,
  verifySession,
} from './authService';

describe('hashPassword / verifyPassword', () => {
  it('round-trips a scrypt hash and rejects a wrong password', () => {
    const hash = hashPassword('Sup3rSecret!');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(verifyPassword('Sup3rSecret!', hash)).toBe(true);
    expect(verifyPassword('not-it', hash)).toBe(false);
  });

  it('salts every hash uniquely, so the same password hashes differently', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('returns false (never throws) for empty inputs', () => {
    expect(verifyPassword('', hashPassword('x'))).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });

  it('supports the legacy plaintext-equality fallback for un-migrated hashes', () => {
    expect(verifyPassword('plain-legacy', 'plain-legacy')).toBe(true);
    expect(verifyPassword('plain-legacy', 'something-else')).toBe(false);
  });

  it('returns false for a malformed scrypt hash instead of throwing', () => {
    // Wrong number of `$` segments.
    expect(verifyPassword('x', 'scrypt$only-two-parts')).toBe(false);
    // Right segment count, but the stored digest is not a 64-byte hex string:
    // crypto.timingSafeEqual must not be handed mismatched buffer lengths.
    expect(verifyPassword('x', 'scrypt$abcd$deadbeef')).toBe(false);
    expect(verifyPassword('x', 'scrypt$abcd$')).toBe(false);
    expect(verifyPassword('x', 'scrypt$abcd$nothex-nothex')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it.each([
    ['short1A', false, 'under 8 chars'],
    ['alllowercase1', false, 'no uppercase'],
    ['ALLUPPERCASE1', false, 'no lowercase'],
    ['NoDigitOrSymbol', false, 'no digit or symbol'],
    ['Valid1Password', true, 'letters + digit'],
    ['Also-Valid8', true, 'letters + symbol + digit'],
    ['Passw0rd!', true, 'the shared test password'],
  ])('isValidPassword(%j) === %s (%s)', (pw, expected) => {
    expect(isValidPassword(pw)).toBe(expected);
  });

  it('rejects non-string input', () => {
    expect(isValidPassword(undefined as unknown as string)).toBe(false);
    expect(isValidPassword(12345678 as unknown as string)).toBe(false);
  });
});

describe('signSession / verifySession', () => {
  it('verifies a freshly signed token back to its user id', () => {
    expect(verifySession(signSession('user-42'))).toBe('user-42');
  });

  it('rejects a token with a tampered signature', () => {
    const parts = signSession('user-42').split('.');
    parts[2] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00';
    expect(verifySession(parts.join('.'))).toBeNull();
  });

  it('rejects a token whose payload was edited (user id swapped)', () => {
    const [, expiry, sig] = signSession('user-42').split('.');
    expect(verifySession(['user-99', expiry, sig].join('.'))).toBeNull();
  });

  it('rejects an expired token', () => {
    const forged = `user-42.${Date.now() - 1000}.whatever`;
    expect(verifySession(forged)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession('')).toBeNull();
    expect(verifySession('only.two')).toBeNull();
    expect(verifySession('a.b.c.d')).toBeNull();
  });
});

describe('sanitizePublicUser', () => {
  it('drops password and pin and parses the skills JSON string', () => {
    const raw = {
      ...makeUser({ id: 'u1', role: 'Manager' }),
      password: hashPassword('secret'),
      pin: hashPassword('1234'),
      skills: JSON.stringify(['network', 'servers']),
      updatedAt: new Date('2026-08-29T00:00:00Z'),
    };
    const clean = sanitizePublicUser(raw);
    expect(clean).not.toHaveProperty('password');
    expect(clean).not.toHaveProperty('pin');
    expect(clean.skills).toEqual(['network', 'servers']);
    expect(clean.updatedAt).toBe('2026-08-29T00:00:00.000Z');
  });

  it('tolerates skills already being an array or missing', () => {
    expect(sanitizePublicUser({ ...makeUser(), skills: ['x'] }).skills).toEqual(['x']);
    expect(sanitizePublicUser({ ...makeUser(), skills: null }).skills).toEqual([]);
  });
});
