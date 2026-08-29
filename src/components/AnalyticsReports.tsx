import React from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  Clock3,
  ListTodo,
  MessageSquareWarning,
  ShieldAlert,
  Activity,
  ArrowRight,
  Building2,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  UserRound
} from 'lucide-react';
import { Task, User, ChecklistHistory, Complaint, Department, Checklist } from '../types';
import { getDescendantIds, isGeneralManager } from '../utils/permissions';
import { useLanguage } from '../context/LanguageContext';

interface AnalyticsProps {
  tasks: Task[];
  users: User[];
  currentUser: User;
  checklistHistory: ChecklistHistory[];
  complaints?: Complaint[];
  departments?: Department[];
  checklists?: Checklist[];
  onOpenTask?: (id: string) => void;
  onOpenComplaint?: (id: string) => void;
  onOpenChecklist?: (id: string) => void;
}

const cairoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const cairoDate = (value: Date | string) => {
  try {
    return cairoFormatter.format(typeof value === 'string' ? new Date(value) : value);
  } catch {
    return new Date(value).toISOString().slice(0, 10);
  }
};

const startOfDay = (value: string) => new Date(`${value}T00:00:00+03:00`).getTime();

export default function AnalyticsReports({
  tasks,
  users,
  currentUser,
  checklistHistory,
  complaints = [],
  departments = [],
  checklists = [],
  onOpenTask,
  onOpenComplaint,
  onOpenChecklist
}: AnalyticsProps) {
  const { language, isRtl } = useLanguage();
  const today = cairoDate(new Date());

  // Dashboard scope follows the organizational hierarchy:
  // GM -> everyone; Director -> own department + direct managers + their assistants;
  // Manager -> own department + direct assistants. Assistants do not get a dashboard.
  const descendantIds = new Set(getDescendantIds(currentUser.id, users));
  const managementScopeIds = new Set([currentUser.id, ...descendantIds]);
  const isGM = isGeneralManager(currentUser);
  const scopedDepartmentIds = isGM
    ? new Set(departments.map(d => d.id))
    : new Set([currentUser.departmentId].filter((id): id is string => !!id));

  const scopedTasks = tasks.filter(task => {
    if (isGM) return true;
    if (task.departmentId && scopedDepartmentIds.has(task.departmentId)) {
      const assignees = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
      return assignees.some(id => managementScopeIds.has(id)) || managementScopeIds.has(task.createdBy) || managementScopeIds.has(task.assignedBy || '');
    }
    return managementScopeIds.has(task.createdBy) || managementScopeIds.has(task.assignedBy || '');
  });

  const scopedComplaints = complaints.filter(complaint => {
    if (isGM) return true;
    if (complaint.departmentId !== currentUser.departmentId) return false;
    return !complaint.assignedToId || managementScopeIds.has(complaint.assignedToId);
  });

  const scopedChecklists = checklists.filter(checklist => isGM || checklist.departmentId === currentUser.departmentId);
  const scopedChecklistHistory = isGM
    ? checklistHistory
    : checklistHistory.filter(entry => managementScopeIds.has(entry.completedBy) || scopedChecklists.some(c => c.departmentId === currentUser.departmentId));
  const scopedDepartments = isGM ? departments : departments.filter(d => d.id === currentUser.departmentId);

  const activeTasks = scopedTasks.filter(t => t.status === 'Open' || t.status === 'In Progress');
  const completedTasks = scopedTasks.filter(t => t.status === 'Completed' || t.status === 'Archived');
  const overdueTasks = activeTasks.filter(t => new Date(t.deadline).getTime() < Date.now());
  const criticalTasks = activeTasks.filter(t => t.priority === 'Critical');

  const openComplaints = scopedComplaints.filter(c => c.status === 'Open' || c.status === 'In Progress');
  const criticalComplaints = openComplaints.filter(c => c.priority === 'Critical');
  const overdueComplaints = openComplaints.filter(c => Date.now() - new Date(c.createdAt).getTime() > 24 * 60 * 60 * 1000);
  const resolvedComplaints = scopedComplaints.filter(c => c.status === 'Resolved' || c.status === 'Closed');
  const complaintResolutionRate = scopedComplaints.length > 0
    ? Math.round((resolvedComplaints.length / scopedComplaints.length) * 100)
    : 100;

  const checklistStats = scopedChecklists.map(checklist => {
    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter(item => item.completed).length;
    const rate = totalItems ? Math.round((completedItems / totalItems) * 100) : 100;
    const department = departments.find(d => d.id === checklist.departmentId);
    return {
      ...checklist,
      name: checklist.title,
      departmentName: department?.name || checklist.departmentId || 'Operations',
      totalItems,
      completedItems,
      rate
    };
  });

  const checklistAttention = checklistStats.filter(stat => stat.totalItems > 0 && stat.rate < 80);

  const departmentCompliance = scopedDepartments
    .map(dept => {
      const deptChecklists = checklistStats.filter(c => c.departmentId === dept.id);
      const totalItems = deptChecklists.reduce((sum, checklist) => sum + checklist.totalItems, 0);
      const completedItems = deptChecklists.reduce((sum, checklist) => sum + checklist.completedItems, 0);
      return {
        ...dept,
        totalItems,
        completedItems,
        rate: totalItems ? Math.round((completedItems / totalItems) * 100) : null
      };
    })
    .filter(dept => dept.totalItems > 0);

  const historyCompletion = scopedChecklistHistory.length
    ? Math.round(
        (scopedChecklistHistory.reduce((sum, item) => {
          if (!item.itemsAttempted) return sum;
          return sum + item.itemsCompleted / item.itemsAttempted;
        }, 0) / checklistHistory.length) * 100
      )
    : null;

  // Executive health based on tasks and checklists
  const taskHealth = tasks.length ? (completedTasks.length / tasks.length) * 100 : 100;
  const checklistHealth = historyCompletion ?? (checklistStats.length
    ? checklistStats.reduce((sum, item) => sum + item.rate, 0) / checklistStats.length
    : 100);
  const issuePenalty = Math.min(25, overdueTasks.length * 5);
  const operationsHealth = Math.max(0, Math.min(100, Math.round(
    taskHealth * 0.55 + checklistHealth * 0.45 - issuePenalty
  )));

  const healthLabel = operationsHealth >= 85
    ? (language === 'ar' ? 'الحالة مستقرة' : 'HEALTHY')
    : operationsHealth >= 65
      ? (language === 'ar' ? 'تحتاج متابعة' : 'ATTENTION REQUIRED')
      : (language === 'ar' ? 'تحتاج تدخل' : 'CRITICAL ATTENTION');

  const healthTone = operationsHealth >= 85
    ? { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-400' }
    : operationsHealth >= 65
      ? { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', bar: 'bg-amber-400' }
      : { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/25', bar: 'bg-rose-400' };
  const totalIssues = criticalTasks.length;
  const hasAttention = totalIssues > 0 || overdueTasks.length > 0 || checklistAttention.length > 0;

  const issueRows = [
    ...criticalTasks.map(task => ({
      key: `task-${task.id}`,
      targetType: 'task' as const,
      targetId: task.id,
      type: language === 'ar' ? 'مهمة حرجة' : 'Critical Task',
      title: task.title,
      detail: task.status === 'In Progress' ? (language === 'ar' ? 'قيد التنفيذ' : 'In Progress') : (language === 'ar' ? 'مفتوحة' : 'Open'),
      tone: 'rose'
    })),
    ...overdueTasks.filter(t => !criticalTasks.some(c => c.id === t.id)).map(task => ({
      key: `overdue-${task.id}`,
      targetType: 'task' as const,
      targetId: task.id,
      type: language === 'ar' ? 'مهمة متأخرة' : 'Overdue Task',
      title: task.title,
      detail: language === 'ar' ? `الموعد: ${cairoDate(task.deadline)}` : `Due: ${cairoDate(task.deadline)}`,
      tone: 'amber'
    })),
    ...checklistAttention.map(checklist => ({
      key: `checklist-${checklist.id}`,
      targetType: 'checklist' as const,
      targetId: checklist.id,
      type: language === 'ar' ? 'قائمة فحص تحتاج متابعة' : 'Checklist Attention',
      title: checklist.name,
      detail: language === 'ar' ? `${checklist.rate}% مكتمل` : `${checklist.rate}% complete`,
      tone: 'amber'
    }))
  ];

  const toneClasses = {
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    indigo: 'text-indigo-400',
    sky: 'text-sky-400'
  } as const;

  const statusRows = [
    { label: language === 'ar' ? 'مكتملة' : 'Completed', count: completedTasks.length, tone: 'emerald' },
    { label: language === 'ar' ? 'قيد التنفيذ' : 'In Progress', count: tasks.filter(t => t.status === 'In Progress').length, tone: 'indigo' },
    { label: language === 'ar' ? 'مفتوحة' : 'Open', count: tasks.filter(t => t.status === 'Open').length, tone: 'sky' },
    { label: language === 'ar' ? 'متأخرة' : 'Overdue', count: overdueTasks.length, tone: 'rose' }
  ];

  const statusTotal = Math.max(tasks.length, 1);

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Executive header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.22em] font-mono">
            {language === 'ar' ? 'مركز القيادة' : 'COMMAND CENTER'}
          </span>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white mt-1">
            {`${currentUser.departmentId ? (departments.find(d => d.id === currentUser.departmentId)?.name || currentUser.departmentId) : 'Hotel'} Command Center`}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {language === 'ar' ? `متابعة التشغيل • ${today}` : `Operational monitoring • ${today}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {language === 'ar' ? 'مزامنة مباشرة' : 'LIVE DATA'}
        </div>
      </div>

      {/* Reminder / attention center */}
      {hasAttention && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {language === 'ar' ? 'تذكير — يوجد ما يحتاج متابعة' : 'Reminder — Attention Required'}
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {language === 'ar' ? 'المشاكل الظاهرة هنا هي فقط التي تحتاج تدخل أو متابعة.' : 'Only operational items that require intervention or follow-up are listed here.'}
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">
                  {issueRows.length} {language === 'ar' ? 'تنبيه' : 'alerts'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                {issueRows.map(issue => (
                  <button
                    key={issue.key}
                    type="button"
                    onClick={() => {
                      if (issue.targetType === 'task') onOpenTask?.(issue.targetId);
                      else onOpenChecklist?.(issue.targetId);
                    }}
                    className="w-full text-left flex items-center gap-2 rounded-lg bg-black/20 border border-white/5 px-3 py-2 hover:bg-white/5 hover:border-amber-500/20 transition-colors cursor-pointer"
                    title={language === 'ar' ? 'اضغط لفتح المشكلة' : 'Click to open this issue'}
                  >
                    <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${issue.tone === 'rose' ? 'text-rose-400' : 'text-amber-400'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{issue.type}</span>
                      </div>
                      <p className="text-[11px] text-white truncate" title={issue.title}>{issue.title}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">{issue.detail}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label={language === 'ar' ? 'مشاكل حرجة' : 'Critical Issues'}
          value={totalIssues}
          hint={language === 'ar' ? 'تحتاج تدخل' : 'Require intervention'}
          tone="rose"
          onClick={criticalTasks[0] ? () => onOpenTask?.(criticalTasks[0].id) : undefined}
        />
        <MetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label={language === 'ar' ? 'مهام متأخرة' : 'Overdue Tasks'}
          value={overdueTasks.length}
          hint={language === 'ar' ? 'من المهام النشطة' : 'Active tasks past deadline'}
          tone={overdueTasks.length ? 'amber' : 'emerald'}
          onClick={overdueTasks[0] ? () => onOpenTask?.(overdueTasks[0].id) : undefined}
        />
        <MetricCard
          icon={<ClipboardCheck className="h-4 w-4" />}
          label={language === 'ar' ? 'قوائم تحتاج متابعة' : 'Checklist Attention'}
          value={checklistAttention.length}
          hint={language === 'ar' ? 'أقل من 80%' : 'Below 80% completion'}
          tone={checklistAttention.length ? 'amber' : 'emerald'}
          onClick={checklistAttention[0] ? () => onOpenChecklist?.(checklistAttention[0].id) : undefined}
        />
      </div>

      {/* Health + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-white/5 bg-[#0a0a0f]/50 p-6 glass">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest font-mono">
                {language === 'ar' ? 'صحة التشغيل' : 'Operations Health'}
              </span>
              <h2 className="text-xl font-display font-bold text-white mt-1">{healthLabel}</h2>
            </div>
            <div className={`h-12 w-12 rounded-full border ${healthTone.border} ${healthTone.bg} flex items-center justify-center`}>
              <Activity className={`h-5 w-5 ${healthTone.text}`} />
            </div>
          </div>
          <div className="flex items-end gap-3 mt-5">
            <span className={`text-5xl font-mono font-black ${healthTone.text}`}>{operationsHealth}%</span>
            <span className="text-[10px] text-zinc-500 mb-2">{language === 'ar' ? 'مؤشر تشغيلي' : 'Operational index'}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden mt-4">
            <div className={`h-full ${healthTone.bar} transition-all duration-700`} style={{ width: `${operationsHealth}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-center">
            <MiniStat label={language === 'ar' ? 'المهام' : 'Tasks'} value={`${Math.round(taskHealth)}%`} />
            <MiniStat label={language === 'ar' ? 'الفحص' : 'Checklists'} value={`${Math.round(checklistHealth)}%`} />
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-[#0a0a0f]/50 p-6 glass">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest font-mono">{language === 'ar' ? 'حالة المهام' : 'Task Status'}</span>
              <h2 className="text-xl font-display font-bold text-white mt-1">{tasks.length} {language === 'ar' ? 'إجمالي المهام' : 'Total Tasks'}</h2>
            </div>
            <ListTodo className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="space-y-3">
            {statusRows.map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-zinc-300">{row.label}</span>
                  <span className={toneClasses[row.tone as keyof typeof toneClasses]}>{row.count}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  {row.count > 0 && (
                    <div
                      className={`h-full rounded-full ${row.tone === 'emerald' ? 'bg-emerald-400' : row.tone === 'indigo' ? 'bg-indigo-400' : row.tone === 'sky' ? 'bg-sky-400' : 'bg-amber-400'} transition-all duration-500`}
                      style={{ width: `${Math.max(8, Math.min(100, (row.count / statusTotal) * 100))}%` }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Checklists Compliance Section */}
      <section className="rounded-xl border border-white/5 bg-[#0a0a0f]/50 p-6 glass">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest font-mono">{language === 'ar' ? 'التزام الأقسام' : 'Department Compliance'}</span>
            <h2 className="text-xl font-display font-bold text-white mt-1">{language === 'ar' ? 'إنجاز قوائم الفحص' : 'Checklist Completion'}</h2>
          </div>
          <ClipboardCheck className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="space-y-3">
          {departmentCompliance.map(stat => (
            <div key={stat.id}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="flex items-center gap-1.5 text-zinc-300"><Building2 className="h-3 w-3 text-zinc-500" />{stat.name}</span>
                <span className={`font-mono font-bold ${stat.rate !== null && stat.rate < 80 ? 'text-amber-400' : 'text-emerald-400'}`}>{stat.rate ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${stat.rate !== null && stat.rate < 40 ? 'bg-rose-400' : stat.rate !== null && stat.rate < 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${stat.rate ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pt-1">
        <ActionHint icon={<ListTodo className="h-3.5 w-3.5" />} text={language === 'ar' ? 'راجع لوحة العمليات للمهام' : 'Review Operations Board for tasks'} />
        <ActionHint icon={<ClipboardCheck className="h-3.5 w-3.5" />} text={language === 'ar' ? 'راجع قوائم الفحص' : 'Review checklists'} />
      </div>
    </div>
  );
}

function GMExecutiveDashboard({
  tasks,
  users,
  departments,
  language,
  isRtl,
  onOpenTask
}: {
  tasks: Task[];
  users: User[];
  departments: Department[];
  language: string;
  isRtl: boolean;
  onOpenTask?: (id: string) => void;
}) {
  const [departmentFilter, setDepartmentFilter] = React.useState('all');
  const [assigneeFilter, setAssigneeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const userMap = React.useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const departmentMap = React.useMemo(() => new Map(departments.map(dept => [dept.id, dept])), [departments]);

  const getAssigneeIds = (task: Task) => {
    if (task.assigneeIds?.length) return task.assigneeIds;
    return task.assigneeId ? [task.assigneeId] : [];
  };

  const activeTasks = tasks.filter(task => task.status === 'Open' || task.status === 'In Progress');
  const completedTasks = tasks.filter(task => task.status === 'Completed' || task.status === 'Archived');
  const overdueTasks = activeTasks.filter(task => new Date(task.deadline).getTime() < Date.now());

  const getTaskTime = (task: Task) => {
    const now = Date.now();
    const deadline = new Date(task.deadline).getTime();

    if (task.status === 'Completed' || task.status === 'Archived') {
      if (task.actualDurationSec != null) return formatDuration(task.actualDurationSec * 1000);
      if (task.completedAt) {
        const started = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
        return `Completed (${formatDuration(Math.max(0, new Date(task.completedAt).getTime() - started))})`;
      }
      return language === 'ar' ? 'مكتملة' : 'Completed';
    }

    if (deadline < now) {
      return `${language === 'ar' ? 'متأخر' : 'Overdue'} (${formatOverdue(now - deadline)})`;
    }

    return `${language === 'ar' ? 'متبقي' : 'Due in'} ${formatOverdue(deadline - now)}`;
  };

  const getPriorityClass = (priority: Task['priority']) => {
    if (priority === 'Critical') return 'text-rose-300';
    if (priority === 'High') return 'text-rose-300';
    if (priority === 'Medium') return 'text-amber-300';
    return 'text-emerald-300';
  };

  const getPriorityDot = (priority: Task['priority']) => {
    if (priority === 'Critical' || priority === 'High') return 'bg-rose-400';
    if (priority === 'Medium') return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const getStatusClass = (status: Task['status']) => {
    if (status === 'In Progress') return 'text-sky-300 bg-sky-500/10 border-sky-500/15';
    if (status === 'Open') return 'text-amber-300 bg-amber-500/10 border-amber-500/15';
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/15';
  };

  const filteredTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter(task => {
      const assigneeIds = getAssigneeIds(task);
      const departmentName = departmentMap.get(task.departmentId || '')?.name || task.departmentId || '';
      const assigneeNames = assigneeIds.map(id => userMap.get(id)?.name || id).join(' ');
      const senderName = userMap.get(task.createdBy)?.name || task.createdBy;
      const statusMatch = statusFilter === 'all'
        || (statusFilter === 'Active' && (task.status === 'Open' || task.status === 'In Progress'))
        || (statusFilter === 'Overdue' && (task.status === 'Open' || task.status === 'In Progress') && new Date(task.deadline).getTime() < Date.now())
        || task.status === statusFilter;

      return (departmentFilter === 'all' || task.departmentId === departmentFilter)
        && (assigneeFilter === 'all' || assigneeIds.includes(assigneeFilter))
        && statusMatch
        && (!query || [task.title, departmentName, assigneeNames, senderName, task.priority, task.status].join(' ').toLowerCase().includes(query));
    });
  }, [tasks, departmentFilter, assigneeFilter, statusFilter, search, departmentMap, userMap]);

  const uniqueAssignees = React.useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach(task => getAssigneeIds(task).forEach(id => ids.add(id)));
    return users.filter(user => ids.has(user.id));
  }, [tasks, users]);

  const statCards = [
    { label: language === 'ar' ? 'إجمالي المهام' : 'Total Tasks', value: tasks.length, tone: 'text-indigo-300' },
    { label: language === 'ar' ? 'النشطة' : 'Active', value: activeTasks.length, tone: 'text-sky-300' },
    { label: language === 'ar' ? 'المتأخرة' : 'Overdue', value: overdueTasks.length, tone: overdueTasks.length ? 'text-rose-300' : 'text-emerald-300' },
    { label: language === 'ar' ? 'المكتملة' : 'Completed', value: completedTasks.length, tone: 'text-emerald-300' }
  ];

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.22em] font-mono">
            {language === 'ar' ? 'مركز القيادة' : 'COMMAND CENTER'}
          </span>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white mt-1">
            {language === 'ar' ? 'نظرة تنفيذية' : 'Executive Overview'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {language === 'ar' ? 'متابعة سريعة لجميع مهام الفندق' : 'A quick view of all hotel tasks'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {language === 'ar' ? 'مباشر' : 'LIVE'}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="rounded-xl border border-white/5 bg-[#0a0a0f]/60 px-4 py-3.5 glass">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">{card.label}</div>
            <div className={`text-3xl font-mono font-black mt-2 ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-white/5 bg-[#0a0a0f]/60 glass overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">{language === 'ar' ? 'المهام' : 'Tasks'}</h2>
            <span className="text-[10px] font-mono text-zinc-500">{filteredTasks.length}</span>
          </div>

          <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
            <label className="relative md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={language === 'ar' ? 'بحث عن مهمة...' : 'Search tasks...'}
                className="w-full h-9 rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-[11px] text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/40"
              />
            </label>
            <div className="flex items-center gap-2 text-zinc-500 px-1">
              <Filter className="h-3.5 w-3.5" />
              <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none">
                <option value="all">{language === 'ar' ? 'كل الأقسام' : 'All Departments'}</option>
                {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
              </select>
              <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none">
                <option value="all">{language === 'ar' ? 'كل الموظفين' : 'All Employees'}</option>
                {uniqueAssignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none">
                <option value="all">{language === 'ar' ? 'كل الحالات' : 'All Status'}</option>
                <option value="Active">{language === 'ar' ? 'نشطة' : 'Active'}</option>
                <option value="Overdue">{language === 'ar' ? 'متأخرة' : 'Overdue'}</option>
                <option value="Completed">{language === 'ar' ? 'مكتملة' : 'Completed'}</option>
                <option value="Archived">{language === 'ar' ? 'مؤرشفة' : 'Archived'}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left" dir={isRtl ? 'rtl' : 'ltr'}>
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.015]">
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'اسم المهمة' : 'Task'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'المرسل' : 'Sent By'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'الموظف الحالي' : 'Current Assignee'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'القسم' : 'Department'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'الأولوية' : 'Priority'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{language === 'ar' ? 'الوقت' : 'Time'}</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const assigneeIds = getAssigneeIds(task);
                const assignees = assigneeIds.map(id => userMap.get(id)?.name || id).filter(Boolean);
                const sender = userMap.get(task.createdBy)?.name || task.createdBy;
                const department = departmentMap.get(task.departmentId || '')?.name || task.departmentId || (language === 'ar' ? 'غير محدد' : 'Unassigned');
                const isOverdue = (task.status === 'Open' || task.status === 'In Progress') && new Date(task.deadline).getTime() < Date.now();

                return (
                  <tr
                    key={task.id}
                    onClick={() => onOpenTask?.(task.id)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.025] transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5 max-w-[280px]">
                      <div className="text-[12px] font-semibold text-white leading-5 line-clamp-2" title={task.title}>{task.title}</div>
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-zinc-300 whitespace-nowrap">{sender}</td>
                    <td className="px-4 py-3.5 text-[12px] text-zinc-300">
                      {assignees.length ? (
                        <span className="inline-flex items-center gap-1.5"><UserRound className="h-3 w-3 text-zinc-600" />{assignees[0]}{assignees.length > 1 ? ` +${assignees.length - 1}` : ''}</span>
                      ) : <span className="text-zinc-600">{language === 'ar' ? 'غير معين' : 'Unassigned'}</span>}
                    </td>
                    <td className="px-4 py-3.5 text-[11px] text-zinc-400 whitespace-nowrap">{department}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-2 text-[12px] font-medium ${getPriorityClass(task.priority)}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${getPriorityDot(task.priority)}`} />
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold ${getStatusClass(task.status)}`}>
                        {task.status === 'Completed' || task.status === 'Archived' ? <CheckCircle2 className="h-3 w-3" /> : null}
                        {task.status === 'In Progress' ? (language === 'ar' ? 'قيد التنفيذ' : 'Active') : task.status === 'Open' ? (language === 'ar' ? 'مفتوحة' : 'Open') : task.status === 'Completed' ? (language === 'ar' ? 'مكتملة' : 'Completed') : (language === 'ar' ? 'مؤرشفة' : 'Archived')}
                      </span>
                    </td>
                    <td className={`px-4 py-3.5 whitespace-nowrap text-[11px] font-mono ${isOverdue ? 'text-rose-300 font-bold' : 'text-zinc-400'}`}>
                      {isOverdue ? '⚠ ' : ''}{getTaskTime(task)}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <button type="button" onClick={e => { e.stopPropagation(); onOpenTask?.(task.id); }} className="h-7 w-7 rounded-md inline-flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/5 transition-colors" aria-label="Task actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredTasks.length && (
            <div className="py-14 text-center text-zinc-500 text-xs">
              {language === 'ar' ? 'لا توجد مهام مطابقة للفلاتر الحالية.' : 'No tasks match the current filters.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatOverdue(milliseconds: number) {
  return formatDuration(milliseconds);
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: 'rose' | 'amber' | 'emerald' | 'indigo';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full text-left rounded-xl border border-white/5 bg-[#0a0a0f]/50 p-4 glass ${onClick ? 'hover:bg-white/[0.04] hover:border-indigo-500/20 cursor-pointer transition-colors' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">{label}</span>
        <span className={tone === 'rose' ? 'text-rose-400' : tone === 'amber' ? 'text-amber-400' : tone === 'emerald' ? 'text-emerald-400' : 'text-indigo-400'}>{icon}</span>
      </div>
      <div className={tone === 'rose' ? 'text-rose-400 text-3xl font-mono font-black mt-3' : tone === 'amber' ? 'text-amber-400 text-3xl font-mono font-black mt-3' : tone === 'emerald' ? 'text-emerald-400 text-3xl font-mono font-black mt-3' : 'text-indigo-400 text-3xl font-mono font-black mt-3'}>{value}</div>
      <p className="text-[9px] text-zinc-500 mt-1">{hint}</p>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/[0.025] border border-white/5 p-2">
      <span className="block text-[9px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="block text-sm font-mono font-bold text-white mt-1">{value}</span>
    </div>
  );
}

function ActionHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[9px] text-zinc-500">
      {icon}
      {text}
    </div>
  );
}
