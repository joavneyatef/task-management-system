import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeDepartment, makeOrg, makeTask, makeUser } from '../../test/factories';
import { fireEvent, renderWithProviders, screen, within } from '../../test/renderWithProviders';
import TaskBoard from './TaskBoard';

const departments = [makeDepartment({ id: 'dept-it', name: 'IT Department' })];

function setup(overrides: Partial<React.ComponentProps<typeof TaskBoard>> = {}) {
  const org = makeOrg();
  const onUpdateTasks = vi.fn();
  const onAddNotification = vi.fn();
  const props: React.ComponentProps<typeof TaskBoard> = {
    tasks: [],
    users: org.all,
    currentUser: org.gm,
    onUpdateTasks,
    onAddNotification,
    departments,
    ...overrides,
  };
  return { org, onUpdateTasks, onAddNotification, ...renderWithProviders(<TaskBoard {...props} />) };
}

const createBtn = () => screen.queryByRole('button', { name: /log \/ dispatch task/i });
const titleInput = () => screen.getByPlaceholderText(/opera pms sync latency|room rfid/i);
const submitCreate = () => fireEvent.submit(titleInput().closest('form')!);

describe('TaskBoard — create-task gating', () => {
  it('offers the create button to the GM but not to an Assistant', () => {
    const org = makeOrg();
    const { unmount } = renderWithProviders(
      <TaskBoard tasks={[]} users={org.all} currentUser={org.gm} onUpdateTasks={vi.fn()} onAddNotification={vi.fn()} departments={departments} />,
    );
    expect(screen.getByRole('button', { name: /log \/ dispatch task/i })).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <TaskBoard tasks={[]} users={org.all} currentUser={org.asst} onUpdateTasks={vi.fn()} onAddNotification={vi.fn()} departments={departments} />,
    );
    expect(screen.queryByRole('button', { name: /log \/ dispatch task/i })).not.toBeInTheDocument();
  });
});

describe('TaskBoard — create modal', () => {
  it('lists exactly the users the current role may assign to', async () => {
    const org = makeOrg();
    const { user } = renderWithProviders(
      <TaskBoard tasks={[]} users={org.all} currentUser={org.mgr} onUpdateTasks={vi.fn()} onAddNotification={vi.fn()} departments={departments} />,
    );
    await user.click(screen.getByRole('button', { name: /log \/ dispatch task/i }));
    // A Manager can assign to themselves + department Assistants only
    expect(screen.getByRole('checkbox', { name: /Sam Assistant/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Dana Director/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Otto Other/i })).not.toBeInTheDocument();
  });

  it('creates one independent ticket per selected recipient', async () => {
    const { onUpdateTasks, user } = setup();
    await user.click(createBtn()!);

    await user.type(titleInput(), 'Swap lobby switch');
    await user.click(screen.getByRole('checkbox', { name: /Dana Director/i }));
    await user.click(screen.getByRole('checkbox', { name: /Sam Assistant/i }));
    submitCreate();

    expect(onUpdateTasks).toHaveBeenCalledTimes(1);
    const created = onUpdateTasks.mock.calls[0][0];
    expect(created).toHaveLength(2);
    expect(created.map((t: { assigneeId: string }) => t.assigneeId).sort()).toEqual(['asst', 'dir']);
    for (const t of created) {
      expect(t).toMatchObject({
        title: 'Swap lobby switch',
        priority: 'Medium',
        status: 'Open',
        createdBy: 'gm',
        assignedBy: 'gm',
      });
      expect(t.assigneeIds).toEqual([t.assigneeId]);
    }
  });

  it('does nothing when no recipient is selected', async () => {
    const { onUpdateTasks, user } = setup();
    await user.click(createBtn()!);
    await user.type(titleInput(), 'Orphan task');
    submitCreate();
    expect(onUpdateTasks).not.toHaveBeenCalled();
  });

  it('logs a directly-completed ticket with a duration', async () => {
    const { onUpdateTasks, user } = setup();
    await user.click(createBtn()!);
    await user.type(titleInput(), 'Already fixed the AP');
    await user.click(screen.getByRole('checkbox', { name: /Sam Assistant/i }));
    await user.click(screen.getByRole('checkbox', { name: /mark as completed \/ resolved directly/i }));
    submitCreate();

    const t = onUpdateTasks.mock.calls[0][0][0];
    expect(t).toMatchObject({ status: 'Completed', completedById: 'gm' });
    expect(t.actualDurationSec).toBeGreaterThan(0);
    expect(t.completedAt).toBeTruthy();
  });
});

describe('TaskBoard — overview visibility', () => {
  it('shows a task row to the GM', () => {
    setup({ tasks: [makeTask({ id: 't1', title: 'Rack audit', assigneeIds: ['asst'], departmentId: 'dept-it' })] });
    expect(screen.getByText('Rack audit')).toBeInTheDocument();
  });

  it('hides a task from an Assistant who is not a recipient', () => {
    const org = makeOrg();
    renderWithProviders(
      <TaskBoard
        tasks={[
          makeTask({ id: 'mine', title: 'My ticket', assigneeIds: ['asst'], departmentId: 'dept-it' }),
          makeTask({ id: 'theirs', title: 'Their ticket', assigneeIds: ['mgr'], createdBy: 'mgr', departmentId: 'dept-it' }),
        ]}
        users={org.all}
        currentUser={org.asst}
        onUpdateTasks={vi.fn()}
        onAddNotification={vi.fn()}
        departments={departments}
      />,
    );
    expect(screen.getByText('My ticket')).toBeInTheDocument();
    expect(screen.queryByText('Their ticket')).not.toBeInTheDocument();
  });
});
