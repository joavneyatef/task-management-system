import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initWebSockets } from '../../server';
import { app, jsonOrg, loginAs, seedOrg, writeJsonState } from './support';

let server: import('node:http').Server;
let wsUrl: string;
const openSockets: WebSocket[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => {
    server = app.listen(0, r);
  });
  initWebSockets(server);
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  await seedOrg();
  writeJsonState({ users: jsonOrg() });
});

afterEach(async () => {
  await Promise.all(openSockets.splice(0).map((ws) => new Promise<void>((r) => {
    if (ws.readyState === WebSocket.CLOSED) return r();
    ws.once('close', () => r());
    ws.close();
  })));
});

type Frame = Record<string, unknown>;
const buffers = new WeakMap<WebSocket, Frame[]>();
const waiters = new WeakMap<WebSocket, Array<(f: Frame) => void>>();

function connect(): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl);
  openSockets.push(ws);
  const frames: Frame[] = [];
  buffers.set(ws, frames);
  waiters.set(ws, []);
  // Attach synchronously so no frame sent right after connect is missed.
  ws.on('message', (raw: WebSocket.RawData) => {
    let f: Frame;
    try {
      f = JSON.parse(raw.toString()) as Frame;
    } catch {
      return;
    }
    frames.push(f);
    for (const w of waiters.get(ws)!.splice(0)) w(f);
  });
  ws.on('error', () => {});
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitFor(ws: WebSocket, match: (m: Frame) => boolean, ms = 2500): Promise<Frame> {
  const existing = buffers.get(ws)!.find(match);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a matching ws frame')), ms);
    const check = (f: Frame) => {
      if (match(f)) {
        clearTimeout(timer);
        resolve(f);
      } else {
        waiters.get(ws)!.push(check);
      }
    };
    waiters.get(ws)!.push(check);
  });
}

const join = (ws: WebSocket, userId: string) =>
  ws.send(JSON.stringify({ type: 'join', userId, userName: userId.toUpperCase(), role: 'Manager' }));

describe('WebSocket server', () => {
  it('sends the current presence/lock snapshot to a new client', async () => {
    const ws = await connect();
    const snap = await waitFor(ws, (m) => m.type === 'sync_presence');
    expect(snap).toHaveProperty('presences');
    expect(snap).toHaveProperty('locks');
  });

  it('broadcasts presence_changed when a client joins', async () => {
    const a = await connect();
    const b = await connect();
    const seenByB = waitFor(b, (m) => m.type === 'presence_changed' && (m.presences as Array<{ userId: string }>).some((p) => p.userId === 'u-alice'));
    join(a, 'u-alice');
    const frame = await seenByB;
    expect((frame.presences as Array<{ userId: string }>).map((p) => p.userId)).toContain('u-alice');
  });

  it('grants a lock, broadcasts it, then denies a second holder', async () => {
    const a = await connect();
    const b = await connect();
    join(a, 'u-a');
    join(b, 'u-b');

    const bSeesLock = waitFor(b, (m) => m.type === 'locks_changed' && !!(m.locks as Record<string, unknown>)['item-42']);
    a.send(JSON.stringify({ type: 'lock_item', itemId: 'item-42' }));
    await bSeesLock;

    const bDenied = waitFor(b, (m) => m.type === 'lock_denied' && m.itemId === 'item-42');
    b.send(JSON.stringify({ type: 'lock_item', itemId: 'item-42' }));
    const denial = await bDenied;
    expect((denial.lockedBy as { userId: string }).userId).toBe('u-a');
  });

  it('broadcasts state_updated to connected clients after POST /api/state', async () => {
    const listener = await connect();
    join(listener, 'u-listener');

    const gm = await loginAs('gm');
    const snap = (await gm.get('/api/state')).body;

    const gotUpdate = waitFor(listener, (m) => m.type === 'state_updated');
    await gm.post('/api/state').send({ ...snap, tasks: [] });
    const frame = await gotUpdate;
    expect(frame).toHaveProperty('state');
  });

  it('survives a malformed frame and keeps serving', async () => {
    const ws = await connect();
    ws.send('this is not json {');
    const pong = waitFor(ws, (m) => m.type === 'pong');
    ws.send(JSON.stringify({ type: 'ping' }));
    expect(await pong).toMatchObject({ type: 'pong' });
  });

  it('drops a client from presence when it disconnects', async () => {
    const watcher = await connect();
    const leaver = await connect();
    join(watcher, 'u-watch');
    join(leaver, 'u-leave');
    await waitFor(watcher, (m) => m.type === 'presence_changed' && (m.presences as Array<{ userId: string }>).some((p) => p.userId === 'u-leave'));

    const gone = waitFor(watcher, (m) => m.type === 'presence_changed' && !(m.presences as Array<{ userId: string }>).some((p) => p.userId === 'u-leave'));
    leaver.close();
    const frame = await gone;
    expect((frame.presences as Array<{ userId: string }>).map((p) => p.userId)).not.toContain('u-leave');
  });
});
