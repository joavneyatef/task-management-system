import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeUser } from '../../test/factories';
import { renderWithProviders, screen, waitFor } from '../../test/renderWithProviders';
import UserProfileModal from './UserProfileModal';

function setup(overrides: Partial<React.ComponentProps<typeof UserProfileModal>> = {}) {
  const onClose = vi.fn();
  const onUpdateProfile = vi.fn().mockResolvedValue({ ok: true });
  const props: React.ComponentProps<typeof UserProfileModal> = {
    isOpen: true,
    onClose,
    currentUser: makeUser({ id: 'me', name: 'Casey Coord', email: 'casey@hotel.test', phone: '+20 100' }),
    users: [],
    onUpdateProfile,
    theme: 'dark',
    onToggleTheme: vi.fn(),
    ...overrides,
  };
  return { onClose, onUpdateProfile, ...renderWithProviders(<UserProfileModal {...props} />) };
}

const nameField = () => screen.getAllByRole('textbox')[0];
const saveBtn = () => screen.getByRole('button', { name: /save changes/i });

describe('UserProfileModal', () => {
  it('renders nothing while closed', () => {
    const { container } = setup({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills the form from the current user', () => {
    setup();
    expect(nameField()).toHaveValue('Casey Coord');
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('casey@hotel.test');
  });

  it('saves a normalized profile payload and shows a success message', async () => {
    const { onUpdateProfile, user } = setup();

    await user.clear(nameField());
    await user.type(nameField(), 'Casey Renamed');
    await user.clear(screen.getAllByRole('textbox')[1]);
    await user.type(screen.getAllByRole('textbox')[1], 'Casey.NEW@Hotel.test');
    await user.click(saveBtn());

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledTimes(1));
    expect(onUpdateProfile.mock.calls[0][0]).toMatchObject({
      name: 'Casey Renamed',
      email: 'casey.new@hotel.test',
    });
    expect(onUpdateProfile.mock.calls[0][1]).toBeUndefined(); // no password change
    expect(await screen.findByText(/profile updated successfully/i)).toBeInTheDocument();
  });

  it('surfaces the error returned by onUpdateProfile', async () => {
    const onUpdateProfile = vi.fn().mockResolvedValue({ ok: false, error: 'This email is already in use.' });
    const { user } = setup({ onUpdateProfile });

    await user.clear(nameField());
    await user.type(nameField(), 'Casey');
    await user.click(saveBtn());

    expect(await screen.findByText('This email is already in use.')).toBeInTheDocument();
  });

  it('rejects a blank name without calling the API', async () => {
    const { onUpdateProfile, user } = setup();
    await user.clear(nameField());
    await user.type(nameField(), '   ');
    await user.click(saveBtn());

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it('disables Save while the new password is weak or unconfirmed', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /security/i }));

    await user.type(screen.getByPlaceholderText(/enter new password/i), 'Str0ngPass');
    expect(saveBtn()).toBeDisabled(); // not confirmed yet
    await user.type(screen.getByPlaceholderText(/re-enter password/i), 'different');
    expect(saveBtn()).toBeDisabled(); // mismatch
    await user.clear(screen.getByPlaceholderText(/re-enter password/i));
    await user.type(screen.getByPlaceholderText(/re-enter password/i), 'Str0ngPass');
    expect(saveBtn()).toBeEnabled();
  });

  it('submits a valid new password alongside the profile fields', async () => {
    const { onUpdateProfile, user } = setup();
    await user.click(screen.getByRole('button', { name: /security/i }));

    await user.type(screen.getByPlaceholderText(/enter new password/i), 'Str0ngPass');
    await user.type(screen.getByPlaceholderText(/re-enter password/i), 'Str0ngPass');
    await user.click(saveBtn());

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledTimes(1));
    expect(onUpdateProfile.mock.calls[0][1]).toBe('Str0ngPass');
  });

  it('closes via the Cancel button', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
