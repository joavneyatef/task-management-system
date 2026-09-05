import React, { useState, useEffect } from 'react';
import { Plus, Clock, Paperclip, ClipboardList, Play, CheckCircle, Flame, UserPlus, Filter, StickyNote, Activity, Send, User as UserIcon, Trash2, ArrowRightLeft, Search, MoreHorizontal, CheckCircle2, UserRound, ListTodo } from 'lucide-react';
import { Task, User, TaskPriority, TaskStatus, TaskHistoryEntry, Department } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { isGeneralManager, isDirector, isManager, isAssistant, canSendTasks, getAssignableUsers, getDescendantIds, canViewTask } from '../utils/permissions';

const formatToLocalDateTimeLocal = (date: Date): string => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

interface TaskBoardProps {
  tasks: Task[];
  users: User[];
  currentUser: User;
  onUpdateTasks: (tasks: Task[]) => void;
  onAddNotification: (title: string, msg: string, cat: 'Task' | 'Alert', recipientUserId?: string, eventKey?: string) => void;
  activeLocks?: { [itemId: string]: any };
  onLockItem?: (itemId: string) => void;
  onUnlockItem?: (itemId: string) => void;
  initialTaskId?: string;
  departments?: Department[];
}

export default function TaskBoard({
  tasks,
  users,
  currentUser,
  onUpdateTasks,
  onAddNotification,
  activeLocks = {},
  onLockItem,
  onUnlockItem,
  initialTaskId,
  departments = []
}: TaskBoardProps) {
  const { language } = useLanguage();

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('All');
  const [deadlineFilter, setDeadlineFilter] = useState<'All' | 'Overdue' | 'Today' | 'ThisWeek'>('All');

  // New task form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const [newAssignee, setNewAssignee] = useState<string>(''); // empty = unassigned
  const [newAssignees, setNewAssignees] = useState<string[]>([]); // Multiple assignees list
  const [newDeadline, setNewDeadline] = useState('');
  const [directlyComplete, setDirectlyComplete] = useState<boolean>(false);
  const [timeSpentMins, setTimeSpentMins] = useState<number>(30);

  // Note dialog state
  const [activeTaskNotesId, setActiveTaskNotesId] = useState<string | null>(null);
  const [switchTaskId, setSwitchTaskId] = useState<string | null>(null);
  const [switchTargetId, setSwitchTargetId] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const focusedTaskRef = React.useRef<string | null>(null);

  // State to force re-render for timers
  const [, setTick] = useState(0);

  useEffect(() => {
    if (initialTaskId && initialTaskId !== focusedTaskRef.current && tasks.some(t => t.id === initialTaskId)) {
      focusedTaskRef.current = initialTaskId;
      setActiveTaskNotesId(initialTaskId);
    }
    if (!initialTaskId) focusedTaskRef.current = null;
  }, [initialTaskId, tasks]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const canCreateTask = canSendTasks(currentUser);
  const isTopAdmin = isGeneralManager(currentUser);
  const isAuthToRevert = isGeneralManager(currentUser);
  const assignableUsers = React.useMemo(() => getAssignableUsers(currentUser, users).filter(u => !/accountant|accounting|محاسب|الحساب/i.test(`${u.title} ${u.name} ${u.positionCode || ''}`)), [currentUser, users]);

  // The top "All Assigned" filter is scoped to the logged-in employee's
  // operational branch. This prevents a department from seeing people outside
  // its hierarchy while still allowing a Director/Manager to filter every
  // member of their own team.
  const scopedAssigneeUsers = React.useMemo(() => {
    if (isGeneralManager(currentUser)) return users;
    if (isDirector(currentUser)) {
      return users.filter(u => u.id === currentUser.id || (u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase()));
    }
    if (isManager(currentUser)) {
      const scope = new Set([
        currentUser.id,
        ...users.filter(u => u.parentId === currentUser.id || u.managerId === currentUser.id || (u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase() && isAssistant(u))).map(u => u.id),
        ...getDescendantIds(currentUser.id, users)
      ]);
      return users.filter(u => scope.has(u.id));
    }
    return [currentUser];
  }, [currentUser, users]);

  // Toggle a recipient in/out of the multi-select "who gets this task" list
  const toggleNewAssignee = (userId: string) => {
    setNewAssignees(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  // Format active timers
  const getElapsedTimeText = (startedAtStr?: string) => {
    if (!startedAtStr) return '';
    const start = new Date(startedAtStr).getTime();
    const now = new Date().getTime();
    const diffSec = Math.max(0, Math.floor((now - start) / 1000));
    
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3650) / 60);
    const secs = diffSec % 60;
    
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  const renderTaskCountdown = (deadlineStr: string) => {
    const deadline = new Date(deadlineStr).getTime();
    const now = new Date().getTime();
    const diffMs = deadline - now;
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);

    const totalSecs = Math.floor(absDiff / 1000);
    const days = Math.floor(totalSecs / (3600 * 24));
    const remainingSecsAfterDays = totalSecs % (3600 * 24);
    const hours = Math.floor(remainingSecsAfterDays / 3600);
    const mins = Math.floor((remainingSecsAfterDays % 3600) / 60);

    const timeString = language === 'ar' ? (
      <>
        <span>{days} يوم</span>
        <span className="mx-0.5">و</span>
        <span>{hours} ساعة</span>
        <span className="mx-0.5">و</span>
        <span>{mins} دقيقة</span>
      </>
    ) : (
      <>
        <span>{days}d</span>
        <span className="mx-0.5">:</span>
        <span>{hours}h</span>
        <span className="mx-0.5">:</span>
        <span>{mins}m</span>
      </>
    );

    const textStyle = isOverdue 
      ? 'text-rose-450 font-semibold animate-pulse' 
      : diffMs < 6 * 3600 * 1000 // Less than 6 hours left
        ? 'text-amber-450 font-semibold animate-pulse'
        : 'text-zinc-420 font-bold';

    return (
      <span className={`text-[11.5px] font-mono flex items-center gap-1 ${textStyle}`}>
        <Clock className={`h-3 w-3 shrink-0 ${isOverdue ? 'text-rose-400' : 'text-zinc-500'}`} />
        <span>
          {language === 'ar' ? (
            isOverdue ? (
              <>متأخرة بـ {timeString}</>
            ) : (
              <>متبقي {timeString}</>
            )
          ) : (
            isOverdue ? (
              <>{timeString} overdue</>
            ) : (
              <>{timeString} left</>
            )
          )}
        </span>
      </span>
    );
  };

  const getCompletedDurationText = (seconds?: number) => {
    if (!seconds) return 'Completed';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m duration`;
    return `${m}m total duration`;
  };

  const getTaskAssignees = (task: Task) => {
    return task.assigneeIds && task.assigneeIds.length > 0
      ? task.assigneeIds.map(id => users.find(u => u.id === id)).filter(Boolean)
      : (task.assigneeId ? [users.find(u => u.id === task.assigneeId)].filter(Boolean) : []);
  };

  const renderTaskAssigneesBadge = (task: Task) => {
    const assignedUsers = getTaskAssignees(task);
    if (assignedUsers.length === 0) {
      return (
        <span className="text-[10px] text-zinc-500 italic font-mono">
          {language === 'ar' ? 'غير مسندة' : 'Unassigned Pool'}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5 overflow-hidden">
          {assignedUsers.map((u, i) => u && (
            <img
              key={u.id}
              src={u.avatar}
              alt={u.name}
              title={u.name}
              className="inline-block h-5.5 w-5.5 rounded-full ring-2 ring-[#050507] shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
          ))}
        </div>
        <span className="text-[11px] text-zinc-300 font-sans font-medium truncate max-w-[130px]" title={assignedUsers.map(u => u?.name).join(', ')}>
          {assignedUsers.map(u => u?.name).join(', ')}
        </span>
      </div>
    );
  };

  // Switch is available to Directors for tasks assigned anywhere in their
  // reporting tree, and to Managers for their own tasks / direct Assistants.
  // It must NOT require the manager to be the current assignee; otherwise a
  // Director like George could not switch a task currently assigned to Matar.
  const canSwitchTask = (task: Task) => {
    if (['Completed', 'Archived'].includes(task.status)) return false;
    const assigneeIds = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
    if (isDirector(currentUser)) {
      // A Director can delegate a task assigned directly to them as well as a
      // task already assigned to anyone in their reporting branch.
      const scope = new Set([currentUser.id, ...getDescendantIds(currentUser.id, users)]);
      return assigneeIds.some(id => scope.has(id)) && switchTargets.length > 0;
    }
    if (isManager(currentUser)) {
      return assigneeIds.includes(currentUser.id) || assigneeIds.some(id => {
        const assignee = users.find(u => u.id === id);
        return !!assignee && assignee.parentId === currentUser.id && isAssistant(assignee);
      });
    }
    return false;
  };

  const switchTargets = React.useMemo(() => {
    if (isGeneralManager(currentUser)) return users.filter(u => u.id !== currentUser.id && u.status !== 'On Leave');
    if (isDirector(currentUser)) {
      const scope = new Set(getDescendantIds(currentUser.id, users));
      return users.filter(u => scope.has(u.id) && u.id !== currentUser.id && u.status !== 'On Leave');
    }
    if (isManager(currentUser)) {
      return users.filter(u => u.parentId === currentUser.id && isAssistant(u) && u.status !== 'On Leave');
    }
    return [];
  }, [currentUser, users]);

  const openSwitchDialog = (task: Task) => {
    if (!canSwitchTask(task)) return;
    const targets = switchTargets;
    setSwitchTargetId(targets[0]?.id || '');
    setSwitchTaskId(task.id);
  };

  const confirmSwitchTask = async () => {
    if (!switchTaskId || !switchTargetId) return;
    const task = tasks.find(t => t.id === switchTaskId);
    const target = users.find(u => u.id === switchTargetId);
    if (!task || !target || !canSwitchTask(task)) return;

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: target.id })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Task switch failed:', data);
        return;
      }
      const updatedTask = data.task as Task;
      onUpdateTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
      setSwitchTaskId(null);
      setSwitchTargetId('');
    } catch (error) {
      console.error('Task switch request failed:', error);
    }
  };

  // Claim (Self-Assign) Task
  const claimTask = (taskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        onAddNotification(
          'Task Claimed Operational Bulletin',
          `${currentUser.name} self-assigned: ${t.title}`,
          'Task',
          currentUser.id
        );
        const newHist = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'claim' as const,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: new Date().toISOString(),
          details: language === 'ar' ? 'تم استلام المهمة والبدء في تجهيزها' : 'Self-assigned/Claimed the ticket for execution'
        };
        const currentAssignees = t.assigneeIds || [];
        const nextAssignees = currentAssignees.includes(currentUser.id) 
          ? currentAssignees 
          : [...currentAssignees, currentUser.id];

        return { 
          ...t, 
          assigneeId: currentUser.id,
          assigneeIds: nextAssignees,
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  // Begin Tracking / Accept Task
  const startTask = (taskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const newHist = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'start' as const,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: new Date().toISOString(),
          details: language === 'ar' ? 'بدأ العمل الفعلي وتشغيل عداد المهمة' : 'Started active operation & triggered SLA stopwatch'
        };
        const currentAssignees = t.assigneeIds || [];
        const nextAssignees = currentAssignees.includes(currentUser.id) 
          ? currentAssignees 
          : [...currentAssignees, currentUser.id];

        return {
          ...t,
          status: 'In Progress' as TaskStatus,
          startedAt: new Date().toISOString(),
          assigneeId: t.assigneeId || currentUser.id,
          assigneeIds: nextAssignees,
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  // Mark task as Completed
  const completeTask = (taskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const completedAt = new Date().toISOString();
        let seconds = t.actualDurationSec || 0;
        if (t.startedAt) {
          seconds = Math.max(1, Math.floor((new Date(completedAt).getTime() - new Date(t.startedAt).getTime()) / 1000));
        } else {
          seconds = 3600; // Handshake default
        }

        const newHist = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'complete' as const,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: completedAt,
          details: language === 'ar' ? `تم إنجاز المهمة وحل المشكلة بنجاح` : `Successfully resolved and completed task`
        };

        return {
          ...t,
          status: 'Completed' as TaskStatus,
          completedAt,
          completedById: currentUser.id,
          actualDurationSec: seconds,
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  // Revert Completed -> In Progress
  const revertTaskToInProgress = (taskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        onAddNotification(
          language === 'ar' ? 'تمت إعادة فتح التذكرة للتنفيذ' : 'Task Reopened to Progress',
          language === 'ar'
            ? `قام "${currentUser.name}" بإرجاع التذكرة "${t.title}" من قيد الإغلاق إلى الكاشف الجاري.`
            : `User "${currentUser.name}" reverted ticket "${t.title}" from Completed to In Progress.`,
          'Task',
          currentUser.id
        );

        const newHist: TaskHistoryEntry = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'start',
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: new Date().toISOString(),
          details: language === 'ar' ? 'تم إرجاع التذكرة من منجزة/مغلقة إلى قيد التنفيذ بواسطة المشرف المعتمد' : 'Reverted ticket from Completed back to In Progress by Authorized Supervisor'
        };

        return {
          ...t,
          status: 'In Progress' as TaskStatus,
          completedAt: undefined,
          completedById: undefined,
          startedAt: t.startedAt || new Date().toISOString(),
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  // Revert In Progress -> Open
  const revertTaskToOpen = (taskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        onAddNotification(
          language === 'ar' ? 'إعادة التذكرة للمخزن المفتوح' : 'Task Returned to Open Pool',
          language === 'ar'
            ? `قام "${currentUser.name}" بإعادة التذكرة "${t.title}" إلى المخزن المشترك للطلبات المفتوحة.`
            : `User "${currentUser.name}" returned ticket "${t.title}" back to the Unassigned Open Pool.`,
          'Task',
          currentUser.id
        );

        const newHist: TaskHistoryEntry = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'assign',
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: new Date().toISOString(),
          details: language === 'ar' ? 'تمت إعادة التذكرة إلى طلبات العمل المفتوحة وإلغاء الإسناد الفردي' : 'Returned ticket back to Unassigned Open Pool'
        };

        return {
          ...t,
          status: 'Open' as TaskStatus,
          startedAt: undefined,
          assigneeId: null,
          assigneeIds: [],
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  // Trigger delete confirmation flow
  const deleteTask = (taskId: string) => {
    const active = tasks.find(t => t.id === taskId);
    if (active) {
      setTaskToDelete(active);
    }
  };

  // Perform actual deletion when custom confirmation prompt is accepted
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;

    try {
      const response = await fetch(`/api/tasks/${taskToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUser.id
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete task');
      }

      // Deletion is not broadcast globally. If a private notification is needed,
      // it must be created explicitly for an affected recipient.

      // Locally update the UI list immediately
      const updated = tasks.filter(t => t.id !== taskToDelete.id);
      onUpdateTasks(updated);
    } catch (err) {
      console.error(err);
      alert(language === 'ar' ? 'فشل حذف المهمة من الخادم' : 'Failed to delete task from server');
    } finally {
      setTaskToDelete(null);
    }
  };

  // Submit task creation
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTask || !newTitle.trim() || newAssignees.length < 1) return;

    const nowStr = new Date().toISOString();
    const isCompleted = directlyComplete;
    const resolvedStatus: TaskStatus = isCompleted ? 'Completed' : 'Open';
    const resolvedStarted = isCompleted ? new Date(Date.now() - (timeSpentMins || 30) * 60 * 1000).toISOString() : undefined;
    const resolvedCompleted = isCompleted ? nowStr : undefined;
    const resolvedDuration = isCompleted ? (timeSpentMins || 30) * 60 : undefined;

    // Create one independent, private ticket per selected recipient — each person
    // only ever sees their own copy, never who else the same task was sent to.
    const newTasks: Task[] = newAssignees.map((assigneeId, index) => {
      const assigneeName = users.find(u => u.id === assigneeId)?.name || '';
      const initialHistory: TaskHistoryEntry[] = [
        {
          id: `hist-${Date.now()}-${index}-1`,
          type: 'create',
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: nowStr,
          details: language === 'ar' ? 'تم إنشاء الطلب وتسجيله على النظام' : 'Ticket launched and registered in the system'
        }
      ];

      if (isCompleted) {
        initialHistory.push({
          id: `hist-${Date.now()}-${index}-2`,
          type: 'complete',
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: nowStr,
          details: language === 'ar' ? `تم التسجيل والإغلاق المباشر (الوقت المستغرق: ${timeSpentMins} دقيقة)` : `Directly registered & resolved (Duration: ${timeSpentMins} mins)`
        });
      } else {
        initialHistory.push({
          id: `hist-${Date.now()}-${index}-3`,
          type: 'assign',
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: nowStr,
          details: language === 'ar' ? `تم إسناد التذكرة إلى: ${assigneeName}` : `Assigned ticket to: ${assigneeName}`
        });
      }

      return {
        id: `task-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        status: resolvedStatus,
        assigneeId: assigneeId,
        assigneeIds: [assigneeId],
        createdBy: currentUser.id,
        departmentId: currentUser.departmentId || (users.find(u => u.id === assigneeId)?.departmentId) || undefined,
        // Track who actually dispatched the task. When Mr. Hany (GeneralManager) assigns
        // straight to a Department Manager, this is what lets the UI flag it as a
        // management directive rather than a peer-assigned ticket.
        assignedBy: currentUser.id,
        originalAssigneeId: assigneeId || undefined,
        completedById: isCompleted ? currentUser.id : undefined,
        deadline: newDeadline || (isCompleted ? nowStr : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()),
        createdAt: nowStr,
        startedAt: resolvedStarted,
        completedAt: resolvedCompleted,
        actualDurationSec: resolvedDuration,
        notes: [],
        attachments: [],
        history: initialHistory
      };
    });

    onUpdateTasks([...newTasks, ...tasks]);

    // reset
    setNewTitle('');
    setNewDesc('');
    setNewPriority('Medium');
    setNewAssignee('');
    setNewAssignees([]);
    setNewDeadline('');
    setDirectlyComplete(false);
    setTimeSpentMins(30);
    setShowCreateModal(false);
  };

  const addNoteToActiveTask = () => {
    if (!noteText.trim() || !activeTaskNotesId) return;
    const updated = tasks.map(t => {
      if (t.id === activeTaskNotesId) {
        const noteWithUser = `${currentUser.name}: ${noteText}`;
        const newHist = {
          id: `hist-${Date.now()}-${Math.random()}`,
          type: 'note' as const,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          timestamp: new Date().toISOString(),
          details: noteText
        };
        return {
          ...t,
          notes: [...t.notes, noteWithUser],
          history: [...(t.history || []), newHist]
        };
      }
      return t;
    });
    onUpdateTasks(updated);
    setNoteText('');
  };

  // Filtering Logic
  const filteredTasks = tasks.filter(task => {
    if (!canViewTask(currentUser, task, users)) return false;
    const matchPriority = priorityFilter === 'All' || task.priority === priorityFilter;
    const taskAssigneeIds = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
    const matchAssignee = assigneeFilter === 'All' ||
      (assigneeFilter === 'Unassigned' && taskAssigneeIds.length === 0) ||
      taskAssigneeIds.includes(assigneeFilter);

    let matchDeadline = true;
    if (deadlineFilter !== 'All' && task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const now = new Date();
      if (deadlineFilter === 'Overdue') {
        matchDeadline = deadlineDate < now && task.status !== 'Completed' && task.status !== 'Archived';
      } else if (deadlineFilter === 'Today') {
        matchDeadline = deadlineDate.toDateString() === now.toDateString();
      } else if (deadlineFilter === 'ThisWeek') {
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        matchDeadline = deadlineDate >= now && deadlineDate <= weekFromNow;
      }
    }

    return matchPriority && matchAssignee && matchDeadline;
  });

  const openList = filteredTasks.filter(t => t.status === 'Open');
  const inProgressList = filteredTasks.filter(t => t.status === 'In Progress');
  const completedList = filteredTasks.filter(t => t.status === 'Completed');

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 h-full">
      
      {/* Search and Action bars */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-white/5 pb-4">
        {!isTopAdmin ? <div className="flex flex-wrap items-center gap-3">
          
          {/* Priority filter selector */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 glass">
            <Filter className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label={language === 'ar' ? 'تصفية حسب الأولوية' : 'Filter by priority'}
              className="bg-white text-xs hover:text-slate-900 transition-all focus:outline-none cursor-pointer font-semibold text-slate-900"
            >
              <option value="All" className="bg-white text-slate-900">{language === 'ar' ? 'كل الأولويات' : 'All Priorities'}</option>
              <option value="Critical" className="bg-white text-slate-900">{language === 'ar' ? 'حرجة' : 'Critical'}</option>
              <option value="High" className="bg-white text-slate-900">{language === 'ar' ? 'عالية' : 'High'}</option>
              <option value="Medium" className="bg-white text-slate-900">{language === 'ar' ? 'متوسطة' : 'Medium'}</option>
              <option value="Low" className="bg-white text-slate-900">{language === 'ar' ? 'منخفضة' : 'Low'}</option>
            </select>
          </div>

          {/* Assignee filter selector */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 glass">
            <Filter className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label={language === 'ar' ? 'تصفية حسب المسؤول' : 'Filter by assignee'}
              className="bg-white text-xs hover:text-slate-900 transition-all focus:outline-none cursor-pointer font-semibold text-slate-900"
            >
              <option value="All" className="bg-white text-slate-900">{language === 'ar' ? 'كل المسؤولين' : 'All Assigned'}</option>
              <option value="Unassigned" className="bg-white text-slate-900">{language === 'ar' ? 'غير مسندة' : 'Unassigned Pool'}</option>
              {scopedAssigneeUsers.map(u => (
                <option key={u.id} value={u.id} className="bg-white text-slate-900">{u.name}</option>
              ))}
            </select>
          </div>

          {/* Deadline filter selector */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 glass">
            <Filter className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value as any)}
              aria-label={language === 'ar' ? 'تصفية حسب الموعد النهائي' : 'Filter by deadline'}
              className="bg-white text-xs hover:text-slate-900 transition-all focus:outline-none cursor-pointer font-semibold text-slate-900"
            >
              <option value="All" className="bg-white text-slate-900">{language === 'ar' ? 'كل المواعيد' : 'All Deadlines'}</option>
              <option value="Overdue" className="bg-white text-slate-900">{language === 'ar' ? 'متأخرة' : 'Overdue'}</option>
              <option value="Today" className="bg-white text-slate-900">{language === 'ar' ? 'اليوم' : 'Due Today'}</option>
              <option value="ThisWeek" className="bg-white text-slate-900">{language === 'ar' ? 'هذا الأسبوع' : 'This Week'}</option>
            </select>
          </div>
        </div> : <div /> }

        {/* Create Task: GM and Directors only */}
        {canCreateTask && <button
          onClick={() => {
            setNewAssignees([]);
            setDirectlyComplete(false);
            setTimeSpentMins(30);
            
            // Default deadline: 3 days from now
            const defaultDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            setNewDeadline(formatToLocalDateTimeLocal(defaultDate));
            
            setShowCreateModal(true);
          }}
          className="flex items-center gap-1.5 accent-gradient hover:opacity-90 font-bold px-4 py-2 rounded-xl text-xs text-white transition-all cursor-pointer shadow-lg shadow-indigo-500/10"
          id="create-task-button"
        >
          <Plus className="h-4 w-4" /> 
          {language === 'ar' ? 'سجل مهمة عمل / تذكرة جديدة' : 'Log / Dispatch Task'}
        </button>}
      </div>

      {true ? (
        <GMOperationsOverview currentUser={currentUser} tasks={tasks} users={users} departments={departments} language={language} isRtl={language === 'ar'} priorityFilter={priorityFilter} assigneeFilter={assigneeFilter} deadlineFilter={deadlineFilter} onOpenTask={(id) => setActiveTaskNotesId(id)} onUpdateTasks={onUpdateTasks} onAddNotification={onAddNotification} />
      ) : (
      <>
      {/* Kanban Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        
        {/* Column 1: Open Tasks / Unclaimed */}
        <div className="space-y-4 flex flex-col min-h-0 h-full">
          <div className="flex justify-between items-center bg-white/2 px-4 py-2.5 rounded-xl border border-white/5 font-display glass shrink-0">
            <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> {language === 'ar' ? 'طلبات العمل المفتوحة ' : 'Unassigned Pool'}
            </span>
            <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md border border-white/5">{openList.length}</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1 min-h-0">
            {openList.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8 border border-dashed border-white/5 rounded-xl bg-white/1 font-semibold">{language === 'ar' ? 'لا توجد مهام مفتوحة بانتظار الإسناد حالياً.' : 'No open jobs pending claim.'}</p>
            ) : (
                openList.map(task => {
                const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Unassigned';
                const overdue = task.isOverdue || new Date(task.deadline) < new Date();
                
                return (
                  <div 
                    key={task.id} 
                    onClick={() => setActiveTaskNotesId(task.id)} 
                    className="p-5 rounded-xl bg-white/2 border border-white/5 hover:border-indigo-550/20 hover:bg-indigo-950/5 transition-all flex flex-col justify-between glass hover:bg-white/4 cursor-pointer group"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono border ${
                            task.priority === 'Critical' ? 'bg-rose-500/15 text-rose-400 border-rose-500/20 animate-pulse' :
                            task.priority === 'High' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                            task.priority === 'Medium' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/10' : 'bg-white/5 text-zinc-400 border-white/5'
                          }`}>
                            {task.priority}
                          </span>
                          {(() => {
                            const creator = users.find(u => u.id === task.createdBy);
                            const sender = users.find(u => u.id === (task.lastTransferredById || task.assignedBy || task.createdBy));
                            if (sender || creator) {
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-zinc-300 font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                                    <span className="text-zinc-500 text-[9px] font-mono">{language === 'ar' ? 'المرسل:' : 'Sent by:'}</span>
                                    <span className="font-bold text-indigo-300 text-[10px]">{sender?.name || creator?.name}</span>
                                  </span>
                                  {creator && sender && creator.id !== sender.id && (
                                    <span className="text-[9px] text-zinc-500 font-mono">{language === 'ar' ? `المرسل الأصلي: ${creator.name}` : `Original: ${creator.name}`}</span>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-1">
                          {isAuthToRevert && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTask(task.id);
                              }}
                              className="p-1 rounded-lg hover:bg-rose-500/10 hover:text-rose-450 border border-transparent hover:border-rose-500/20 text-zinc-400 cursor-pointer transition-all mr-1"
                              title={language === 'ar' ? 'حذف المهمة' : 'Delete Task'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {overdue && (
                            <span className="text-[9px] bg-rose-500/10 border border-rose-500/25 text-rose-400 font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Flame className="h-3 w-3 animate-bounce text-rose-400" /> OVERDUE
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-indigo-400 opacity-0 group-hover:opacity-100 transition-all">
                            {language === 'ar' ? 'التفاصيل والردود 🔍' : 'Details 🔍'}
                          </span>
                        </div>
                      </div>

                      {task.assignedBy && (() => {
                        const dispatcher = users.find(u => u.id === task.assignedBy);
                        const assignee = users.find(u => u.id === task.assigneeId);
                        if (!dispatcher || !isGeneralManager(dispatcher) || assignee?.role !== 'Manager') return null;
                        return (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-orange-500/10 border border-orange-500/25 text-orange-400 font-mono font-bold px-1.5 py-0.5 rounded mt-2">
                            {language === 'ar' ? '📌 مهمة إدارية من الإدارة العامة' : '📌 GM Directive'}
                          </span>
                        );
                      })()}
                      <h4 className="font-semibold text-white mt-3 text-[13px] font-display">{task.title}</h4>
                      <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed truncate-2-lines">{task.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-[11.5px]">
                        {renderTaskCountdown(task.deadline)}
                        {task.assigneeId && renderTaskAssigneesBadge(task)}
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        {canSwitchTask(task) && switchTargets.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openSwitchDialog(task); }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-700 border border-indigo-400/80 hover:bg-indigo-600 text-[10px] font-bold text-white shadow-md shadow-indigo-900/30 transition-all cursor-pointer font-mono flex items-center gap-1"
                            title={language === 'ar' ? 'تحويل المهمة إلى مدير/مساعد' : 'Switch this task to a Manager / Assistant'}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            {language === 'ar' ? 'تحويل' : 'SWITCH'}
                          </button>
                        )}
                        {!task.assigneeId ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); claimTask(task.id); }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/20 hover:bg-indigo-500/25 text-[10px] font-bold text-indigo-300 transition-all cursor-pointer font-mono"
                          >
                            {language === 'ar' ? 'استلام المهمة (CLAIM)' : 'CLAIM'}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); startTask(task.id); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-[10px] font-bold text-slate-950 transition-all cursor-pointer font-mono shadow-md shadow-cyan-500/10"
                          >
                            <Play className="h-3 w-3 shrink-0" />
                            {language === 'ar' ? 'بدء العمل عليها' : 'ACCEPT & START'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: In Progress (Active timers ticking) */}
        <div className="space-y-4 flex flex-col min-h-0 h-full">
          <div className="flex justify-between items-center bg-white/2 px-4 py-2.5 rounded-xl border border-white/5 font-display glass shrink-0">
            <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> {language === 'ar' ? 'مهام قيد التنفيذ ' : 'Active Operations'}
            </span>
            <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md border border-white/5">{inProgressList.length}</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1 min-h-0">
            {inProgressList.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8 border border-dashed border-white/5 rounded-xl bg-white/1 font-semibold">{language === 'ar' ? 'لا توجد مهام قيد العمل حالياً.' : 'No active jobs tracked.'}</p>
            ) : (
                inProgressList.map(task => {
                const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Ahmed';
                const overdue = task.isOverdue || new Date(task.deadline) < new Date();

                return (
                  <div 
                    key={task.id} 
                    onClick={() => setActiveTaskNotesId(task.id)}
                    className="p-5 rounded-xl bg-white/2 border border-white/5 hover:border-cyan-555/20 hover:bg-cyan-950/5 transition-all flex flex-col justify-between glass hover:bg-white/4 cursor-pointer group"
                  >
                    <div>
                      <div className="flex justify-between items-center bg-white/1 p-1 rounded-lg">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono border ${
                            task.priority === 'Critical' ? 'bg-rose-500/15 text-rose-400 border-rose-500/20 animate-pulse' :
                            task.priority === 'High' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                            task.priority === 'Medium' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/10' : 'bg-white/5 text-zinc-400 border-white/5'
                          }`}>
                            {task.priority}
                          </span>
                          {(() => {
                            const creator = users.find(u => u.id === task.createdBy);
                            const sender = users.find(u => u.id === (task.lastTransferredById || task.assignedBy || task.createdBy));
                            if (sender || creator) {
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-zinc-300 font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                                    <span className="text-zinc-500 text-[9px] font-mono">{language === 'ar' ? 'المرسل:' : 'Sent by:'}</span>
                                    <span className="font-bold text-indigo-300 text-[10px]">{sender?.name || creator?.name}</span>
                                  </span>
                                  {creator && sender && creator.id !== sender.id && (
                                    <span className="text-[9px] text-zinc-500 font-mono">{language === 'ar' ? `المرسل الأصلي: ${creator.name}` : `Original: ${creator.name}`}</span>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        
                        {/* Live ticking stopwatch metrics */}
                        <div className="flex items-center gap-1.5">
                          {isAuthToRevert && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTask(task.id);
                              }}
                              className="p-1 rounded-lg hover:bg-rose-500/15 hover:text-rose-450 text-zinc-400 cursor-pointer transition-all border border-transparent hover:border-rose-500/20 mr-1"
                              title={language === 'ar' ? 'حذف المهمة' : 'Delete Task'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[10px]">
                            <Clock className="h-3 w-3 animate-spin shrink-0" />
                            <span>{getElapsedTimeText(task.startedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <h4 className="font-semibold text-white mt-3 text-[13px] font-display flex justify-between items-center">
                        <span>{task.title}</span>
                        <span className="text-[9px] font-mono text-cyan-400 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          {language === 'ar' ? 'سجل التاريخ 🔍' : 'Timeline 🔍'}
                        </span>
                      </h4>
                      <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed truncate-2-lines">{task.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-3 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 truncate max-w-[150px]">
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0">{language === 'ar' ? 'المنفذون:' : 'Operators:'}</span>
                          {renderTaskAssigneesBadge(task)}
                        </div>
                        {renderTaskCountdown(task.deadline)}
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        {/* Revert to Open if authorised */}
                        {isAuthToRevert && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              revertTaskToOpen(task.id);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] text-rose-300 font-mono font-bold transition-all cursor-pointer"
                            title={language === 'ar' ? 'إعادة التذكرة إلى طلبات العمل المفتوحة' : 'Revert ticket back to open pool'}
                          >
                            {language === 'ar' ? 'إرجاع لمفتوحة' : 'REVERT TO OPEN'}
                          </button>
                        )}

                        {/* Add note */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTaskNotesId(task.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] text-zinc-300 transition-all cursor-pointer font-mono font-bold"
                        >
                          {language === 'ar' ? `ملاحظات (${task.notes?.length || 0})` : `NOTES (${task.notes?.length || 0})`}
                        </button>
                        
                        {canSwitchTask(task) && switchTargets.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openSwitchDialog(task); }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-700 border border-indigo-400/80 hover:bg-indigo-600 text-[10px] text-white shadow-md shadow-indigo-900/30 font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                            title={language === 'ar' ? 'تحويل المهمة إلى مدير/مساعد من التسلسل التابع لك' : 'Switch this task to someone in your reporting line'}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            {language === 'ar' ? 'تحويل' : 'SWITCH'}
                          </button>
                        )}

                        {/* Complete */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            completeTask(task.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[10px] font-bold text-slate-950 transition-all cursor-pointer font-mono shadow-md shadow-emerald-500/10"
                        >
                          {language === 'ar' ? 'تم الحل / الإنجاز' : 'RESOLVED'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: Completed Tickets (Duration indicators) */}
        <div className="space-y-4 flex flex-col min-h-0 h-full">
          <div className="flex justify-between items-center bg-white/2 px-4 py-2.5 rounded-xl border border-white/5 font-display glass shrink-0">
            <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {language === 'ar' ? 'المهام قيد الإغلاق ' : 'Resolved'}
            </span>
            <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md border border-white/5">{completedList.length}</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1 min-h-0">
            {completedList.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8 border border-dashed border-white/5 rounded-xl bg-white/1 font-semibold">{language === 'ar' ? 'لا توجد مهام منجزة ومحلولة حالياً.' : 'No completed tickets registered.'}</p>
            ) : (
                completedList.map(task => {
                const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Elena';

                return (
                  <div 
                    key={task.id} 
                    onClick={() => setActiveTaskNotesId(task.id)}
                    className="p-5 rounded-xl bg-white/2 border border-white/5 text-zinc-400 flex flex-col justify-between glass opacity-80 hover:opacity-100 hover:border-emerald-500/20 transition-all cursor-pointer group"
                  >
                    <div>
                      <div className="flex justify-between items-center bg-white/1 p-1 rounded-lg">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                            {language === 'ar' ? 'تم الحل ' : 'RESOLVED'}
                          </span>
                          {(() => {
                            const creator = users.find(u => u.id === task.createdBy);
                            const sender = users.find(u => u.id === (task.lastTransferredById || task.assignedBy || task.createdBy));
                            if (sender || creator) {
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-zinc-300 font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                                    <span className="text-zinc-500 text-[9px] font-mono">{language === 'ar' ? 'المرسل:' : 'Sent by:'}</span>
                                    <span className="font-bold text-indigo-300 text-[10px]">{sender?.name || creator?.name}</span>
                                  </span>
                                  {creator && sender && creator.id !== sender.id && (
                                    <span className="text-[9px] text-zinc-500 font-mono">{language === 'ar' ? `المرسل الأصلي: ${creator.name}` : `Original: ${creator.name}`}</span>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isAuthToRevert && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTask(task.id);
                              }}
                              className="p-1 rounded-lg hover:bg-rose-500/15 hover:text-rose-450 text-zinc-400 cursor-pointer transition-all border border-transparent hover:border-rose-500/20 mr-1"
                              title={language === 'ar' ? 'حذف المهمة' : 'Delete Task'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <div className="text-[10px] text-emerald-450 font-semibold font-mono flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            {getCompletedDurationText(task.actualDurationSec)}
                          </div>
                        </div>
                      </div>

                      <h4 className="font-semibold text-zinc-300 mt-3 text-[13px] font-display flex justify-between items-center">
                        <span>{task.title}</span>
                        <span className="text-[9px] font-mono text-emerald-400 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          {language === 'ar' ? 'سجل العمليات 🔍' : 'Operations Log 🔍'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-1 lines-clamp-2 leading-relaxed">{task.description}</p>
                    </div>

                    {/* Show precisely who accomplished/resolved the task out of the selected operators */}
                    <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-xs text-left">
                          <span className="text-[10px] text-zinc-450 font-bold shrink-0">
                            {language === 'ar' ? 'الفني الذي أنجزها:' : 'Resolved by:'}
                          </span>
                          {(() => {
                            const resolverId = task.completedById || task.assigneeId;
                            const resolver = users.find(u => u.id === resolverId);
                            if (resolver) {
                              return (
                                <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 text-emerald-300">
                                  <img
                                    src={resolver.avatar}
                                    alt={resolver.name}
                                    className="h-4.5 w-4.5 rounded-full object-cover shrink-0 ring-1 ring-emerald-500/30"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="font-bold text-[10px] truncate max-w-[90px]" title={resolver.name}>
                                    {resolver.name}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <span className="text-zinc-500 italic text-[10px]">
                                {language === 'ar' ? 'غير محدد' : 'Unknown'}
                              </span>
                            );
                          })()}
                        </div>
                        
                        <span className="text-[10px] text-emerald-450 font-mono bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">
                          {task.completedAt ? new Date(task.completedAt).toLocaleTimeString([], { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] bg-white/1 px-2.5 py-1.5 rounded-lg border border-white/2">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-zinc-500 shrink-0">
                            {language === 'ar' ? 'طاقم العمل المكلف:' : 'Operators Scope:'}
                          </span>
                          {renderTaskAssigneesBadge(task)}
                        </div>
                        <span className="text-zinc-500 font-mono text-[9px] shrink-0">
                          {task.completedAt ? new Date(task.completedAt).toLocaleDateString([], { timeZone: 'Africa/Cairo', month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>

                      {/* Revert Completed -> In Progress if authorised */}
                      {isAuthToRevert && (
                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              revertTaskToInProgress(task.id);
                            }}
                            className="w-full text-center py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-550/20 hover:bg-cyan-500/25 text-[10px] text-cyan-300 font-mono font-bold transition-all cursor-pointer"
                            title={language === 'ar' ? 'إعادة التذكرة إلى مهام قيد التنفيذ' : 'Revert ticket back to In Progress'}
                          >
                            {language === 'ar' ? '↩️ إرجاع لقيد التنفيذ' : '↩️ REVERT TO IN PROGRESS'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      {/* Task Notes Sidebar Modal */}
      </div>
      </>
      )}

      {activeTaskNotesId && (() => {
        const activeTask = tasks.find(t => t.id === activeTaskNotesId);
        if (!activeTask) return null;
        
        const creatorUser = users.find(u => u.id === activeTask.createdBy);
        
        // Build timeline
        interface TimelineItem {
          id: string;
          time: string;
          titleAr: string;
          titleEn: string;
          details?: string;
          userName?: string;
          userAvatar?: string;
          type: 'create' | 'claim' | 'start' | 'assign' | 'note' | 'complete' | 'system';
        }

        const timeline: TimelineItem[] = [];

        // 1. Creation Event
        timeline.push({
          id: 't-create',
          time: activeTask.createdAt,
          titleAr: 'تم طلب وتسجيل المهمة على النظام',
          titleEn: 'Task Registered in the System',
          details: activeTask.description,
          userName: creatorUser?.name || 'نظام صيانة تلقائي',
          userAvatar: creatorUser?.avatar,
          type: 'create'
        });

        // 2. Load explicit history if present
        if (activeTask.history && activeTask.history.length > 0) {
          activeTask.history.forEach((h, index) => {
            if (h.type !== 'create') {
              const u = users.find(usr => usr.id === h.userId);
              timeline.push({
                id: `hist-${h.id || index}`,
                time: h.timestamp,
                titleAr: h.type === 'claim' ? 'تم استلام المهمة وبدء الإعداد' :
                         h.type === 'start' ? 'تم تشغيل العداد وبدء المعالجة' :
                         h.type === 'complete' ? 'تم إنهاء العمل وحل المشكلة' :
                         h.type === 'note' ? 'تم تدوين تقرير/ملاحظة فنية جديدة' : 'تحديث تذكرة العمل',
                titleEn: h.type === 'claim' ? 'Task Claimed / Preparing' :
                         h.type === 'start' ? 'SLA Stopwatch Activated' :
                         h.type === 'complete' ? 'Outage Cleared & Task Completed' :
                         h.type === 'note' ? 'Diagnostic Note Logged' : 'Task Status Updated',
                details: h.details,
                userName: h.userName || u?.name,
                userAvatar: h.userAvatar || u?.avatar,
                type: h.type
              });
            }
          });
        } else {
          // Reconstruct dynamic history path if missing
          if (activeTask.assigneeId || (activeTask.assigneeIds && activeTask.assigneeIds.length > 0)) {
            const primaryAssignee = users.find(u => u.id === activeTask.assigneeId);
            timeline.push({
              id: 't-assign',
              time: activeTask.createdAt,
              titleAr: 'تخصيص المشغلين المكلفين',
              titleEn: 'SLA Scope Assigned',
              details: language === 'ar' ? 'تم تحديد طاقة الفنيين المكلفين للعمل على هذا الـ SLA' : 'Dispatched task to assigned operators',
              userName: primaryAssignee?.name || 'توزيع تلقائي',
              userAvatar: primaryAssignee?.avatar,
              type: 'assign'
            });
          }

          if (activeTask.startedAt) {
            const starter = users.find(u => u.id === activeTask.assigneeId) || creatorUser;
            timeline.push({
              id: 't-start',
              time: activeTask.startedAt,
              titleAr: 'بدء الحساب الفعلي لسرعة الاستجابة',
              titleEn: 'Investigation Active',
              details: language === 'ar' ? 'بدأ طاقم الصيانة التحقق وتشخيص الخلل' : 'Triggered SLA stopwatch diagnostic routines',
              userName: starter?.name,
              userAvatar: starter?.avatar,
              type: 'start'
            });
          }

          if (activeTask.completedAt) {
            const resolver = users.find(u => u.id === activeTask.completedById || u.id === activeTask.assigneeId) || creatorUser;
            timeline.push({
              id: 't-complete',
              time: activeTask.completedAt,
              titleAr: 'تم إنجاز التذكرة وتجاوز الخلل',
              titleEn: 'Outage Cleared & Resolved',
              details: language === 'ar' ? 'تم زوال سبب الشكوى وصيانة المشكلة بنجاح' : 'Closed outage state and stored technical solution',
              userName: resolver?.name,
              userAvatar: resolver?.avatar,
              type: 'complete'
            });
          }

          if (activeTask.notes && activeTask.notes.length > 0) {
            activeTask.notes.forEach((note, index) => {
              const match = note.match(/^([^:]+):\s*(.*)$/);
              let name = 'Technical Specialist';
              let content = note;
              let noteUser: any;

              if (match) {
                name = match[1];
                content = match[2];
                noteUser = users.find(u => u.name === name);
              }

              timeline.push({
                id: `dynamic-note-${index}`,
                time: activeTask.startedAt || activeTask.createdAt,
                titleAr: 'ملاحظة فنية مضافة في التقرير',
                titleEn: 'Diagnostic Logged',
                details: content,
                userName: name,
                userAvatar: noteUser?.avatar,
                type: 'note'
              });
            });
          }
        }

        // Sort chronology
        timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const isAr = language === 'ar';

        return (
          <div className="fixed inset-0 bg-[#050507]/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
            <div 
              className="glass-heavy max-w-2xl w-full p-6 shadow-2xl rounded-2xl border border-white/10 flex flex-col max-h-[85vh] text-left"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/10 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono border ${
                      activeTask.priority === 'Critical' ? 'bg-rose-500/15 text-rose-400 border-rose-500/20 animate-pulse' :
                      activeTask.priority === 'High' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                      'bg-indigo-500/15 text-indigo-300 border-indigo-500/10'
                    }`}>
                      {activeTask.priority}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono border ${
                      activeTask.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                      activeTask.status === 'In Progress' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' :
                      'bg-zinc-500/15 text-zinc-400 border-zinc-500/10'
                    }`}>
                      {isAr ? (
                        activeTask.status === 'Completed' ? 'مكتملة ومحلولة' :
                        activeTask.status === 'In Progress' ? 'قيد العمل والمعالجة' : 'في طلبات الانتظار'
                      ) : activeTask.status}
                    </span>
                  </div>
                  <h4 className="font-display font-medium text-white text-base mt-2">{activeTask.title}</h4>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {isAuthToRevert && (
                    <button
                      onClick={() => {
                        deleteTask(activeTask.id);
                        setActiveTaskNotesId(null);
                      }}
                      className="text-rose-455 hover:text-rose-400 font-mono text-xs cursor-pointer border border-rose-500/20 hover:border-rose-500/35 px-3 py-1.5 rounded-lg bg-rose-500/10 transition-all flex items-center gap-1 shrink-0"
                      title={isAr ? 'حذف هذه المهمة نهائياً' : 'Delete this task permanently'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'حذف المهمة' : 'Delete'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTaskNotesId(null)}
                    className="text-zinc-400 hover:text-white font-mono text-xs cursor-pointer border border-white/5 hover:border-white/12 px-3 py-1.5 rounded-lg bg-[#0f0f15] transition-all shrink-0"
                  >
                    {isAr ? 'إغلاق ✕' : 'Close ✕'}
                  </button>
                </div>
              </div>

              {/* Scrollable Timeline */}
              <div className="overflow-y-auto py-5 pr-1 space-y-6 flex-1 min-h-[250px] scrollbar-thin">
                
                {/* Info summary card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-white/2 p-3.5 rounded-xl border border-white/5 text-[11px] font-sans">
                  <div className="space-y-1">
                    <p className="text-zinc-500 font-semibold">{isAr ? '👤 من طلب هذه المهمة:' : '👤 Requested & Logged By:'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {creatorUser ? (
                        <>
                          <img src={creatorUser.avatar} className="w-5 h-5 rounded-full object-cover shrink-0" alt="" referrerPolicy="no-referrer" />
                          <span className="text-white font-bold">{creatorUser.name}</span>
                          <span className="text-[10px] text-zinc-400">
                            ({isAr 
                              ? creatorUser.role === 'Manager' ? 'مدير' : 'منسق صيانة'
                              : creatorUser.role})
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-350 font-bold">{isAr ? 'نظام الصيانة التلقائي' : 'System Dispatcher'}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-zinc-400 font-semibold">{isAr ? '👥 الفنيون المكلفون والمختارون:' : '👥 Selected operators:'}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeTask.assigneeIds && activeTask.assigneeIds.length > 0 ? (
                        activeTask.assigneeIds.map(id => {
                          const u = users.find(usr => usr.id === id);
                          if (!u) return null;
                          return (
                            <span key={id} className="inline-flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/25 rounded-md px-1.5 py-0.5 text-[10.5px] text-zinc-300">
                              <img src={u.avatar} className="w-3.5 h-3.5 rounded-full inline" alt="" referrerPolicy="no-referrer" />
                              <span>{u.name}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-zinc-550 italic">{isAr ? 'متاحة للجميع (المخزن العام)' : 'Open/Unclaimed Pool'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit Trail Vertical Line List */}
                <div className="space-y-4">
                  <p className="text-xs font-bold text-zinc-400 border-b border-white/5 pb-2 uppercase tracking-wide">
                    {isAr ? '🕒 سجل الميقاتية والردود الزمنية بالتفصيل:' : '🕒 Response History & SLA Audit Trail:'}
                  </p>
                  
                  <div className={`relative ${isAr ? 'border-r pr-6 mr-3' : 'border-l pl-6 ml-3'} border-white/5 space-y-6 pt-2`}>
                    {timeline.map((item, idx) => {
                      const dateObj = new Date(item.time);
                      const displayTime = dateObj.toLocaleTimeString([], { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
                      const displayDate = dateObj.toLocaleDateString([], { timeZone: 'Africa/Cairo', month: 'short', day: 'numeric', year: 'numeric' });
                      
                      let badgeColor = 'bg-indigo-500/20 text-indigo-300 ring-2 ring-indigo-550/30';
                      if (item.type === 'complete') badgeColor = 'bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-550/30';
                      if (item.type === 'start') badgeColor = 'bg-cyan-500/20 text-cyan-300 ring-2 ring-cyan-550/30';
                      if (item.type === 'note') badgeColor = 'bg-amber-500/20 text-amber-300 ring-2 ring-amber-550/35';

                      return (
                        <div key={item.id} className="relative group">
                          {/* Point marker aligned for RTL & LTR */}
                          <div className={`absolute ${isAr ? '-right-[31px]' : '-left-[31px]'} top-2.5 h-2 w-2 rounded-full ${
                            item.type === 'complete' ? 'bg-emerald-400 ring-4 ring-emerald-950' : 
                            item.type === 'start' ? 'bg-cyan-400 ring-4 ring-cyan-950' : 'bg-indigo-400 ring-4 ring-indigo-950'
                          } z-10`} />
                          
                          <div className="bg-white/1 rounded-xl p-3 border border-white/5 hover:border-white/10 hover:bg-white/3 transition-all space-y-1.5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                              <span className="text-xs font-bold text-white font-display">
                                {isAr ? item.titleAr : item.titleEn}
                              </span>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9.5px] font-mono text-zinc-400 bg-[#0f0f15] border border-white/5 px-2 py-0.5 rounded">
                                  {displayTime} - {displayDate}
                                </span>
                              </div>
                            </div>
                            
                            {item.details && (
                              <p className="text-[11.5px] text-zinc-300 mt-1 leading-relaxed font-sans font-medium">
                                {item.details}
                              </p>
                            )}

                            {/* Who produced the step */}
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/2 mt-2">
                              {item.userAvatar ? (
                                <img src={item.userAvatar} className="w-4 h-4 rounded-full object-cover shrink-0" alt="" referrerPolicy="no-referrer" />
                              ) : (
                                <UserIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                              )}
                              <span className="text-[10px] font-bold text-zinc-400">
                                {item.userName || (isAr ? 'فارس في الفريق' : 'Operations Specialist')}
                              </span>
                              <span className={`text-[8.5px] font-mono px-1 rounded uppercase tracking-wider ${isAr ? 'mr-auto' : 'ml-auto'} text-zinc-500`}>
                                {item.type}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Add Note Reply Input Area */}
              <div className="border-t border-white/10 pt-4 space-y-3">
                <label className="block text-zinc-300 font-bold text-xs">
                  {isAr ? '✍️ الرد على تذكرة العمل / إضافة إفادة أو تقرير صيانة جديد:' : '✍️ Write diagnostic report / operational response:'}
                </label>
                
                <div className="flex gap-2.5 items-end">
                  <div className="flex-1">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={isAr ? "اكتب هنا تفاصيل الشروع بالعمل، أو النتائج الفنية، أو قيم الفجوات... سيتم نشره فوراً..." : "Type active response reports or technical findings here..."}
                      rows={2}
                      className="w-full bg-[#111116]/90 border border-white/5 rounded-xl text-xs text-white p-3 focus:outline-none focus:border-indigo-550/30 transition-all font-sans leading-relaxed resize-none text-left"
                    />
                  </div>
                  
                  <button
                    onClick={addNoteToActiveTask}
                    className="accent-gradient hover:opacity-90 active:scale-95 text-white font-bold px-4 py-3 text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-500/10 shrink-0 h-[48px] flex items-center justify-center gap-1 font-mono"
                  >
                    <Send className="h-3.5 w-3.5 shrink-0" />
                    <span>{isAr ? 'أضف الرد' : 'Reply'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {switchTaskId && (() => {
        const task = tasks.find(t => t.id === switchTaskId);
        if (!task) return null;
        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[60]" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <div className="glass-heavy rounded-2xl max-w-md w-full p-6 space-y-5 border border-violet-500/20 shadow-2xl">
              <div>
                <div className="flex items-center gap-2 text-violet-300 font-bold text-sm"><ArrowRightLeft className="h-4 w-4" /> {language === 'ar' ? 'تحويل المهمة' : 'Switch Task'}</div>
                <h3 className="text-lg font-display font-bold text-white mt-2">{task.title}</h3>
                <p className="text-xs text-zinc-400 mt-1">{language === 'ar' ? `المهمة ستنتقل من ${currentUser.name} إلى الشخص الذي تختاره، وعند إنجازها سيصل إليك إشعار.` : `The task will move from ${currentUser.name} to the selected person. You will be notified when it is completed.`}</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 font-bold mb-2">{language === 'ar' ? 'اختر المدير / المساعد' : 'Choose Manager / Assistant'}</label>
                <select value={switchTargetId} onChange={e => setSwitchTargetId(e.target.value)} className="w-full bg-white text-slate-900 rounded-xl px-3 py-3 text-sm font-semibold">
                  {switchTargets.map(u => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button type="button" onClick={() => { setSwitchTaskId(null); setSwitchTargetId(''); }} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button type="button" disabled={!switchTargetId} onClick={confirmSwitchTask} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2"><ArrowRightLeft className="h-3.5 w-3.5" />{language === 'ar' ? 'تأكيد التحويل' : 'Confirm Switch'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dispatch Task Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#050507]/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <form onSubmit={handleCreateTaskSubmit} className="glass-heavy rounded-2xl max-w-xl w-full max-h-[88vh] overflow-y-auto p-5 space-y-3 shadow-2xl relative border border-white/10">
            <h3 className="font-display font-semibold text-lg text-white">
              {language === 'ar' ? 'تسجيل وإسناد تذكرة صيانة / مكالمة عمل' : 'Log / Dispatch Operations Ticket'}
            </h3>
            <p className="text-xs text-zinc-400 mb-2 font-sans">
              {language === 'ar' ? 'سجل تذكرة عمل جديدة في النظام أو قم بتدوين مهمة قمت بإنجازها بالفعل.' : 'Register a new service ticket or record a task you have already finished.'}
            </p>

            <div className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-semibold mb-1.5 text-xs text-left">
                  {language === 'ar' ? 'عنوان المشكلة / الطلب' : 'Task Title'}
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: طلب إصلاح عطل انترنت بالغرفة ٢٠٤' : 'e.g. Opera PMS sync latency on Room RFID encoders'}
                  className="w-full bg-[#111116]/80 glass-input text-white px-3 py-2.5 rounded-xl text-zinc-200 text-xs text-left"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1.5 text-xs text-left">
                  {language === 'ar' ? 'تفاصيل الإجراء والصيانة' : 'Description'}
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={language === 'ar' ? 'اكتب الإجراءات المتخذة وملاحظات الإصلاح...' : 'Explain baseline diagnostic checks, locations, switches, room references...'}
                  rows={3}
                  className="w-full bg-[#111116]/80 glass-input p-3 rounded-xl text-white text-zinc-200 text-xs text-left"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1.5 text-xs text-left">
                    {language === 'ar' ? 'مستوى الأهمية والاستعجال' : 'Urgency Level'}
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full bg-white glass-input text-xs px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer text-slate-900 text-left"
                  >
                    <option value="Critical" className="bg-white text-slate-900">{language === 'ar' ? 'حرجة (إنذار SLA)' : 'Critical'}</option>
                    <option value="High" className="bg-white text-slate-900">{language === 'ar' ? 'مرتفعة للغاية' : 'High'}</option>
                    <option value="Medium" className="bg-white text-slate-900">{language === 'ar' ? 'متوسطة' : 'Medium'}</option>
                    <option value="Low" className="bg-white text-slate-900">{language === 'ar' ? 'منخفضة' : 'Low'}</option>
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-zinc-400 font-semibold mb-1.5 text-xs text-left">
                    {language === 'ar' ? 'المستلمون (يمكن اختيار أكثر من واحد)' : 'Recipients (select one or more)'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-[#111116]/80 p-3 rounded-xl border border-white/10">
                    {assignableUsers.length === 0 ? (
                      <p className="text-zinc-500 text-[11px] col-span-2">
                        {language === 'ar' ? 'لا يوجد مستلمون متاحون' : 'No available recipients'}
                      </p>
                    ) : (
                      assignableUsers.map(u => (
                        <label key={u.id} className="flex items-center gap-2 text-zinc-300 font-semibold select-none cursor-pointer text-left">
                          <input
                            type="checkbox"
                            checked={newAssignees.includes(u.id)}
                            onChange={() => toggleNewAssignee(u.id)}
                            className="rounded bg-black border-white/10 accent-indigo-500 h-4 w-4 cursor-pointer shrink-0"
                          />
                          <span className="truncate">
                            {u.id === currentUser.id ? (language === 'ar' ? `${u.name} (أنا)` : `${u.name} (Me)`) : u.name} — {u.title}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Direct resolution toggle (Arabic request: "يقدر يكتبها على السيستم ويقفلها مباشرة") */}
              <div className="bg-[#111116]/55 border border-white/5 rounded-xl p-3 space-y-2.5">
                <label className="flex items-center gap-3 cursor-pointer text-white select-none">
                  <input
                    type="checkbox"
                    checked={directlyComplete}
                    onChange={(e) => setDirectlyComplete(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-white/20 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-indigo-500"
                  />
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-xs text-white">
                      {language === 'ar' ? 'تسجيل كمهمة مكتملة ومحلولة فوراً' : 'Mark as Completed / Resolved Directly'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {language === 'ar' ? 'تفعل هذا الخيار إذا قمت بالعمل بالفعل لتسجيلها وإغلاقها فوراً' : 'Enable this if you have already completed the work and want to log it now.'}
                    </span>
                  </div>
                </label>

                {directlyComplete ? (
                  <div className="pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                    <label className="block text-zinc-400 font-semibold mb-1.5 text-xs text-left">
                      {language === 'ar' ? 'الوقت المستغرق بالدقائق (مثال: ٣٠)' : 'Actual Duration Spent (Minutes)'}
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={timeSpentMins}
                      onChange={(e) => setTimeSpentMins(parseInt(e.target.value) || 30)}
                      className="w-full bg-slate-950/80 glass-input text-white px-3 py-2 rounded-xl text-zinc-200 text-xs font-mono text-left"
                    />
                  </div>
                ) : (
                  <div className="pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-zinc-400 font-semibold text-xs text-left">
                        {language === 'ar' ? 'الحد الأقصى للوقت المستهدف (SLA)' : 'Target Deadline'}
                      </label>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        {language === 'ar' ? 'أو اختر من الأزرار الجاهزة بالأسفل 👇' : 'Or select a quick preset below 👇'}
                      </span>
                    </div>

                    <input
                      type="datetime-local"
                      required={!directlyComplete}
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full bg-slate-950/80 glass-input px-3 py-2.5 rounded-xl text-white text-xs text-left"
                    />

                    {/* Presets Row */}
                    <div className="space-y-1.5 pt-1">
                      <span className="block text-[10px] text-zinc-500 font-mono uppercase tracking-wider text-left">
                        {language === 'ar' ? 'خيارات سريعة للمهلة المستهدفة:' : 'Preset Deadline Windows:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          {
                            id: '4h',
                            labelAr: 'بعد ٤ ساعات',
                            labelEn: 'In 4 hours',
                            getDate: () => new Date(Date.now() + 4 * 60 * 60 * 1000),
                          },
                          {
                            id: 'eod',
                            labelAr: 'مساء اليوم (٨م)',
                            labelEn: 'Today at 8 PM',
                            getDate: () => {
                              const d = new Date();
                              d.setHours(20, 0, 0, 0);
                              return d;
                            },
                          },
                          {
                            id: '1d',
                            labelAr: 'غداً (٢٤ ساعة)',
                            labelEn: 'Tomorrow (+24h)',
                            getDate: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
                          },
                          {
                            id: '3d',
                            labelAr: 'بعد ٣ أيام',
                            labelEn: 'In 3 Days',
                            getDate: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                          },
                          {
                            id: '7d',
                            labelAr: 'بعد أسبوع',
                            labelEn: 'In 1 Week',
                            getDate: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                          }
                        ].map((preset) => {
                          const presetFormatted = formatToLocalDateTimeLocal(preset.getDate());
                          const isSelected = newDeadline.substring(0, 16) === presetFormatted.substring(0, 16);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setNewDeadline(presetFormatted)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 cursor-pointer border ${
                                isSelected 
                                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                                  : 'bg-white/5 text-zinc-300 border-white/5 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {language === 'ar' ? preset.labelAr : preset.labelEn}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10 -mx-1 px-1 pb-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-350 text-zinc-300 font-bold rounded-xl text-xs cursor-pointer transition-all"
              >
                {language === 'ar' ? 'إلغاء الأمر' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={newAssignees.length < 1}
                className="px-4 py-2.5 accent-gradient hover:opacity-95 text-white font-extrabold rounded-xl text-xs cursor-pointer transition-all shadow-lg shadow-indigo-550/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {directlyComplete 
                  ? (language === 'ar' ? 'تسجيل وإغلاق التذكرة' : 'Log & Close Ticket') 
                  : (language === 'ar' ? 'تسجيل وإسناد المهمة' : 'Dispatch Task')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div 
            className="glass-heavy max-w-md w-full p-6 shadow-2xl rounded-2xl border border-rose-500/20 flex flex-col gap-5 text-left"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-455 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  {language === 'ar' ? 'تأكيد حذف مهمة العمل' : 'Confirm Task Deletion'}
                </h3>
                <p className="text-zinc-450 text-xs mt-0.5">
                  {language === 'ar' ? 'يرجى مراجعة وتأكيد عملية الحذف' : 'Please review and confirm deletion'}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white/2 border border-white/5 space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                {language === 'ar' ? 'تفاصيل المهمة المراد حذفها:' : 'Task detail to be removed:'}
              </span>
              <h4 className="font-semibold text-white text-sm">
                {taskToDelete.title}
              </h4>
              <p className="text-xs text-zinc-450 font-sans line-clamp-2">
                {taskToDelete.description || (language === 'ar' ? 'لا يوجد وصف متاح' : 'No description provided')}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 font-bold rounded-xl cursor-pointer transition-all"
              >
                {language === 'ar' ? 'تراجع / إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-extrabold rounded-xl cursor-pointer transition-all shadow-lg shadow-rose-500/10"
              >
                {language === 'ar' ? 'تأكيد الحذف نهائياً ✕' : 'Confirm & Delete ✕'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


function formatTaskBoardDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

function GMOperationsOverview({ currentUser, tasks, users, departments, language, isRtl, priorityFilter, assigneeFilter: topAssigneeFilter, deadlineFilter, onOpenTask, onUpdateTasks, onAddNotification }: {
  currentUser: User;
  tasks: Task[];
  users: User[];
  departments: Department[];
  language: string;
  isRtl: boolean;
  priorityFilter: string;
  assigneeFilter: string;
  deadlineFilter: 'All' | 'Overdue' | 'Today' | 'ThisWeek';
  onOpenTask: (id: string) => void;
  onUpdateTasks: (tasks: Task[]) => void;
  onAddNotification: (title: string, msg: string, cat: 'Task' | 'Alert', recipientUserId?: string, eventKey?: string) => void;
}) {
  const isGM = isGeneralManager(currentUser);
  const visibleUserIds = React.useMemo(() => {
    if (isGM) return new Set(users.map(u => u.id));
    if (isDirector(currentUser)) {
      return new Set(users.filter(u => u.id === currentUser.id || (u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase())).map(u => u.id));
    }
    if (isManager(currentUser)) {
      return new Set([
        currentUser.id,
        ...users.filter(u => u.parentId === currentUser.id || u.managerId === currentUser.id || (u.departmentId && currentUser.departmentId && u.departmentId.toLowerCase() === currentUser.departmentId.toLowerCase() && isAssistant(u))).map(u => u.id),
        ...getDescendantIds(currentUser.id, users)
      ]);
    }
    return new Set([currentUser.id]);
  }, [currentUser, users, isGM]);

  const visibleUsers = React.useMemo(() => users.filter(u => visibleUserIds.has(u.id)), [users, visibleUserIds]);
  // GM sees every department in the filter. A Director/Manager only sees their
  // own department, since the "All Department" field should be scoped to them.
  const visibleDepartments = React.useMemo(() => {
    if (isGM) return departments;
    return departments.filter(dept => dept.id === currentUser.departmentId);
  }, [departments, isGM, currentUser.departmentId]);
  // Start with all departments so an assigned task is never hidden just because its
  // task department differs from the logged-in user's department. Users can still
  // narrow the board manually with the department filter.
  const [departmentFilter, setDepartmentFilter] = React.useState('all');
  const [overviewAssigneeFilter, setOverviewAssigneeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  // Optimistic status display so the action changes immediately in the board
  // while the parent persists the same task state to the server.
  const [actionStatuses, setActionStatuses] = React.useState<Record<string, TaskStatus>>({});
  const [switchTaskId, setSwitchTaskId] = React.useState<string | null>(null);
  const [switchTargetId, setSwitchTargetId] = React.useState('');
  const userMap = React.useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const departmentMap = React.useMemo(() => new Map(departments.map(dept => [dept.id, dept])), [departments]);
  const getAssigneeIds = (task: Task) => task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
  const getDisplayStatus = (task: Task): TaskStatus => actionStatuses[task.id] || task.status;

  // Clear optimistic overrides once the persisted task status catches up.
  React.useEffect(() => {
    setActionStatuses(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(id => {
        const task = tasks.find(t => t.id === id);
        if (!task || task.status === next[id]) { delete next[id]; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [tasks]);

  // Tasks are filtered through canViewTask to respect hierarchy and direct assignments
  const visibleTasks = React.useMemo(() => tasks.filter(task => {
    return canViewTask(currentUser, task, users);
  }), [tasks, currentUser, users]);

  const activeTasks = visibleTasks.filter(task => task.status === 'Open' || task.status === 'In Progress');
  const completedTasks = visibleTasks.filter(task => task.status === 'Completed' || task.status === 'Archived');
  const overdueTasks = activeTasks.filter(task => new Date(task.deadline).getTime() < Date.now());
  const getTaskTime = (task: Task) => {
    const now = Date.now();
    const deadline = new Date(task.deadline).getTime();
    if (task.status === 'Completed' || task.status === 'Archived') {
      if (task.actualDurationSec != null) return `Completed (${formatTaskBoardDuration(task.actualDurationSec * 1000)})`;
      if (task.completedAt) {
        const started = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
        return `Completed (${formatTaskBoardDuration(Math.max(0, new Date(task.completedAt).getTime() - started))})`;
      }
      return language === 'ar' ? 'مكتملة' : 'Completed';
    }
    if (deadline < now) return `${language === 'ar' ? 'متأخر' : 'Overdue'} (${formatTaskBoardDuration(now - deadline)})`;
    return `${language === 'ar' ? 'متبقي' : 'Due in'} ${formatTaskBoardDuration(deadline - now)}`;
  };

  const filteredTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleTasks.filter(task => {
      const assigneeIds = getAssigneeIds(task);
      const departmentName = departmentMap.get(task.departmentId || '')?.name || task.departmentId || '';
      const assigneeNames = assigneeIds.map(id => userMap.get(id)?.name || id).join(' ');
      const sender = userMap.get(task.createdBy);
      const senderName = sender?.name || task.createdBy;
      const senderPosition = sender?.positionCode || sender?.title || '';
      const active = task.status === 'Open' || task.status === 'In Progress';
      const overdue = active && new Date(task.deadline).getTime() < Date.now();
      const isCompleted = task.status === 'Completed' || task.status === 'Archived';
      const statusMatch = statusFilter === 'all' ||
        (statusFilter === 'Active' && active) ||
        (statusFilter === 'Overdue' && overdue) ||
        (statusFilter === 'Completed' && isCompleted) ||
        (statusFilter === 'Archived' && task.status === 'Archived') ||
        task.status === statusFilter;
      const priorityMatch = priorityFilter === 'All' || task.priority === priorityFilter;
      const topAssigneeMatch = topAssigneeFilter === 'All' ||
        (topAssigneeFilter === 'Unassigned' && assigneeIds.length === 0) ||
        assigneeIds.includes(topAssigneeFilter);

      let deadlineMatch = true;
      if (deadlineFilter !== 'All' && task.deadline) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        if (deadlineFilter === 'Overdue') {
          deadlineMatch = active && deadline < now;
        } else if (deadlineFilter === 'Today') {
          deadlineMatch = deadline.toDateString() === now.toDateString();
        } else if (deadlineFilter === 'ThisWeek') {
          const endOfWeek = new Date(now);
          const day = now.getDay();
          const daysUntilSunday = day === 0 ? 0 : 7 - day;
          endOfWeek.setHours(23, 59, 59, 999);
          endOfWeek.setDate(now.getDate() + daysUntilSunday);
          deadlineMatch = deadline >= now && deadline <= endOfWeek;
        }
      }

      return priorityMatch && topAssigneeMatch && deadlineMatch &&
        (departmentFilter === 'all' || task.departmentId === departmentFilter) &&
        (overviewAssigneeFilter === 'all' || assigneeIds.includes(overviewAssigneeFilter)) &&
        statusMatch &&
        (!query || [task.title, departmentName, assigneeNames, senderName, senderPosition, task.priority, task.status].join(' ').toLowerCase().includes(query));
    });
  }, [visibleTasks, departmentFilter, overviewAssigneeFilter, statusFilter, search, departmentMap, userMap, priorityFilter, topAssigneeFilter, deadlineFilter]);

  // Every account in the visible hierarchy is available in the employee filter,
  // even if they do not currently have a task assigned.
  const employeeOptions = visibleUsers;
  const stats = [
    { label: language === 'ar' ? 'إجمالي المهام' : 'Total Tasks', value: visibleTasks.length, tone: 'text-indigo-300' },
    { label: language === 'ar' ? 'النشطة' : 'Active', value: activeTasks.length, tone: 'text-sky-300' },
    { label: language === 'ar' ? 'المتأخرة' : 'Overdue', value: overdueTasks.length, tone: overdueTasks.length ? 'text-rose-300' : 'text-emerald-300' },
    { label: language === 'ar' ? 'المكتملة' : 'Completed', value: completedTasks.length, tone: 'text-emerald-300' }
  ];
  const priorityClass = (priority: Task['priority']) => priority === 'Critical' || priority === 'High' ? 'text-rose-300' : priority === 'Medium' ? 'text-amber-300' : 'text-emerald-300';
  const priorityDot = (priority: Task['priority']) => priority === 'Critical' || priority === 'High' ? 'bg-rose-400' : priority === 'Medium' ? 'bg-amber-400' : 'bg-emerald-400';
  const statusClass = (status: Task['status']) => status === 'In Progress' ? 'text-sky-100 bg-sky-500/30 border-sky-400/50 shadow-sm shadow-sky-500/20' : status === 'Open' ? 'text-amber-100 bg-amber-500/20 border-amber-400/40' : 'text-emerald-100 bg-emerald-500/25 border-emerald-400/45 shadow-sm shadow-emerald-500/15';

  const canOperateTask = (task: Task) => {
    const assigneeIds = getAssigneeIds(task);
    return assigneeIds.includes(currentUser.id) && task.status !== 'Completed' && task.status !== 'Archived';
  };

  const updateTaskStatus = (task: Task, nextStatus: TaskStatus) => {
    if (!canOperateTask(task)) return;
    const now = new Date().toISOString();
    setActionStatuses(prev => ({ ...prev, [task.id]: nextStatus }));
    const historyEntry: TaskHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random()}`,
      type: nextStatus === 'Completed' ? 'complete' : 'start',
      userId: currentUser.id, userName: currentUser.name, userAvatar: currentUser.avatar, timestamp: now,
      details: nextStatus === 'Completed' ? 'Task completed by assignee' : 'Assignee started the task'
    };
    const updatedTasks = tasks.map(t => {
      if (t.id !== task.id) return t;
      if (nextStatus === 'In Progress') return { ...t, status: 'In Progress' as TaskStatus, startedAt: t.startedAt || now, history: [...(t.history || []), historyEntry] };
      const startedAt = t.startedAt ? new Date(t.startedAt).getTime() : new Date(t.createdAt).getTime();
      return { ...t, status: 'Completed' as TaskStatus, completedAt: now, completedById: currentUser.id, actualDurationSec: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)), history: [...(t.history || []), historyEntry] };
    });
    onUpdateTasks(updatedTasks);
    if (nextStatus === 'Completed') {
      // The parent App also persists the completion and publishes the private
      // completion notifications to the switch owner/sender and GM.
    }
  };

  const canSwitchFromOverview = (task: Task) => {
    if (task.status === 'Completed' || task.status === 'Archived') return false;
    const assigneeIds = getAssigneeIds(task);
    if (isGeneralManager(currentUser)) return true;
    if (isDirector(currentUser)) {
      // Include the Director themself so a task sent directly to George (or any
      // Director) can be delegated to a member of their department.
      const scope = new Set([currentUser.id, ...getDescendantIds(currentUser.id, users)]);
      return assigneeIds.some(id => scope.has(id));
    }
    if (isManager(currentUser)) return assigneeIds.includes(currentUser.id) || assigneeIds.some(id => {
      const assignee = users.find(u => u.id === id);
      return !!assignee && assignee.parentId === currentUser.id && isAssistant(assignee);
    });
    return false;
  };

  const overviewSwitchTargets = React.useMemo(() => {
    if (isGeneralManager(currentUser)) return users.filter(u => u.id !== currentUser.id && u.status !== 'On Leave');
    if (isDirector(currentUser)) {
      const scope = new Set(getDescendantIds(currentUser.id, users));
      return users.filter(u => scope.has(u.id) && u.id !== currentUser.id && u.status !== 'On Leave');
    }
    if (isManager(currentUser)) return users.filter(u => u.parentId === currentUser.id && isAssistant(u) && u.status !== 'On Leave');
    return [];
  }, [currentUser, users]);

  const confirmOverviewSwitch = async () => {
    if (!switchTaskId || !switchTargetId) return;
    const target = users.find(u => u.id === switchTargetId);
    const task = tasks.find(t => t.id === switchTaskId);
    if (!target || !task || !canSwitchFromOverview(task) || !overviewSwitchTargets.some(u => u.id === target.id)) return;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: target.id })
      });
      const data = await response.json();
      if (!response.ok) return;
      onUpdateTasks(tasks.map(t => t.id === data.task.id ? data.task as Task : t));
      setSwitchTaskId(null);
      setSwitchTargetId('');
    } catch (error) {
      console.error('Overview task switch failed:', error);
    }
  };

  return (
    <div className="space-y-4 flex-1 min-h-0" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map(card => <div key={card.label} className="rounded-xl border border-white/5 bg-[#0a0a0f]/60 px-4 py-3.5 glass"><div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">{card.label}</div><div className={`text-3xl font-mono font-black mt-2 ${card.tone}`}>{card.value}</div></div>)}
      </div>
      <section className="rounded-xl border border-white/5 bg-[#0a0a0f]/60 glass overflow-hidden flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-white/5 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-indigo-400" /><h2 className="text-sm font-bold text-white">{language === 'ar' ? 'المهام التشغيلية' : 'Operations Tasks'}</h2><span className="text-[10px] font-mono text-zinc-500">{filteredTasks.length}</span></div>
          <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
            <label className="relative md:w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={language === 'ar' ? 'بحث عن مهمة أو موظف...' : 'Search tasks or employees...'} className="w-full h-9 rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-[11px] text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/40" /></label>
            <div className="flex items-center gap-2 text-zinc-500 px-1"><Filter className="h-3.5 w-3.5" />
              <select aria-label={language === 'ar' ? 'تصفية حسب القسم' : 'Filter by department'} value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none"><option value="all">{language === 'ar' ? 'كل الأقسام' : 'All Departments'}</option>{visibleDepartments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select>
              <select aria-label={language === 'ar' ? 'تصفية حسب الموظف' : 'Filter by employee'} value={overviewAssigneeFilter} onChange={e => setOverviewAssigneeFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none"><option value="all">{language === 'ar' ? 'كل الموظفين' : 'All Employees'}</option>{employeeOptions.map(user => <option key={user.id} value={user.id}>{user.name} — {user.positionCode || user.title}</option>)}</select>
              <select aria-label={language === 'ar' ? 'تصفية حسب الحالة' : 'Filter by status'} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#101014] px-2 text-[11px] text-zinc-300 outline-none"><option value="all">{language === 'ar' ? 'كل الحالات' : 'All Status'}</option><option value="Active">{language === 'ar' ? 'نشطة' : 'Active'}</option><option value="Overdue">{language === 'ar' ? 'متأخرة' : 'Overdue'}</option><option value="Completed">{language === 'ar' ? 'مكتملة' : 'Completed'}</option><option value="Archived">{language === 'ar' ? 'مؤرشفة' : 'Archived'}</option></select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left"><thead><tr className="border-b border-white/5 bg-white/[0.015]">
            {['Task','Sent By','Current Assignee','Department','Priority','Status','Time','Actions',''].map((head,i)=><th key={i} className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500">{head === 'Task' ? (language === 'ar' ? 'اسم المهمة' : 'Task') : head === 'Sent By' ? (language === 'ar' ? 'المرسل' : 'Sent By') : head === 'Current Assignee' ? (language === 'ar' ? 'الموظف الحالي' : 'Current Assignee') : head === 'Department' ? (language === 'ar' ? 'القسم' : 'Department') : head === 'Priority' ? (language === 'ar' ? 'الأولوية' : 'Priority') : head === 'Status' ? (language === 'ar' ? 'الحالة' : 'Status') : head === 'Time' ? (language === 'ar' ? 'الوقت' : 'Time') : head === 'Actions' ? (language === 'ar' ? 'الإجراء' : 'Actions') : ''}</th>)}
          </tr></thead><tbody>
            {filteredTasks.map(task => {
              const ids = getAssigneeIds(task);
              const assignees = ids.map(id => userMap.get(id)).filter(Boolean) as User[];
              const sender = userMap.get(task.lastTransferredById || task.assignedBy || task.createdBy);
              const originalSender = userMap.get(task.createdBy);
              const department = departmentMap.get(task.departmentId || '')?.name || task.departmentId || (language === 'ar' ? 'غير محدد' : 'Unassigned');
              const overdue = (task.status === 'Open' || task.status === 'In Progress') && new Date(task.deadline).getTime() < Date.now();
              return <tr key={task.id} onClick={() => onOpenTask(task.id)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.025] transition-colors cursor-pointer group">
                <td className="px-4 py-3.5 max-w-[300px]"><div className="text-[12px] font-semibold text-white leading-5 line-clamp-2" title={task.title}>{task.title}</div></td>
                <td className="px-4 py-3.5 min-w-[180px]"><div className="text-[12px] text-zinc-300 whitespace-nowrap">{sender?.name || task.createdBy}</div><div className="text-[9px] text-zinc-600 mt-0.5 truncate">{sender?.positionCode || sender?.title || ''}</div>{originalSender && sender && originalSender.id !== sender.id && <div className="text-[8px] text-zinc-700 mt-0.5 truncate">Original: {originalSender.name}</div>}</td>
                <td className="px-4 py-3.5 min-w-[190px]">{assignees.length ? <div className="flex flex-col gap-1">{assignees.map(u => <div key={u.id} className="flex items-center gap-1.5"><UserRound className="h-3 w-3 text-zinc-600 shrink-0" /><span className="text-[12px] text-zinc-300">{u.name}</span><span className="text-[9px] text-zinc-600 truncate">{u.positionCode || u.title}</span></div>)}</div> : <span className="text-zinc-600">{language === 'ar' ? 'غير معين' : 'Unassigned'}</span>}</td>
                <td className="px-4 py-3.5 text-[11px] text-zinc-400 whitespace-nowrap">{department}</td>
                <td className="px-4 py-3.5 whitespace-nowrap"><span className={`inline-flex items-center gap-2 text-[12px] font-medium ${priorityClass(task.priority)}`}><span className={`h-2.5 w-2.5 rounded-full ${priorityDot(task.priority)}`} />{task.priority}</span></td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-extrabold tracking-wide ${statusClass(getDisplayStatus(task))}`}>
                      {getDisplayStatus(task) === 'Completed' || getDisplayStatus(task) === 'Archived' ? <CheckCircle2 className="h-3 w-3" /> : null}
                      {getDisplayStatus(task) === 'In Progress' ? (language === 'ar' ? 'بدأت' : 'STARTED') : getDisplayStatus(task) === 'Open' ? (language === 'ar' ? 'مفتوحة' : 'OPEN') : getDisplayStatus(task) === 'Completed' ? (language === 'ar' ? 'مكتملة' : 'COMPLETED') : (language === 'ar' ? 'مؤرشفة' : 'ARCHIVED')}
                    </span>
                    {canOperateTask(task) && getDisplayStatus(task) === 'Open' && (
                      <button type="button" onClick={e => { e.stopPropagation(); updateTaskStatus(task, 'In Progress'); }} className="px-3 py-1.5 rounded-lg bg-sky-700 border border-sky-400/80 hover:bg-sky-600 text-white shadow-md shadow-sky-900/30 text-[10px] font-extrabold font-mono transition-colors">
                        <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" />{language === 'ar' ? 'ابدأ' : 'START'}</span>
                      </button>
                    )}
                    {canOperateTask(task) && getDisplayStatus(task) === 'In Progress' && (
                      <button type="button" onClick={e => { e.stopPropagation(); updateTaskStatus(task, 'Completed'); }} className="px-3 py-1.5 rounded-lg bg-emerald-700 border border-emerald-400/80 hover:bg-emerald-600 text-white shadow-md shadow-emerald-900/30 text-[10px] font-extrabold font-mono transition-colors">
                        <span className="inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" />{language === 'ar' ? 'إكمال' : 'COMPLETE'}</span>
                      </button>
                    )}
                    {(isDirector(currentUser) || isManager(currentUser)) && canSwitchFromOverview(task) && overviewSwitchTargets.length > 0 && (
                      <button type="button" onClick={e => { e.stopPropagation(); setSwitchTargetId(overviewSwitchTargets[0]?.id || ''); setSwitchTaskId(task.id); }} className="px-3 py-1.5 rounded-lg bg-indigo-700/80 border border-indigo-400/70 hover:bg-indigo-600 text-white shadow-md shadow-indigo-900/20 text-[10px] font-extrabold font-mono transition-colors">
                        <span className="inline-flex items-center gap-1"><ArrowRightLeft className="h-3 w-3" />{task.lastTransferredById && task.assigneeId ? `SWITCHED TO ${userMap.get(task.assigneeId)?.name || ''}` : 'SWITCH'}</span>
                      </button>
                    )}
                  </div>
                </td>
                <td className={`px-4 py-3.5 whitespace-nowrap text-[11px] font-mono ${overdue ? 'text-rose-300 font-bold' : 'text-zinc-400'}`}>{overdue ? '⚠ ' : ''}{getTaskTime(task)}</td>
                <td className="px-3 py-3.5 whitespace-nowrap"></td>
                <td className="px-3 py-3.5 text-right"><button type="button" aria-label={language === 'ar' ? 'فتح تفاصيل المهمة' : 'Open task details'} onClick={e => { e.stopPropagation(); onOpenTask(task.id); }} className="h-7 w-7 rounded-md inline-flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/5 transition-colors"><MoreHorizontal className="h-4 w-4" /></button></td>
              </tr>;
            })}
          </tbody></table>
          {!filteredTasks.length && <div className="py-14 text-center text-zinc-500 text-xs">{language === 'ar' ? 'لا توجد مهام مطابقة للفلاتر الحالية.' : 'No tasks match the current filters.'}</div>}
        </div>
      </section>

      {switchTaskId && (() => {
        const task = tasks.find(t => t.id === switchTaskId);
        if (!task) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSwitchTaskId(null)}>
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-slate-900">{language === 'ar' ? 'تحويل المهمة' : 'Switch Task'}</h3><button type="button" onClick={() => setSwitchTaskId(null)} className="text-slate-400 hover:text-slate-900">×</button></div>
              <p className="text-[11px] text-slate-600 mb-3">{task.title}</p>
              <select value={switchTargetId} onChange={e => setSwitchTargetId(e.target.value)} className="w-full h-10 rounded-lg border border-white/10 bg-white text-slate-900 px-3 text-xs font-semibold outline-none">
                {overviewSwitchTargets.map(u => <option key={u.id} value={u.id}>{u.name} — {u.positionCode || u.title}</option>)}
              </select>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setSwitchTaskId(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button type="button" onClick={confirmOverviewSwitch} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">{language === 'ar' ? 'تأكيد التحويل' : 'Confirm Switch'}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

