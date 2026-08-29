import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeUser } from '../../test/factories';
import { renderWithProviders, screen, within } from '../../test/renderWithProviders';
import StaffLeave from './StaffLeave';

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
afterEach(() => {
  alertSpy.mockClear();
  confirmSpy.mockClear();
  confirmSpy.mockReturnValue(true);
});

function setup(overrides: Partial<React.ComponentProps<typeof StaffLeave>> = {}) {
  const me = makeUser({ id: 'me', name: 'Me Myself', role: 'Manager', title: 'IT Manager', status: 'Active' });
  const other = makeUser({ id: 'other', name: 'Otto Tech', title: 'Cloud Engineer', status: 'Active' });
  const onUpdateUsers = vi.fn();
  const onAddNotification = vi.fn();
  const props: React.ComponentProps<typeof StaffLeave> = {
    users: [me, other],
    currentUser: me,
    onUpdateUsers,
    onAddNotification,
    ...overrides,
  };
  return { me, other, onUpdateUsers, onAddNotification, ...renderWithProviders(<StaffLeave {...props} />) };
}

const statusSelectFor = (name: string) =>
  within(screen.getByRole('heading', { name }).closest('.rounded-2xl') as HTMLElement).getByRole('combobox');

describe('StaffLeave', () => {
  it('renders a roster card per user', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Me Myself' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Otto Tech' })).toBeInTheDocument();
  });

  it('sends another user On Leave with a System redistribution notification and an alert', async () => {
    const { onUpdateUsers, user } = setup();

    await user.selectOptions(statusSelectFor('Otto Tech'), 'On Leave');

    expect(onUpdateUsers).toHaveBeenCalledTimes(1);
    const [updatedUsers, notif] = onUpdateUsers.mock.calls[0];
    const otto = updatedUsers.find((u: { id: string }) => u.id === 'other');
    expect(otto.status).toBe('On Leave');
    expect(otto.updatedAt).toBeTruthy();
    expect(notif).toMatchObject({ category: 'System' });
    expect(notif.message).toMatch(/on leave/i);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/redistributed|open pool/i));
  });

  it('brings a user back to Active with a check-in notification and no alert', async () => {
    const { onUpdateUsers, user } = setup({
      users: [makeUser({ id: 'me', role: 'Manager', status: 'Active' }), makeUser({ id: 'other', name: 'Otto Tech', status: 'On Leave' })],
    });

    await user.selectOptions(statusSelectFor('Otto Tech'), 'Active');

    const [, notif] = onUpdateUsers.mock.calls[0];
    expect(notif.message).toMatch(/checked in|Active/i);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks for confirmation before the logged-in user marks themselves On Leave', async () => {
    confirmSpy.mockReturnValue(false);
    const { onUpdateUsers, user } = setup();

    await user.selectOptions(statusSelectFor('Me Myself'), 'On Leave');

    expect(confirmSpy).toHaveBeenCalled();
    expect(onUpdateUsers).not.toHaveBeenCalled();
  });

  it('proceeds with the self change once confirmed', async () => {
    confirmSpy.mockReturnValue(true);
    const { onUpdateUsers, user } = setup();

    await user.selectOptions(statusSelectFor('Me Myself'), 'On Leave');

    expect(onUpdateUsers).toHaveBeenCalledTimes(1);
    expect(onUpdateUsers.mock.calls[0][0].find((u: { id: string }) => u.id === 'me').status).toBe('On Leave');
  });
});
