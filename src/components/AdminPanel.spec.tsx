import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { makeDepartment, makeUser } from '../../test/factories';
import { mswServer } from '../../test/msw/server';
import { renderWithProviders, screen, waitFor } from '../../test/renderWithProviders';
import AdminPanel from './AdminPanel';

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
afterEach(() => alertSpy.mockClear());

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
  return { currentUser, onUpdateUsers, onAddNotification, onUpdateDepartments, ...renderWithProviders(<AdminPanel {...props} />) };
}

const openAddForm = (user: ReturnType<typeof setup>['user']) =>
  user.click(screen.getByRole('button', { name: /register new user/i }));

describe('AdminPanel — roster', () => {
  it('lists the crew and toggles the add-user form', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: /Sam Assistant/i })).toBeInTheDocument();

    await openAddForm(user);
    expect(screen.getByPlaceholderText(/e\.g\. ahmed\.adel/i)).toBeInTheDocument();
  });

  it('registers a new user with a normalized payload and a System notification', async () => {
    const { onUpdateUsers, user } = setup();
    await openAddForm(user);

    await user.type(screen.getByPlaceholderText(/e\.g\. ahmed adel/i), 'New Tech');
    await user.type(screen.getByPlaceholderText(/e\.g\. ahmed\.adel/i), 'New.Tech');
    await user.type(screen.getByPlaceholderText(/^123456$/), '482913');
    await user.type(screen.getByPlaceholderText(/VLAN, Cisco/i), 'VLAN, Firewalls');
    await user.click(screen.getByRole('button', { name: /register new user/i }));

    await waitFor(() => expect(onUpdateUsers).toHaveBeenCalled());
    const [nextUsers, notif] = onUpdateUsers.mock.calls.at(-1)!;
    const created = nextUsers.at(-1);
    expect(created).toMatchObject({
      name: 'New Tech',
      username: 'new.tech',
      password: '482913',
      pin: '482913',
      status: 'Active',
      skills: ['VLAN', 'Firewalls'],
    });
    expect(notif).toMatchObject({ category: 'System' });
  });

  it('rejects a duplicate username without updating', async () => {
    const { onUpdateUsers, user } = setup();
    await openAddForm(user);

    await user.type(screen.getByPlaceholderText(/e\.g\. ahmed adel/i), 'Clash');
    await user.type(screen.getByPlaceholderText(/e\.g\. ahmed\.adel/i), 'SAM'); // existing username is 'sam'
    await user.type(screen.getByPlaceholderText(/^123456$/), '482913');
    await user.click(screen.getByRole('button', { name: /register new user/i }));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/already taken/i));
    expect(onUpdateUsers).not.toHaveBeenCalled();
  });
});

describe('AdminPanel — delete user', () => {
  const selectAndDelete = async (user: ReturnType<typeof setup>['user'], name: string) => {
    await user.click(screen.getByRole('button', { name: new RegExp(name, 'i') }));
    await user.click(await screen.findByRole('button', { name: /delete user/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete/i }));
  };

  it('refuses to delete the currently logged-in account', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Gina GM/i }));
    // own account has no delete affordance; force the handler path via the roster is not possible,
    // so assert the guard indirectly: selecting self shows no "Delete User" button
    expect(screen.queryByRole('button', { name: /delete user/i })).not.toBeInTheDocument();
  });

  it('deletes another user after the server confirms', async () => {
    let hitHeader: string | null = null;
    mswServer.use(
      http.delete('/api/users/:id', ({ request }) => {
        hitHeader = request.headers.get('x-user-id');
        return HttpResponse.json({ success: true });
      }),
    );
    const { onUpdateUsers, user } = setup();
    await selectAndDelete(user, 'Sam Assistant');

    await waitFor(() => expect(onUpdateUsers).toHaveBeenCalled());
    expect(hitHeader).toBe('gm');
    const nextUsers = onUpdateUsers.mock.calls.at(-1)![0];
    expect(nextUsers.map((u: { id: string }) => u.id)).not.toContain('asst');
  });

  it('keeps the user and alerts when the server rejects the delete', async () => {
    mswServer.use(http.delete('/api/users/:id', () => HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 })));
    const { onUpdateUsers, user } = setup();
    await selectAndDelete(user, 'Sam Assistant');

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/failed to delete/i)));
    expect(onUpdateUsers).not.toHaveBeenCalled();
  });
});

describe('AdminPanel — departments', () => {
  it('creates a department from the Departments sub-tab', async () => {
    const { onUpdateDepartments, user } = setup();
    await user.click(screen.getByRole('button', { name: /departments/i }));
    await user.click(screen.getByRole('button', { name: /add department|new department/i }));

    await user.type(screen.getByPlaceholderText(/department name/i), 'Housekeeping');
    await user.click(screen.getByRole('button', { name: /^(create|save|add)/i }));

    await waitFor(() => expect(onUpdateDepartments).toHaveBeenCalled());
    const next = onUpdateDepartments.mock.calls.at(-1)![0];
    expect(next.at(-1)).toMatchObject({ name: 'Housekeeping' });
  });
});
