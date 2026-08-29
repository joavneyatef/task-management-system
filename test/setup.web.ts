import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { MockWebSocket } from './msw/mock-websocket';
import { mswServer } from './msw/server';

// jsdom ships no WebSocket; the app opens one on mount. Install a controllable
// fake so component tests can simulate server broadcasts (see mock-websocket.ts).
// MSW's node server also patches the WebSocket global, so we re-install ours
// after mswServer.listen() and before every test.
const installFakeWebSocket = () => vi.stubGlobal('WebSocket', MockWebSocket);

// Fail loudly if a component makes an HTTP call no handler covers, instead of
// silently hitting the network.
beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'error' });
  installFakeWebSocket();
});

beforeEach(installFakeWebSocket);

afterEach(() => {
  cleanup();
  mswServer.resetHandlers();
  MockWebSocket.reset();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage not available in this environment */
  }
});

afterAll(() => mswServer.close());
