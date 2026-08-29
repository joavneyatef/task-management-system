import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeComplaint, makeDepartment, makeOrg, makeUser } from '../../test/factories';
import { renderWithProviders, screen, waitFor } from '../../test/renderWithProviders';
import Complaints from './Complaints';

const DAY = 86_400_000;
const departments = [
  makeDepartment({ id: 'dept-it', name: 'IT Department', directorId: 'dir', complaintReasons: ['Slow Wi-Fi'] }),
  makeDepartment({ id: 'dept-fnb', name: 'F&B Department', directorId: 'fnb-dir', complaintReasons: ['Cold food'] }),
];

function setup(overrides: Partial<React.ComponentProps<typeof Complaints>> = {}) {
  const org = makeOrg();
  const onUpdateComplaints = vi.fn();
  const onAddNotification = vi.fn();
  const props: React.ComponentProps<typeof Complaints> = {
    complaints: [],
    departments,
    users: org.all,
    currentUser: org.gm,
    onUpdateComplaints,
    onAddNotification,
    ...overrides,
  };
  return { org, onUpdateComplaints, onAddNotification, ...renderWithProviders(<Complaints {...props} />) };
}

const openRow = (user: ReturnType<typeof setup>['user'], title: string) =>
  user.click(screen.getByRole('button', { name: new RegExp(title, 'i') }));

// After a row is expanded and the current user can manage it, the comboboxes are:
// [0] dept filter, [1] status filter, [2] assign-to, [3] status.
const assignSelect = () => screen.getAllByRole('combobox')[2];
const statusSelect = () => screen.getAllByRole('combobox')[3];
const noteInput = () => screen.getByPlaceholderText(/note about the action/i);
const noteSubmit = () => noteInput().nextElementSibling as HTMLElement;

describe('Complaints — visibility', () => {
  it('shows every complaint to the GM', () => {
    setup({
      complaints: [
        makeComplaint({ id: 'c1', title: 'Lobby AP down', departmentId: 'dept-it' }),
        makeComplaint({ id: 'c2', title: 'Buffet cold', departmentId: 'dept-fnb' }),
      ],
    });
    expect(screen.getByText('Lobby AP down')).toBeInTheDocument();
    expect(screen.getByText('Buffet cold')).toBeInTheDocument();
  });

  it('shows an Assistant only complaints assigned to them', () => {
    const org = makeOrg();
    renderWithProviders(
      <Complaints
        complaints={[
          makeComplaint({ id: 'mine', title: 'My complaint', departmentId: 'dept-it', assignedToId: 'asst' }),
          makeComplaint({ id: 'other', title: 'Not my complaint', departmentId: 'dept-it', assignedToId: 'mgr' }),
        ]}
        departments={departments}
        users={org.all}
        currentUser={org.asst}
        onUpdateComplaints={vi.fn()}
        onAddNotification={vi.fn()}
      />,
    );
    expect(screen.getByText('My complaint')).toBeInTheDocument();
    expect(screen.queryByText('Not my complaint')).not.toBeInTheDocument();
  });

  it('renders the empty state when nothing matches the filters', async () => {
    const { user } = setup({ complaints: [makeComplaint({ title: 'IT issue', departmentId: 'dept-it' })] });
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'dept-fnb');
    expect(await screen.findByText(/no complaints match/i)).toBeInTheDocument();
  });

  it('filters by department and reflects the result count', async () => {
    const { user } = setup({
      complaints: [
        makeComplaint({ id: 'a', title: 'IT issue', departmentId: 'dept-it' }),
        makeComplaint({ id: 'b', title: 'FnB issue', departmentId: 'dept-fnb' }),
      ],
    });
    expect(screen.getByText(/2 results/i)).toBeInTheDocument();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'dept-it');
    expect(screen.getByText(/1 results/i)).toBeInTheDocument();
    expect(screen.queryByText('FnB issue')).not.toBeInTheDocument();
  });

  it('warns when a complaint has been unresolved for over 24 hours', () => {
    setup({
      complaints: [
        makeComplaint({ title: 'Stale one', status: 'Open', createdAt: new Date(Date.now() - 2 * DAY).toISOString() }),
      ],
    });
    expect(screen.getByText(/unresolved for more than 24 hours/i)).toBeInTheDocument();
  });
});

describe('Complaints — actions', () => {
  it('assigns a complaint and advances it to In Progress', async () => {
    const { onUpdateComplaints, user } = setup({
      complaints: [makeComplaint({ id: 'c1', title: 'Assign me', departmentId: 'dept-it', status: 'Open' })],
    });
    await openRow(user, 'Assign me');
    await user.selectOptions(assignSelect(), 'asst');

    const updated = onUpdateComplaints.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'c1');
    expect(updated).toMatchObject({ assignedToId: 'asst', status: 'In Progress' });
    expect(updated.history.at(-1)).toMatchObject({ type: 'assign' });
  });

  it('resolves a complaint and fires a notification', async () => {
    const { onUpdateComplaints, onAddNotification, user } = setup({
      complaints: [makeComplaint({ id: 'c1', title: 'Resolve me', departmentId: 'dept-it', status: 'In Progress' })],
    });
    await openRow(user, 'Resolve me');
    await user.selectOptions(statusSelect(), 'Resolved');

    const updated = onUpdateComplaints.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'c1');
    expect(updated.status).toBe('Resolved');
    expect(updated.resolvedAt).toBeTruthy();
    expect(onAddNotification).toHaveBeenCalledWith(
      expect.stringMatching(/resolved/i),
      expect.stringContaining('Resolve me'),
      'Complaint',
    );
  });

  it('appends a note to the history and ignores an empty note', async () => {
    const { onUpdateComplaints, user } = setup({
      complaints: [makeComplaint({ id: 'c1', title: 'Note me', departmentId: 'dept-it' })],
    });
    await openRow(user, 'Note me');

    await user.click(noteSubmit());
    expect(onUpdateComplaints).not.toHaveBeenCalled();

    await user.type(noteInput(), 'Replaced the access point');
    await user.click(noteSubmit());

    const updated = onUpdateComplaints.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'c1');
    expect(updated.history.at(-1)).toMatchObject({ type: 'note', details: 'Replaced the access point' });
  });

  it('deletes a complaint', async () => {
    const { onUpdateComplaints, user } = setup({
      complaints: [
        makeComplaint({ id: 'keep', title: 'Keep me', departmentId: 'dept-it' }),
        makeComplaint({ id: 'gone', title: 'Delete me', departmentId: 'dept-it' }),
      ],
    });
    await openRow(user, 'Delete me');
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onUpdateComplaints).toHaveBeenCalledWith([expect.objectContaining({ id: 'keep' })]);
  });

  it('treats a GeneralManager-role user as a manager (regression: was a literal "GM" check)', async () => {
    const gm = makeUser({ id: 'boss', role: 'GeneralManager', name: 'Grace GM' });
    const { user } = setup({
      currentUser: gm,
      users: [gm, makeUser({ id: 'asst', role: 'Assistant', departmentId: 'dept-it' })],
      complaints: [makeComplaint({ id: 'c1', title: 'Unassigned one', departmentId: 'dept-it', assignedToId: null })],
    });
    await openRow(user, 'Unassigned one');
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it('hides management controls from a viewer who does not own the complaint', async () => {
    const org = makeOrg();
    const { user } = renderWithProviders(
      <Complaints
        complaints={[makeComplaint({ id: 'c1', title: 'Dept complaint', departmentId: 'dept-it', assignedToId: null })]}
        departments={departments}
        users={org.all}
        currentUser={org.dir}
        onUpdateComplaints={vi.fn()}
        onAddNotification={vi.fn()}
      />,
    );
    await openRow(user, 'Dept complaint');
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/note about the action/i)).not.toBeInTheDocument();
  });
});

describe('Complaints — create', () => {
  it('logs a new complaint routed to the responsible director', async () => {
    const { onUpdateComplaints, onAddNotification, user } = setup();

    await user.click(screen.getByRole('button', { name: /log new complaint/i }));
    // No <label for>/id wiring: the title box is the first textbox in the modal form.
    await user.type(screen.getAllByRole('textbox')[0], 'Corridor Wi-Fi dead');
    await user.click(screen.getByRole('button', { name: /^log complaint$/i }));

    await waitFor(() => expect(onUpdateComplaints).toHaveBeenCalled());
    const created = onUpdateComplaints.mock.calls.at(-1)![0][0];
    expect(created).toMatchObject({
      title: 'Corridor Wi-Fi dead',
      departmentId: 'dept-it',
      assignedToId: 'dir',
      status: 'Open',
      source: 'Exclusivi',
    });
    expect(onAddNotification).toHaveBeenCalledWith(
      expect.stringMatching(/complaint/i),
      expect.any(String),
      'Complaint',
      'dir',
    );
  });
});
