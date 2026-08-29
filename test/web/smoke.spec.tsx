import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isGeneralManager } from '../../src/utils/permissions';
import { makeUser } from '../factories';

/**
 * Phase 0 smoke: proves the jsdom + React 19 + RTL + jest-dom + MSW + fake-socket
 * pipeline is wired. Real coverage starts in Phase 2/3.
 */
describe('web harness smoke', () => {
  it('renders JSX and applies jest-dom matchers', () => {
    render(<button type="button">Sign in</button>);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('can import and run app source (permissions.ts)', () => {
    expect(isGeneralManager(makeUser({ role: 'GeneralManager' }))).toBe(true);
    expect(isGeneralManager(makeUser({ role: 'Assistant' }))).toBe(false);
  });

  it('installs the controllable WebSocket global', () => {
    const ws = new WebSocket('ws://localhost/test');
    expect(ws).toBeInstanceOf(WebSocket);
  });

  it('intercepts HTTP through MSW', async () => {
    const res = await fetch('/api/state');
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });
});
