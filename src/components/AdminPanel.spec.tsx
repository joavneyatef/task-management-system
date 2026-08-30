import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeDepartment, makeUser } from '../../test/factories';
import { renderWithProviders, screen, waitFor } from '../../test/renderWithProviders';
import AdminPanel from './AdminPanel';

function setup(overrides: Partial<React.ComponentProps<typeof AdminPanel>> = {}) {
  const currentUser = makeUser({ id: 'gm', name: 'Gina GM', role: 'GeneralManager' });
  const onUpdateUsers = vi.fn();
  const onAddNotification = vi.fn();
  const onUpdateDepartments = vi.fn();
  const props: React.ComponentProps<typeof AdminPanel> = {
    users: [currentUser, makeUser({ id: 'asst', name: 'Sam Assistant', username: 'sam', role: 'Assistant' })],
    currentUser,
    onUpdateUsers,
    onAddNotification,
    serverEnv: 'production',
    onEnvironmentChanged: vi.fn(),
    onRefreshAppState: vi.fn(),
    departments: [makeDepartment({ id: 'dept-it', name: 'IT Department' })],
    onUpdateDepartments,
    ...overrides,
  };
  return { currentUser, onUpdateUsers, onUpdateDepartments, ...renderWithProviders(<AdminPanel {...props} />) };
}

describe('AdminPanel', () => {
  it('is a single Departments view with no crew / PIN management', () => {
    setup();
    // The "Control Crew & PINs" roster tab was removed.
    expect(screen.queryByRole('button', { name: /crew identity & keys/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register new user/i })).not.toBeInTheDocument();
    // Departments editor is shown directly.
    expect(screen.getByRole('button', { name: /add department/i })).toBeInTheDocument();
    expect(screen.getByText('IT Department')).toBeInTheDocument();
  });

  it('no longer exposes the Backup & Restore or Brand Identity sub-tabs', () => {
    setup();
    expect(screen.queryByRole('button', { name: /backup & restore/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /brand identity & logo/i })).not.toBeInTheDocument();
  });

  it('creates a department from the Departments sub-tab', async () => {
    const { onUpdateDepartments, user } = setup();
    await user.click(screen.getByRole('button', { name: /add department/i }));

    await user.type(screen.getByPlaceholderText(/department name/i), 'Housekeeping');
    await user.click(screen.getByRole('button', { name: /save department/i }));

    await waitFor(() => expect(onUpdateDepartments).toHaveBeenCalled());
    const next = onUpdateDepartments.mock.calls.at(-1)![0];
    expect(next.at(-1)).toMatchObject({ name: 'Housekeeping' });
  });
});
