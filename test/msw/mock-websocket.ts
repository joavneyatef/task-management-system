/**
 * Minimal controllable WebSocket stand-in for jsdom component tests.
 *
 * It records every instance, opens automatically on the next microtask, and
 * exposes `.emit(payload)` so a test can simulate a server broadcast:
 *
 *   MockWebSocket.last!.emit({ type: 'state_updated', state: {...} });
 */
type Listener = (event: unknown) => void;

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static get last(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
  static reset(): void {
    MockWebSocket.instances = [];
  }

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;

  private listeners: Record<string, Listener[]> = {};

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch('open', { type: 'open' });
      }
    });
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', { type: 'close', code: 1000, wasClean: true });
  }

  /** Test helper: deliver a message frame to the app as if the server sent it. */
  emit(payload: unknown): void {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.dispatch('message', { type: 'message', data });
  }

  private dispatch(type: 'open' | 'message' | 'close' | 'error', event: unknown): void {
    const handler = this[`on${type}` as const] as Listener | null;
    handler?.(event);
    for (const fn of this.listeners[type] ?? []) fn(event);
  }
}
