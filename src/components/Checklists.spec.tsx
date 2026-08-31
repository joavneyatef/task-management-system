import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChecklist, makeChecklistItem, makeDepartment, makeUser } from '../../test/factories';
import { fireEvent, renderWithProviders, screen, within } from '../../test/renderWithProviders';
import Checklists from './Checklists';

const departments = [makeDepartment({ id: 'dept-it', name: 'IT Department' })];

const fullDeptChecklists = () =>
  (['Daily', 'Weekly', 'Monthly'] as const).map((type) =>
    makeChecklist({
      id: `cl-${type}`,
      type,
      departmentId: 'dept-it',
      items: [
        makeChecklistItem({ id: 'i1', text: 'Item one' }),
        makeChecklistItem({ id: 'i2', text: 'Item two' }),
      ],
    }),
  );

function setup(overrides: Partial<React.ComponentProps<typeof Checklists>> = {}) {
  const onUpdateChecklists = vi.fn();
  const onLogHistory = vi.fn();
  const onAddNotification = vi.fn();
  const currentUser = overrides.currentUser ?? makeUser({ id: 'tech', role: 'Coordinator', departmentId: 'dept-it', name: 'Tariq Tech' });
  const props: React.ComponentProps<typeof Checklists> = {
    checklists: fullDeptChecklists(),
    users: [currentUser],
    currentUser,
    departments,
    onUpdateChecklists,
    onLogHistory,
    onAddNotification,
    ...overrides,
  };
  const utils = renderWithProviders(<Checklists {...props} />);
  return { onUpdateChecklists, onLogHistory, onAddNotification, currentUser, ...utils };
}

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
afterEach(() => alertSpy.mockClear());

describe('Checklists — department progress', () => {
  it('shows each department X/Y and % for the active checklist type', () => {
    const deps = [
      makeDepartment({ id: 'dept-it', name: 'IT Department' }),
      makeDepartment({ id: 'dept-fnb', name: 'F&B' }),
    ];
    const checklists = [
      makeChecklist({
        id: 'it-daily', type: 'Daily', departmentId: 'dept-it',
        items: [
          makeChecklistItem({ completed: true }), makeChecklistItem({ completed: true }),
          makeChecklistItem({ completed: false }), makeChecklistItem({ completed: false }),
          makeChecklistItem({ completed: false }),
        ],
      }),
      makeChecklist({ id: 'fnb-daily', type: 'Daily', departmentId: 'dept-fnb', items: [makeChecklistItem({ completed: false })] }),
    ];
    const gm = makeUser({ id: 'gm', role: 'GeneralManager', departmentId: 'dept-it', name: 'Gina' });
    setup({ currentUser: gm, users: [gm], departments: deps, checklists });

    const panel = screen.getByTestId('department-progress');
    expect(within(panel).getByText('2/5')).toBeInTheDocument();
    expect(within(panel).getByText('40%')).toBeInTheDocument();
    expect(within(panel).getByText('0/1')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /IT Department: 2 of 5 done, 40%/ })).toBeInTheDocument();
  });

  it('hides the cross-department roll-up from a Director', () => {
    const deps = [
      makeDepartment({ id: 'dept-it', name: 'IT Department' }),
      makeDepartment({ id: 'dept-fnb', name: 'F&B' }),
    ];
    const director = makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it', name: 'Dana' });
    setup({ currentUser: director, users: [director], departments: deps });

    expect(screen.queryByTestId('department-progress')).not.toBeInTheDocument();
  });

  it('hides the cross-department roll-up from a Manager', () => {
    const deps = [makeDepartment({ id: 'dept-it', name: 'IT Department' })];
    const manager = makeUser({ id: 'mgr', role: 'Manager', departmentId: 'dept-it', name: 'Mia' });
    setup({ currentUser: manager, users: [manager], departments: deps });

    expect(screen.queryByTestId('department-progress')).not.toBeInTheDocument();
  });
});

describe('Checklists — signing items', () => {
  it('does not auto-create checklists when all three schedules already exist', () => {
    const { onUpdateChecklists } = setup();
    expect(onUpdateChecklists).not.toHaveBeenCalled();
  });

  it('marks an item complete with the current user and timestamp', async () => {
    const { onUpdateChecklists, onAddNotification, user } = setup();

    await user.click(screen.getByText('Item one'));

    expect(onUpdateChecklists).toHaveBeenCalledTimes(1);
    const daily = onUpdateChecklists.mock.calls[0][0].find((c: { id: string }) => c.id === 'cl-Daily');
    const i1 = daily.items.find((it: { id: string }) => it.id === 'i1');
    expect(i1).toMatchObject({ completed: true, completedBy: 'tech' });
    expect(i1.completedAt).toBeTruthy();
    expect(onAddNotification).toHaveBeenCalledWith(
      expect.stringMatching(/verified/i),
      expect.stringContaining('Item one'),
      'Checklist',
      'Manager',
    );
  });

  it('carries an optional tech note onto the signed item', async () => {
    const { onUpdateChecklists, user } = setup();

    const itemRow = screen.getByText('Item one').closest('.select-none')!;
    await user.type(within(itemRow as HTMLElement).getByPlaceholderText(/optional tech note/i), 'panel was warm');
    await user.click(screen.getByText('Item one'));

    const daily = onUpdateChecklists.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'cl-Daily');
    expect(daily.items.find((it: { id: string }) => it.id === 'i1').note).toBe('panel was warm');
  });

  it('refuses to un-sign a completed item', async () => {
    const checklists = fullDeptChecklists();
    checklists[0].items[0] = makeChecklistItem({ id: 'i1', text: 'Item one', completed: true, completedBy: 'tech' });
    const { onUpdateChecklists, user } = setup({ checklists });

    await user.click(screen.getByText('Item one'));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/cannot be reverted/i));
    expect(onUpdateChecklists).not.toHaveBeenCalled();
  });

  it('blocks an On Leave technician from signing', async () => {
    const onLeave = makeUser({ id: 'tech', role: 'Coordinator', departmentId: 'dept-it', status: 'On Leave' });
    const { onUpdateChecklists, user } = setup({ currentUser: onLeave, users: [onLeave] });

    await user.click(screen.getByText('Item one'));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/on leave/i));
    expect(onUpdateChecklists).not.toHaveBeenCalled();
  });
});

describe('Checklists — progress and live updates', () => {
  it('shows the signed / total count and reflects a completion pushed in via props', () => {
    const { rerender } = setup();
    expect(screen.getByText(/0 of 2 signed/i)).toBeInTheDocument();

    const updated = fullDeptChecklists();
    updated[0].items[0] = makeChecklistItem({
      id: 'i1',
      text: 'Item one',
      completed: true,
      completedBy: 'other',
      completedAt: '2026-08-29T10:00:00Z',
    });
    const currentUser = makeUser({ id: 'tech', role: 'Coordinator', departmentId: 'dept-it' });
    rerender(
      <Checklists
        checklists={updated}
        users={[currentUser, makeUser({ id: 'other', name: 'Otto Other' })]}
        currentUser={currentUser}
        departments={departments}
        onUpdateChecklists={vi.fn()}
        onLogHistory={vi.fn()}
        onAddNotification={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 of 2 signed/i)).toBeInTheDocument();
    expect(screen.getByText(/Otto Other/)).toBeInTheDocument();
  });

  it('switches the active schedule when a tab is clicked', async () => {
    const checklists = fullDeptChecklists();
    checklists[1].title = 'Weekly Inspection - IT Department';
    const { user } = setup({ checklists });

    await user.click(screen.getByRole('button', { name: /weekly inspection schedule/i }));
    expect(screen.getByRole('heading', { name: 'Weekly Inspection - IT Department' })).toBeInTheDocument();
  });
});

describe('Checklists — authoring (GM / Director only)', () => {
  const director = makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it', name: 'Dana Director' });
  const manager = makeUser({ id: 'mgr', role: 'Manager', departmentId: 'dept-it', name: 'Mia Manager' });

  it('hides the add-item form from a technician', () => {
    setup();
    expect(screen.queryByPlaceholderText(/add new daily checklist item/i)).not.toBeInTheDocument();
  });

  it('lets a Director append a new item', async () => {
    const { onUpdateChecklists, onAddNotification, user } = setup({ currentUser: director, users: [director] });

    await user.type(screen.getByPlaceholderText(/add new daily checklist item/i), 'Check the UPS');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    const daily = onUpdateChecklists.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'cl-Daily');
    expect(daily.items.map((it: { text: string }) => it.text)).toContain('Check the UPS');
    expect(onAddNotification).toHaveBeenCalledWith(
      expect.stringMatching(/added/i),
      expect.stringContaining('Check the UPS'),
      'Checklist',
      'Manager',
    );
  });

  it('lets a Director delete an item', async () => {
    const { onUpdateChecklists, user } = setup({ currentUser: director, users: [director] });

    const itemRow = screen.getByText('Item two').closest('div')!.parentElement!.parentElement!;
    await user.click(within(itemRow).getByRole('button', { name: /delete/i }));

    const daily = onUpdateChecklists.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'cl-Daily');
    expect(daily.items.map((it: { id: string }) => it.id)).toEqual(['i1']);
  });

  it('gives a Manager a read-only inspection view — no add, delete, sign, or file', async () => {
    const { onUpdateChecklists, user } = setup({ currentUser: manager, users: [manager] });

    // still sees the list + progress
    expect(screen.getByText('Item one')).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 signed/i)).toBeInTheDocument();
    expect(screen.getByText(/inspection only/i)).toBeInTheDocument();

    // no authoring controls
    expect(screen.queryByPlaceholderText(/add new daily checklist item/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/optional tech note/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /file & archive/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();

    // clicking an item is inert — it does not sign anything
    await user.click(screen.getByText('Item one'));
    expect(onUpdateChecklists).not.toHaveBeenCalled();
  });
});

describe('Checklists — commit cycle', () => {
  it('refuses to file a log with nothing signed', async () => {
    const { onLogHistory, user } = setup();
    await user.click(screen.getByRole('button', { name: /file & archive daily log/i }));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/at least one/i));
    expect(onLogHistory).not.toHaveBeenCalled();
  });

  it('files a history entry and resets the items when at least one is signed', async () => {
    const checklists = fullDeptChecklists();
    checklists[0].items[0] = makeChecklistItem({ id: 'i1', text: 'Item one', completed: true, completedBy: 'tech' });
    const { onLogHistory, onUpdateChecklists, user } = setup({ checklists });

    await user.click(screen.getByRole('button', { name: /file & archive daily log/i }));

    expect(onLogHistory).toHaveBeenCalledTimes(1);
    expect(onLogHistory.mock.calls[0][0]).toMatchObject({ type: 'Daily', itemsAttempted: 2, itemsCompleted: 1 });
    const daily = onUpdateChecklists.mock.calls.at(-1)![0].find((c: { id: string }) => c.id === 'cl-Daily');
    expect(daily.items.every((it: { completed: boolean }) => it.completed === false)).toBe(true);
  });

  it('raises a compliance-gap alert when a checklist is filed only partly signed', async () => {
    const checklists = fullDeptChecklists();
    checklists[0].items[0] = makeChecklistItem({ id: 'i1', completed: true, completedBy: 'tech' });
    const { onAddNotification, user } = setup({ checklists });

    await user.click(screen.getByRole('button', { name: /file & archive daily log/i }));

    expect(onAddNotification).toHaveBeenCalledWith(
      expect.stringMatching(/compliance gap/i),
      expect.stringContaining('1 unverified items'),
      'Alert',
      expect.anything(),
    );
  });
});

describe('Checklists — history view', () => {
  it('shows an archived session instead of the live list when a past date is picked', () => {
    const checklists = fullDeptChecklists();
    const history = [
      {
        date: '2026-08-20',
        type: 'Daily' as const,
        itemsAttempted: 2,
        itemsCompleted: 2,
        completedBy: 'tech',
        timestamp: '2026-08-20T10:00:00Z',
        items: [makeChecklistItem({ id: 'h1', text: 'Archived item', completed: true, completedBy: 'tech' })],
      },
    ];
    const { container } = setup({ checklists, checklistHistory: history });

    fireEvent.change(container.querySelector('#checklist-history-datepicker')!, { target: { value: '2026-08-20' } });

    expect(screen.getByText('Archived item')).toBeInTheDocument();
    expect(screen.getByText(/2 of 2 signed/i)).toBeInTheDocument();
    expect(screen.queryByText('Item one')).not.toBeInTheDocument();
  });
});

describe('Checklists — localisation', () => {
  it('renders Arabic tab labels when the language is Arabic', () => {
    localStorage.setItem('app_language', 'ar');
    setup();
    expect(screen.getByRole('button', { name: /فحص يومي مجدول/ })).toBeInTheDocument();
  });
});
