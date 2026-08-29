import type React from 'react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeUser } from '../../test/factories';
import { mswServer } from '../../test/msw/server';
import { renderWithProviders, screen, waitFor } from '../../test/renderWithProviders';
import BackupRestorePanel from './BackupRestorePanel';

const backupRow = (over = {}) => ({
  id: 'b1',
  filename: 'lb-2026-08-29-1000.json',
  date: '2026-08-29',
  time: '10:00',
  timestamp: '2026-08-29T10:00:00Z',
  version: 'v3',
  size: 4096,
  createdBy: 'System',
  type: 'Manual',
  isTestEnv: false,
  ...over,
});

function setup(overrides: Partial<React.ComponentProps<typeof BackupRestorePanel>> = {}) {
  const currentUser = makeUser({ id: 'mgr', name: 'Mia Manager', role: 'Manager' });
  const onEnvironmentChanged = vi.fn();
  const onRefreshAppState = vi.fn();
  const onAddNotification = vi.fn();
  const props: React.ComponentProps<typeof BackupRestorePanel> = {
    currentUser,
    serverEnv: 'production',
    onEnvironmentChanged,
    onRefreshAppState,
    onAddNotification,
    ...overrides,
  };
  return { currentUser, onEnvironmentChanged, onRefreshAppState, onAddNotification, ...renderWithProviders(<BackupRestorePanel {...props} />) };
}

describe('BackupRestorePanel', () => {
  it('lists backups fetched on mount', async () => {
    mswServer.use(http.get('/api/backups', () => HttpResponse.json([backupRow()])));
    setup();
    expect(await screen.findByText(/lb-2026-08-29-1000\.json/)).toBeInTheDocument();
  });

  it('shows the empty hint when there are no backups', async () => {
    mswServer.use(http.get('/api/backups', () => HttpResponse.json([])));
    setup();
    expect(await screen.findByText(/use create backup to compile/i)).toBeInTheDocument();
  });

  it('creates a backup tagged with the acting user', async () => {
    let body: unknown;
    mswServer.use(
      http.post('/api/backups/create', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ filename: 'lb-new.json' });
      }),
    );
    const { onAddNotification, user } = setup();

    await user.click(screen.getByRole('button', { name: /create live cloud backup/i }));

    await waitFor(() => expect(body).toEqual({ createdBy: 'Mia Manager' }));
    await waitFor(() => expect(onAddNotification).toHaveBeenCalled());
  });

  it('requires confirmation before a production restore, then calls the restore API', async () => {
    let hitHeader: string | null = null;
    mswServer.use(
      http.get('/api/backups', () => HttpResponse.json([backupRow()])),
      http.post('/api/backups/restore', ({ request }) => {
        hitHeader = request.headers.get('x-user-id');
        return HttpResponse.json({ state: {} });
      }),
    );
    const { onRefreshAppState, user } = setup();

    await user.click(await screen.findByRole('button', { name: /^restore$/i }));
    // dialog first — nothing sent yet
    expect(hitHeader).toBeNull();
    expect(screen.getByRole('button', { name: /authorize overwrite override/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /authorize overwrite override/i }));

    await waitFor(() => expect(onRefreshAppState).toHaveBeenCalled());
    expect(hitHeader).toBe('mgr');
  });

  it('surfaces a restore failure and does not refresh app state', async () => {
    mswServer.use(
      http.get('/api/backups', () => HttpResponse.json([backupRow()])),
      http.post('/api/backups/restore', () => HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 })),
    );
    const { onRefreshAppState, user } = setup();

    await user.click(await screen.findByRole('button', { name: /^restore$/i }));
    await user.click(screen.getByRole('button', { name: /authorize overwrite override/i }));

    expect(await screen.findByText(/restore failed/i)).toBeInTheDocument();
    expect(onRefreshAppState).not.toHaveBeenCalled();
  });

  it('shows the RESTORE control to a GeneralManager (manager-level access or above)', async () => {
    mswServer.use(http.get('/api/backups', () => HttpResponse.json([backupRow()])));
    setup({ currentUser: makeUser({ id: 'gm', role: 'GeneralManager' }) });

    await screen.findByText(/lb-2026-08-29-1000\.json/);
    expect(await screen.findByRole('button', { name: /^restore$/i })).toBeInTheDocument();
  });

  it('hides the RESTORE control from an Assistant', async () => {
    mswServer.use(http.get('/api/backups', () => HttpResponse.json([backupRow()])));
    setup({ currentUser: makeUser({ id: 'asst', role: 'Assistant' }) });

    await screen.findByText(/lb-2026-08-29-1000\.json/);
    expect(screen.queryByRole('button', { name: /^restore$/i })).not.toBeInTheDocument();
  });
});
