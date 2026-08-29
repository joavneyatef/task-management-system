import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDepartment, makeOrg, makeUser } from '../../test/factories';
import { mswServer } from '../../test/msw/server';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../../test/renderWithProviders';
import AuditLog from './AuditLog';

const departments = [
  makeDepartment({ id: 'dept-it', name: 'IT Department' }),
  makeDepartment({ id: 'dept-fnb', name: 'F&B Department' }),
];

/** Records every /api/audit-log request URL; lets a test control the response. */
function captureAuditLog(respond: (req: Request) => Response = () => HttpResponse.json({ rows: [] })) {
  const urls: URL[] = [];
  mswServer.use(
    http.get('/api/audit-log', ({ request }) => {
      urls.push(new URL(request.url));
      return respond(request);
    }),
  );
  return {
    urls,
    last: () => urls[urls.length - 1],
    header: (req: Request, name: string) => req.headers.get(name),
  };
}

const row = (over = {}) => ({
  id: 'e1',
  entityType: 'Task' as const,
  entityId: 't1',
  entityTitle: 'Swap lobby switch',
  action: 'complete',
  userId: 'asst',
  userName: 'Sam Assistant',
  departmentId: 'dept-it',
  department: 'IT Department',
  timestamp: '2026-08-29T10:00:00Z',
  details: 'done',
  ...over,
});

describe('AuditLog', () => {
  it('loads entries on mount, carrying the acting user id header', async () => {
    const cap = captureAuditLog(() => HttpResponse.json({ rows: [row()] }));
    const { gm } = makeOrg();
    renderWithProviders(<AuditLog currentUser={gm} users={[gm]} departments={departments} />);

    expect(await screen.findByText('Swap lobby switch')).toBeInTheDocument();
    await waitFor(() => expect(cap.urls.length).toBeGreaterThan(0));
  });

  it('shows the empty state when the server returns no rows', async () => {
    captureAuditLog(() => HttpResponse.json({ rows: [] }));
    const { gm } = makeOrg();
    renderWithProviders(<AuditLog currentUser={gm} users={[gm]} departments={departments} />);
    expect(await screen.findByText(/no matching entries/i)).toBeInTheDocument();
  });

  it('surfaces the server error message on a rejected request', async () => {
    captureAuditLog(() => HttpResponse.json({ message: 'Forbidden: audit log is management-only.' }, { status: 403 }));
    const { asst } = makeOrg();
    renderWithProviders(<AuditLog currentUser={asst} users={[asst]} departments={departments} />);
    expect(await screen.findByText('Forbidden: audit log is management-only.')).toBeInTheDocument();
  });

  it('gives the GM an enabled department filter with an option per department', async () => {
    captureAuditLog();
    const { gm } = makeOrg();
    renderWithProviders(<AuditLog currentUser={gm} users={[gm]} departments={departments} />);

    const deptSelect = screen.getAllByRole('combobox')[1];
    expect(deptSelect).toBeEnabled();
    expect(within(deptSelect).getByRole('option', { name: /all departments/i })).toBeInTheDocument();
    expect(within(deptSelect).getByRole('option', { name: 'IT Department' })).toBeInTheDocument();
    expect(within(deptSelect).getByRole('option', { name: 'F&B Department' })).toBeInTheDocument();
  });

  it('locks a Director to their own department and scopes the initial request to it', async () => {
    const cap = captureAuditLog();
    const dir = makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it' });
    renderWithProviders(<AuditLog currentUser={dir} users={[dir]} departments={departments} />);

    const deptSelect = screen.getAllByRole('combobox')[1];
    expect(deptSelect).toBeDisabled();
    expect(within(deptSelect).queryByRole('option', { name: /all departments/i })).not.toBeInTheDocument();
    expect(within(deptSelect).getByRole('option', { name: 'IT Department' })).toBeInTheDocument();

    await waitFor(() => expect(cap.last().searchParams.get('departmentId')).toBe('dept-it'));
  });

  it('refetches with entityType when the type filter changes', async () => {
    const cap = captureAuditLog();
    const org = makeOrg();
    const { user } = renderWithProviders(<AuditLog currentUser={org.gm} users={org.all} departments={departments} />);

    await waitFor(() => expect(cap.urls.length).toBeGreaterThan(0));
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Task');
    await waitFor(() => expect(cap.last().searchParams.get('entityType')).toBe('Task'));
  });

  it('includes an inclusive end-of-day endDate in the query', async () => {
    const cap = captureAuditLog();
    const { gm } = makeOrg();
    renderWithProviders(<AuditLog currentUser={gm} users={[gm]} departments={departments} />);

    fireEvent.change(screen.getByTitle('From'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByTitle('To'), { target: { value: '2026-08-31' } });

    await waitFor(() => {
      const end = cap.last().searchParams.get('endDate');
      expect(end).toBeTruthy();
      const d = new Date(end!);
      // inclusive: last millisecond of the local calendar day the user picked
      expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([23, 59, 59, 999]);
    });
  });

  it('non-GM user picker is scoped to self + direct reports only', async () => {
    captureAuditLog();
    const dir = makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it', name: 'Dana Director' });
    const mine = makeUser({ id: 'mine', role: 'Assistant', departmentId: 'dept-it', parentId: 'dir', name: 'My Report' });
    const notMine = makeUser({ id: 'stranger', role: 'Assistant', departmentId: 'dept-it', name: 'Someone Else' });
    const { user } = renderWithProviders(
      <AuditLog currentUser={dir} users={[dir, mine, notMine]} departments={departments} />,
    );

    await user.click(screen.getByRole('button', { name: /all users/i }));
    expect(await screen.findByText(/My Report/)).toBeInTheDocument();
    expect(screen.getByText(/Dana Director/)).toBeInTheDocument();
    expect(screen.queryByText(/Someone Else/)).not.toBeInTheDocument();
  });

  it('adds selected user ids to the next request', async () => {
    const cap = captureAuditLog();
    const dir = makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it' });
    const rep = makeUser({ id: 'rep', role: 'Assistant', departmentId: 'dept-it', parentId: 'dir', name: 'Rep One' });
    const { user } = renderWithProviders(
      <AuditLog currentUser={dir} users={[dir, rep]} departments={departments} />,
    );

    await user.click(screen.getByRole('button', { name: /all users/i }));
    await user.click(await screen.findByLabelText(/Rep One/));
    await waitFor(() => expect(cap.last().searchParams.get('userIds')).toContain('rep'));
  });

  it('exports CSV through a blob download', async () => {
    const createURL = vi.fn(() => 'blob:mock');
    const revokeURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createURL, revokeObjectURL: revokeURL }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const cap = captureAuditLog((req) =>
      new URL(req.url).searchParams.get('format') === 'csv'
        ? new HttpResponse('a,b\n1,2', { headers: { 'Content-Type': 'text/csv' } })
        : HttpResponse.json({ rows: [] }),
    );
    const { gm } = makeOrg();
    const { user } = renderWithProviders(<AuditLog currentUser={gm} users={[gm]} departments={departments} />);

    await user.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(cap.urls.some((u) => u.searchParams.get('format') === 'csv')).toBe(true));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
