import type React from 'react';
import { describe, expect, it } from 'vitest';
import { makeDepartment, makeTask, makeUser } from '../../test/factories';
import { renderWithProviders, screen } from '../../test/renderWithProviders';
import AnalyticsReports from './AnalyticsReports';

const departments = [
  makeDepartment({ id: 'dept-it', name: 'IT Department' }),
  makeDepartment({ id: 'dept-fnb', name: 'F&B Department' }),
];

function setup(overrides: Partial<React.ComponentProps<typeof AnalyticsReports>> = {}) {
  const currentUser = makeUser({ id: 'gm', role: 'GeneralManager' });
  const props: React.ComponentProps<typeof AnalyticsReports> = {
    tasks: [],
    users: [currentUser],
    currentUser,
    checklistHistory: [],
    complaints: [],
    departments,
    checklists: [],
    ...overrides,
  };
  return renderWithProviders(<AnalyticsReports {...props} />);
}

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();

describe('AnalyticsReports', () => {
  it('shows the total task count and a per-status breakdown', () => {
    setup({
      tasks: [
        makeTask({ id: 't1', status: 'Open', departmentId: 'dept-it' }),
        makeTask({ id: 't2', status: 'Completed', departmentId: 'dept-it' }),
        makeTask({ id: 't3', status: 'In Progress', departmentId: 'dept-it' }),
      ],
    });
    expect(screen.getByRole('heading', { name: /3\s+total tasks/i })).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('raises the attention banner when an active task is overdue', () => {
    setup({
      tasks: [makeTask({ id: 't1', status: 'Open', priority: 'Critical', deadline: yesterday(), departmentId: 'dept-it' })],
    });
    expect(screen.getByRole('heading', { name: /attention required/i })).toBeInTheDocument();
  });

  it('does not show the attention banner when everything is on track', () => {
    setup({ tasks: [makeTask({ id: 't1', status: 'Completed', departmentId: 'dept-it' })] });
    expect(screen.queryByRole('heading', { name: /attention required/i })).not.toBeInTheDocument();
  });

  it('titles the dashboard with a non-GM viewer\'s department', () => {
    setup({ currentUser: makeUser({ id: 'dir', role: 'Director', departmentId: 'dept-it' }) });
    expect(screen.getByRole('heading', { name: /IT Department Command Center/i })).toBeInTheDocument();
  });

  it('renders without crashing on empty data', () => {
    const { container } = setup();
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { name: /command center/i })).toBeInTheDocument();
  });
});
