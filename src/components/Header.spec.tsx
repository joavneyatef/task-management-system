import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeNotification, makeUser } from '../../test/factories';
import { renderWithProviders, screen } from '../../test/renderWithProviders';
import Header from './Header';

function setup(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    currentUser: makeUser({ id: 'u1', name: 'Casey Coord', role: 'Coordinator', email: 'casey@hotel.test' }),
    users: [],
    onLogout: vi.fn(),
    onUpdateProfile: vi.fn().mockResolvedValue({ ok: true }),
    notifications: [],
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<Header {...props} />) };
}

describe('Header', () => {
  it('shows the current user name and a role badge', () => {
    setup({ currentUser: makeUser({ name: 'Gina GM', role: 'GeneralManager' }) });
    expect(screen.getByText('Gina GM')).toBeInTheDocument();
    expect(screen.getByText('General Manager')).toBeInTheDocument();
  });

  it('toggles the theme', async () => {
    const onToggleTheme = vi.fn();
    const { user } = setup({ theme: 'dark', onToggleTheme });
    await user.click(screen.getByTitle(/switch to light mode/i));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('switches language between EN and AR', async () => {
    const { user } = setup();
    const langBtn = screen.getByTitle(/toggle arabic \/ english/i);
    expect(langBtn).toHaveTextContent('العربية');
    await user.click(langBtn);
    expect(screen.getByTitle(/toggle arabic \/ english/i)).toHaveTextContent('EN');
  });

  it('badges the unread count and lists notifications in the drawer', async () => {
    const notifications = [
      makeNotification({ id: 'n1', title: 'Task started', recipientUserId: 'u1', acknowledgedAt: '2026-08-29T10:00:00Z', isRead: false }),
      makeNotification({ id: 'n2', title: 'Task done', recipientUserId: 'u1', acknowledgedAt: '2026-08-29T11:00:00Z', isRead: true }),
      makeNotification({ id: 'n3', title: 'Someone else', recipientUserId: 'other', acknowledgedAt: '2026-08-29T12:00:00Z', isRead: false }),
    ];
    const { user } = setup({ notifications });

    expect(screen.getByText('1')).toBeInTheDocument(); // one unread for this user
    await user.click(screen.getByTitle(/system alerts & notifications/i));
    expect(screen.getByText('Task started')).toBeInTheDocument();
    expect(screen.getByText('Task done')).toBeInTheDocument();
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
  });

  it('marks a single notification read on click and all read from the header action', async () => {
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();
    const notifications = [
      makeNotification({ id: 'n1', title: 'Ping', recipientUserId: 'u1', acknowledgedAt: '2026-08-29T10:00:00Z', isRead: false }),
    ];
    const { user } = setup({ notifications, onMarkRead, onMarkAllRead });

    await user.click(screen.getByTitle(/system alerts & notifications/i));
    await user.click(screen.getByText('Ping'));
    expect(onMarkRead).toHaveBeenCalledWith('n1');

    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the user has no notifications', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle(/system alerts & notifications/i));
    expect(screen.getByText(/no active ops alerts/i)).toBeInTheDocument();
  });

  it('opens the profile modal and logs out from the profile menu', async () => {
    const onLogout = vi.fn();
    const { user } = setup({ onLogout });

    await user.click(screen.getByRole('button', { name: /casey coord/i }));
    await user.click(screen.getByRole('button', { name: /user profile & password/i }));
    expect(await screen.findByRole('heading', { name: /profile/i })).toBeInTheDocument();

    // reopen menu, log out
    await user.click(screen.getByRole('button', { name: /casey coord/i }));
    await user.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows the mobile sidebar-drawer toggle only when onOpenMenu is given', async () => {
    const onOpenMenu = vi.fn();
    const { user } = setup({ onOpenMenu });
    const toggle = screen.getByRole('button', { name: /open menu/i });
    await user.click(toggle);
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('renders no drawer toggle when onOpenMenu is not passed', () => {
    setup();
    expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument();
  });
});
