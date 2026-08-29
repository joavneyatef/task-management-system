import type React from 'react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeOrg, makeUser } from '../../test/factories';
import { mswServer } from '../../test/msw/server';
import { renderWithProviders, screen, waitFor, within } from '../../test/renderWithProviders';
import LoginPage from './LoginPage';

const org = makeOrg();

function setup(props: Partial<React.ComponentProps<typeof LoginPage>> = {}) {
  const onLogin = vi.fn();
  const onSignup = vi.fn().mockResolvedValue({ ok: true });
  const utils = renderWithProviders(
    <LoginPage users={org.all} onLogin={onLogin} onSignup={onSignup} {...props} />,
  );
  return { onLogin, onSignup, ...utils };
}

const idField = () => screen.getByPlaceholderText(/enter name or work email/i);
const pwField = () => screen.getByPlaceholderText(/^enter password$/i);
const signInBtn = () => screen.getByRole('button', { name: /^sign in$/i });

describe('LoginPage — sign in', () => {
  it('validates the identifier before hitting the API', async () => {
    const hit = vi.fn();
    mswServer.use(http.post('/api/auth/login', () => (hit(), HttpResponse.json({ success: true, user: org.mgr }))));
    const { user, onLogin } = setup();

    await user.type(idField(), '   ');
    await user.type(pwField(), 'whatever');
    await user.click(signInBtn());

    expect(await screen.findByText(/please enter your name or work email/i)).toBeInTheDocument();
    expect(hit).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('calls onLogin with the user returned by the server', async () => {
    mswServer.use(http.post('/api/auth/login', () => HttpResponse.json({ success: true, user: org.dir })));
    const { user, onLogin } = setup();

    await user.type(idField(), 'dir@hotel.test');
    await user.type(pwField(), 'Passw0rd!');
    await user.click(signInBtn());

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(org.dir));
  });

  it('shows the server error message verbatim and does not log in', async () => {
    mswServer.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'ACCOUNT_DISABLED', message: 'This account is currently off duty.' }, { status: 403 }),
      ),
    );
    const { user, onLogin } = setup();

    await user.type(idField(), 'someone');
    await user.type(pwField(), 'Passw0rd!');
    await user.click(signInBtn());

    expect(await screen.findByText('This account is currently off duty.')).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('shows a connection error when the request fails', async () => {
    mswServer.use(http.post('/api/auth/login', () => HttpResponse.error()));
    const { user } = setup();

    await user.type(idField(), 'someone');
    await user.type(pwField(), 'Passw0rd!');
    await user.click(signInBtn());

    expect(await screen.findByText(/unable to connect to server/i)).toBeInTheDocument();
  });

  it('disables the submit button while the request is in flight', async () => {
    mswServer.use(http.post('/api/auth/login', async () => { await delay('infinite'); return HttpResponse.json({}); }));
    const { user } = setup();

    await user.type(idField(), 'someone');
    await user.type(pwField(), 'Passw0rd!');
    const btn = signInBtn();
    await user.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
  });

  it('clears a visible error as soon as the user edits a field', async () => {
    const { user } = setup();
    await user.type(idField(), '   ');
    await user.type(pwField(), 'x');
    await user.click(signInBtn());
    expect(await screen.findByText(/please enter your name or work email/i)).toBeInTheDocument();

    await user.type(idField(), 'a');
    expect(screen.queryByText(/please enter your name or work email/i)).not.toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const { user } = setup();
    const pw = pwField();
    expect(pw).toHaveAttribute('type', 'password');
    const eye = pw.parentElement!.querySelector('button')!;
    await user.click(eye);
    expect(pw).toHaveAttribute('type', 'text');
  });
});

describe('LoginPage — sign up', () => {
  const goToSignup = async (user: ReturnType<typeof setup>['user']) => {
    await user.click(screen.getByRole('button', { name: /create account \/ sign up/i }));
    expect(await screen.findByRole('heading', { name: /^create account$/i })).toBeInTheDocument();
  };
  // No <label for>/id wiring in this form, so address the selects positionally:
  // 0 = Role, 1 = Department, 2 = Reports To.
  const selects = () => screen.getAllByRole('combobox');
  const signupPw = () => screen.getByPlaceholderText(/^password$/i);
  const createBtn = () => screen.getByRole('button', { name: /^create account$/i });

  it('switches to the signup form and back', async () => {
    const { user } = setup();
    await goToSignup(user);
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(await screen.findByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument();
  });

  it('keeps the submit button disabled until the password satisfies every rule', async () => {
    const { user } = setup();
    await goToSignup(user);
    expect(createBtn()).toBeDisabled();

    await user.type(signupPw(), 'weak');
    expect(createBtn()).toBeDisabled();

    await user.type(signupPw(), 'Str0ng'); // -> "weakStr0ng": 10 chars, upper+lower+digit
    expect(createBtn()).toBeEnabled();
  });

  it('submits a normalized payload and logs in with the returned user', async () => {
    const created = makeUser({ id: 'new-hire' });
    const onSignup = vi.fn().mockResolvedValue({ ok: true, user: created });
    const { user, onLogin } = setup({
      users: [makeUser({ id: 'it-mgr', role: 'Manager', departmentId: 'it', name: 'Ivy IT-Mgr' })],
      onSignup,
    });
    await goToSignup(user);

    await user.type(screen.getByPlaceholderText(/full name/i), 'New Hire');
    await user.type(screen.getByPlaceholderText(/job email/i), '  New.Hire@Hotel.TEST  ');
    await user.type(signupPw(), 'Str0ngPass');
    await user.selectOptions(selects()[2], 'it-mgr');
    await user.click(createBtn());

    await waitFor(() => expect(onSignup).toHaveBeenCalledTimes(1));
    expect(onSignup.mock.calls[0][0]).toMatchObject({
      name: 'New Hire',
      email: 'new.hire@hotel.test',
      role: 'Assistant',
      departmentId: 'it',
      parentId: 'it-mgr',
    });
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(created));
  });

  it('surfaces the error returned by onSignup', async () => {
    const onSignup = vi.fn().mockResolvedValue({ ok: false, error: 'This job email is already in use.' });
    const { user } = setup({
      users: [makeUser({ id: 'it-mgr', role: 'Manager', departmentId: 'it' })],
      onSignup,
    });
    await goToSignup(user);
    await user.type(screen.getByPlaceholderText(/full name/i), 'Dup User');
    await user.type(screen.getByPlaceholderText(/job email/i), 'dup@hotel.test');
    await user.type(signupPw(), 'Str0ngPass');
    await user.selectOptions(selects()[2], 'it-mgr');
    await user.click(createBtn());

    expect(await screen.findByText('This job email is already in use.')).toBeInTheDocument();
  });

  it('filters the supervisor dropdown by role and department', async () => {
    const users = [
      makeUser({ id: 'gm', role: 'GeneralManager', name: 'Gina GM' }),
      makeUser({ id: 'it-dir', role: 'Director', departmentId: 'it', name: 'Dan IT-Dir' }),
      makeUser({ id: 'it-mgr', role: 'Manager', departmentId: 'it', name: 'Ivy IT-Mgr' }),
      makeUser({ id: 'fnb-mgr', role: 'Manager', departmentId: 'fnb', name: 'Fred FnB-Mgr' }),
    ];
    const { user } = setup({ users });
    await goToSignup(user);

    const supervisor = selects()[2];
    expect(within(supervisor).getByRole('option', { name: /Dan IT-Dir/i })).toBeInTheDocument();
    expect(within(supervisor).getByRole('option', { name: /Ivy IT-Mgr/i })).toBeInTheDocument();
    expect(within(supervisor).queryByRole('option', { name: /Fred FnB-Mgr/i })).not.toBeInTheDocument();

    await user.selectOptions(selects()[0], 'Director'); // Role -> Director reports to GM
    expect(within(selects()[2]).getByRole('option', { name: /Gina GM/i })).toBeInTheDocument();
  });
});
