import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, LayoutDashboard, Kanban, ClipboardList, Layers, Users2,
  Terminal, Radio, Clock, AlertTriangle, AlertCircle, UserCheck, Flame, LogOut, Cpu,
} from 'lucide-react';
import { SystemData, User, Task, Checklist, Project, Notification, ChatMessage, ChecklistHistory, Department, Complaint } from './types';
import Header from './components/Header';
import TaskBoard from './components/TaskBoard';
import Checklists from './components/Checklists';
import StaffLeave from './components/StaffLeave';
import AnalyticsReports from './components/AnalyticsReports';
import Complaints from './components/Complaints';
import { useLanguage } from './context/LanguageContext';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';
import AuditLog from './components/AuditLog';
import NotificationAlertPopup from './components/NotificationAlertPopup';
import { Shield, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import LongBeachLogo from './components/LongBeachLogo';
import { hasManagerAccess, isGeneralManager, isDirector, canAccessAuditLog } from './utils/permissions';

import { autoResetChecklistsIfNeeded, autoArchiveTasksIfNeeded } from './utils/checklistReset';
import { saveTaskJournal, readTaskJournal, clearTaskJournal } from './utils/taskJournal';
import { shouldSkipPoll, resolveLandingTab } from './utils/liveSync';

export default function App() {
  const { language, t, isRtl } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Tasks' | 'Checklists' | 'Roster' | 'Admin' | 'Complaints' | 'AuditLog'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'tasks') return 'Tasks';
      if (hash === 'checklists') return 'Checklists';
      if (hash === 'roster') return 'Roster';
      if (hash === 'admin') return 'Admin';
      if (hash === 'auditlog') return 'AuditLog';
      if (hash === 'dashboard') return 'Dashboard';

      const saved = localStorage.getItem('long_beach_active_tab');
      if (saved && ['Dashboard', 'Tasks', 'Checklists', 'Roster', 'Admin', 'AuditLog'].includes(saved)) {
        return saved as any;
      }
    }
    return 'Dashboard';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('long_beach_active_tab', activeTab);
      window.location.hash = activeTab.toLowerCase();
    }
  }, [activeTab]);

  const [dashboardFocus, setDashboardFocus] = useState<{ type: 'task' | 'complaint' | 'checklist'; id: string } | null>(null);
  
  // Theme state manager
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('app-theme') as 'dark' | 'light') || 'dark';
  });

  const handleToggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('app-theme', next);
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      document.documentElement.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  // State managers
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [checklistHistory, setChecklistHistory] = useState<ChecklistHistory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [serverEnv, setServerEnv] = useState<'production' | 'test'>('production');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Refs holding latest states synchronously across multiple rapid renders
  const usersRef = React.useRef<User[]>([]);
  const departmentsRef = React.useRef<Department[]>([]);
  const tasksRef = React.useRef<Task[]>([]);
  const checklistsRef = React.useRef<Checklist[]>([]);
  const checklistHistoryRef = React.useRef<ChecklistHistory[]>([]);
  const projectsRef = React.useRef<Project[]>([]);
  const complaintsRef = React.useRef<Complaint[]>([]);
  const notificationsRef = React.useRef<Notification[]>([]);
  const chatsRef = React.useRef<ChatMessage[]>([]);

  // Frontend demo safety net: when testing the UI without a real database, keep a
  // tiny mutation journal in the browser as well as the JSON server state. This
  // prevents a just-created task from disappearing if a refresh/socket race occurs
  // before the server response settles. The journal is shared by all test accounts
  // in this browser and is removed automatically once the server confirms the task.

  // Synchronization safety references to prevent self-conflict loops and state overwrites during entries
  const inFlightSyncRequests = React.useRef<number>(0);
  const lastLocalChangeTime = React.useRef<number>(0);

  // Keep references synchronously updated
  const updateUsersState = (newUsers: User[]) => {
    setUsers(newUsers);
    usersRef.current = newUsers;
  };
  const updateDepartmentsState = (newDepartments: Department[]) => {
    setDepartments(newDepartments);
    departmentsRef.current = newDepartments;
  };
  const updateTasksState = (newTasks: Task[]) => {
    setTasks(newTasks);
    tasksRef.current = newTasks;
  };
  const updateChecklistsState = (newChecklists: Checklist[]) => {
    setChecklists(newChecklists);
    checklistsRef.current = newChecklists;
  };
  const updateChecklistHistoryState = (newHistory: ChecklistHistory[]) => {
    setChecklistHistory(newHistory);
    checklistHistoryRef.current = newHistory;
  };
  const updateProjectsState = (newProjects: Project[]) => {
    setProjects(newProjects);
    projectsRef.current = newProjects;
  };
  const updateComplaintsState = (newComplaints: Complaint[]) => {
    setComplaints(newComplaints);
    complaintsRef.current = newComplaints;
  };
  const updateNotificationsState = (newNotifications: Notification[]) => {
    setNotifications(newNotifications);
    notificationsRef.current = newNotifications;
  };
  const updateChatsState = (newChats: ChatMessage[]) => {
    setChats(newChats);
    chatsRef.current = newChats;
  };

  const currentUserRef = React.useRef<User | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [activePresences, setActivePresences] = React.useState<any[]>([]);
  const [activeLocks, setActiveLocks] = React.useState<{ [itemId: string]: any }>({});
  const [conflictDetails, setConflictDetails] = React.useState<{ message: string; conflicts: any[]; serverState: any } | null>(null);
  
  const wsRef = React.useRef<WebSocket | null>(null);

  // Initialize and maintain WebSocket connection
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pingInterval: any = null;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log('Real-time synchronization connected.');
          
          // If logged in, immediately declare presence
          const user = currentUserRef.current;
          if (user) {
            socket?.send(JSON.stringify({
              type: 'join',
              userId: user.id,
              userName: user.name,
              role: user.role,
              avatar: user.avatar,
              activeTab: activeTab,
              editingId: null
            }));
          }

          // Setup ping to keep connection alive
          pingInterval = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 20000);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
              case 'presence_changed':
              case 'sync_presence': {
                setActivePresences(data.presences || []);
                if (data.locks) setActiveLocks(data.locks);
                break;
              }
              case 'locks_changed': {
                setActiveLocks(data.locks || {});
                break;
              }
              case 'env_changed': {
                setServerEnv(data.env || 'production');
                const state: SystemData = data.state;
                updateUsersState(state.users || []);
                updateDepartmentsState(state.departments || []);
                updateTasksState(state.tasks || []);
                updateChecklistsState(state.checklists || []);
                updateChecklistHistoryState(state.checklistHistory || []);
                updateProjectsState(state.projects || []);
                updateComplaintsState(state.complaints || []);
                updateNotificationsState(state.notifications || []);
                updateChatsState(state.chats || []);
                break;
              }
              case 'state_updated': {
                // If the update was triggered by us, we already updated our state. Skip to avoid redundant self-overwrites.
                if (data.updatedBy === currentUserRef.current?.id) {
                  break;
                }

                // If we are currently sending an update or just completed one very recently, wait for it to settle.
                if (inFlightSyncRequests.current > 0 || (Date.now() - lastLocalChangeTime.current < 4000)) {
                  break;
                }

                // If the user is actively typing in an input field, do not rebuild states to preserve cursor & text.
                const activeEl = document.activeElement;
                const isUserActiveTyping = activeEl && (
                  activeEl.tagName === 'INPUT' || 
                  activeEl.tagName === 'TEXTAREA' || 
                  activeEl.getAttribute('contenteditable') === 'true'
                );
                if (isUserActiveTyping) {
                  break;
                }

                // Influx of real-time state change from another client instance
                const state: SystemData = data.state;
                updateUsersState(state.users || []);
                updateDepartmentsState(state.departments || []);
                updateTasksState(state.tasks || []);
                updateChecklistsState(state.checklists || []);
                updateChecklistHistoryState(state.checklistHistory || []);
                updateProjectsState(state.projects || []);
                updateComplaintsState(state.complaints || []);
                updateNotificationsState(state.notifications || []);
                updateChatsState(state.chats || []);
                break;
              }
              case 'lock_denied': {
                // Another user holds the lock, warn current user
                alert(language === 'ar' 
                  ? `هذا البند محجوز حاليا بواسطة ${data.lockedBy.userName}. لا يمكنك التعديل عليه الآن.` 
                  : `This item is locked by ${data.lockedBy.userName}. You cannot edit it at this time.`
                );
                break;
              }
            }
          } catch (e) {
            console.error('Error parsing WS frame:', e);
          }
        };

        socket.onclose = () => {
          console.log('WebSocket connection closed, scheduled reconnections...');
          clearInterval(pingInterval);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = (err) => {
          console.error('WebSocket connection error:', err);
          socket?.close();
        };

      } catch (err) {
        console.error('WebSocket bootstrap error:', err);
      }
    };

    connectWebSocket();

    return () => {
      socket?.close();
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
    };
  }, []);

  // Update presence on activeTab change or currentUser change
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentUser) {
      wsRef.current.send(JSON.stringify({
        type: 'join',
        userId: currentUser.id,
        userName: currentUser.name,
        role: currentUser.role,
        avatar: currentUser.avatar,
        activeTab: activeTab,
        editingId: null
      }));
    }
  }, [currentUser, activeTab]);

  // Google Sheets-like High-Frequency Syncer to ensure robust real-time synchronization
  useEffect(() => {
    let intervalId: any = null;

    const runPollingActiveSync = async () => {
      // The polling fallback stands down while: the WS is live, a save is in
      // flight, a local edit just happened, or the user is typing. (See shouldSkipPoll.)
      const activeEl = document.activeElement;
      if (shouldSkipPoll({
        socketOpen: !!wsRef.current && wsRef.current.readyState === WebSocket.OPEN,
        inFlightSyncCount: inFlightSyncRequests.current,
        msSinceLocalChange: Date.now() - lastLocalChangeTime.current,
        isUserTyping: !!activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ),
      })) {
        return;
      }

      try {
        if (!currentUserRef.current) return;
        const response = await fetch('/api/state');
        if (response.ok) {
          const data: SystemData = await response.json();
          
          // Re-verify guard states after the network promise settles
          if (
            inFlightSyncRequests.current === 0 &&
            Date.now() - lastLocalChangeTime.current >= 5000
          ) {
            updateUsersState(data.users || []);
            updateDepartmentsState(data.departments || []);
            updateTasksState(data.tasks || []);
            updateChecklistsState(data.checklists || []);
            updateChecklistHistoryState(data.checklistHistory || []);
            updateProjectsState(data.projects || []);
            updateComplaintsState(data.complaints || []);
            updateNotificationsState(data.notifications || []);
            updateChatsState(data.chats || []);
          }
        }
      } catch (err) {
        console.warn('Real-time sync background poll details:', err);
      }
    };

    // Run active pull every 5 seconds as a robust fallback ONLY when WebSocket is offline
    intervalId = setInterval(runPollingActiveSync, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const handleLockItem = (itemId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'lock_item', itemId }));
    }
  };

  const handleUnlockItem = (itemId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unlock_item', itemId }));
    }
  };


  // Load state from the authenticated full-stack server.
  const fetchStateFromServer = async () => {
    try {
      const response = await fetch('/api/state');
      if (response.status === 401) {
        const usersResponse = await fetch('/api/auth/users');
        if (usersResponse.ok) updateUsersState((await usersResponse.json()).users || []);
        setIsLoggedIn(false); setCurrentUser(null);
        localStorage.removeItem('is_logged_in'); localStorage.removeItem('logged_in_user_id');
        return;
      }
      const data: SystemData = await response.json();
      updateUsersState(data.users || []); updateDepartmentsState(data.departments || []);
      updateTasksState(data.tasks || []); updateChecklistsState(data.checklists || []);
      updateChecklistHistoryState(data.checklistHistory || []); updateProjectsState(data.projects || []);
      updateComplaintsState(data.complaints || []); updateNotificationsState(data.notifications || []);
      updateChatsState(data.chats || []);
      const meResponse = await fetch('/api/auth/me');
      if (meResponse.ok) {
        const meData = await meResponse.json(); const matched = meData.user as User;
        setCurrentUser(matched); setIsLoggedIn(true);
        localStorage.setItem('is_logged_in', 'true'); localStorage.setItem('logged_in_user_id', matched.id);
        // Honour a deep link (e.g. a reload on #checklists) when it points at a
        // tab this user may open; otherwise land them on their role's home tab.
        const HASH_TO_TAB: Record<string, typeof activeTab> = {
          dashboard: 'Dashboard', tasks: 'Tasks', checklists: 'Checklists',
          roster: 'Roster', admin: 'Admin', complaints: 'Complaints', auditlog: 'AuditLog',
        };
        const deepTab = HASH_TO_TAB[window.location.hash.replace(/^#/, '').toLowerCase()];
        const home = resolveLandingTab(matched);
        const universal = deepTab === 'Tasks' || deepTab === 'Checklists' || deepTab === 'Complaints';
        // Roster, the Admin panel and the Audit Log are GM-only — a Director or
        // Manager deep-linking to #admin / #auditlog / #roster is bounced home.
        const gmOnly = deepTab === 'Admin' || deepTab === 'AuditLog' || deepTab === 'Roster';
        const privileged = home === 'Dashboard'; // GM / Director / Manager reach Dashboard
        const canReachDeep = universal || (gmOnly ? isGeneralManager(matched) : privileged);
        setActiveTab(deepTab && canReachDeep ? deepTab : home);
      } else { setIsLoggedIn(false); setCurrentUser(null); }
    } catch (error) { console.error('Failed to load operations state from server:', error); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStateFromServer(); }, []);

  // Periodic background check for Egypt timezone checklist resets and task archiving (every 30 seconds)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      let isChanged = false;
      let nextChecklists = checklistsRef.current;
      let nextTasks = tasksRef.current;

      if (nextChecklists && nextChecklists.length > 0) {
        const resetResult = autoResetChecklistsIfNeeded(nextChecklists);
        if (resetResult) {
          nextChecklists = resetResult;
          updateChecklistsState(resetResult);
          isChanged = true;
        }
      }

      if (nextTasks && nextTasks.length > 0) {
        // Non-GM users only archive their own tickets — archiving a task outside
        // their scope is a change the server rejects, which would block the sync.
        const archiveOwnerId = isGeneralManager(currentUserRef.current) ? undefined : currentUserRef.current?.id;
        const archiveResult = autoArchiveTasksIfNeeded(nextTasks, archiveOwnerId);
        if (archiveResult) {
          nextTasks = archiveResult;
          updateTasksState(archiveResult);
          isChanged = true;
        }
      }

      if (isChanged) {
        syncStateWithServer({
          checklists: nextChecklists,
          tasks: nextTasks
        });
      }
    }, 30000);
    return () => clearInterval(checkInterval);
  }, []);

  // Overdue reminders: the assignee and their direct manager/parent only.
  // Never fan an overdue reminder down to assistants or sideways across the hierarchy.
  useEffect(() => {
    if (!tasks.length && !complaints.length) return;

    const publishOverdue = (entityType: 'task' | 'complaint', entityId: string, title: string, assigneeId?: string | null, departmentId?: string) => {
      const directParentId = assigneeId ? usersRef.current.find(u => u.id === assigneeId)?.parentId : undefined;
      const department = departmentId ? departmentsRef.current.find(d => d.id === departmentId) : undefined;
      // The GM must be alerted about every overdue task in the hotel, not only
      // ones inside their own direct reporting line.
      const gmIds = entityType === 'task' ? usersRef.current.filter(u => isGeneralManager(u)).map(u => u.id) : [];
      const recipients = Array.from(new Set([
        assigneeId || undefined,
        directParentId,
        !assigneeId ? department?.directorId : undefined,
        ...(!assigneeId && department?.managerIds ? department.managerIds.slice(0, 1) : []),
        ...gmIds
      ].filter((id): id is string => !!id)));

      recipients.forEach(recipientId => {
        const key = `${entityType}:${entityId}:overdue:${recipientId}`;
        if (notificationsRef.current.some(n => n.eventKey === key && n.recipientUserId === recipientId)) return;
        handleAddNotification(
          language === 'ar' ? `تنبيه تأخير: ${title}` : `Overdue Reminder: ${title}`,
          language === 'ar'
            ? `المهمة/الشكوى متأخرة وتحتاج متابعة. أنت ضمن التسلسل المباشر للمسؤول عنها.`
            : `This item is overdue and requires follow-up. You are the assignee or the direct manager in its reporting line.`,
          'Alert',
          recipientId,
          key
        );
      });
    };

    tasks.forEach(task => {
      if (task.status !== 'Completed' && task.status !== 'Archived' && task.deadline && new Date(task.deadline).getTime() < Date.now()) {
        publishOverdue('task', task.id, task.title, task.assigneeId || task.assigneeIds?.[0], task.departmentId);
      }
    });

    complaints.forEach(complaint => {
      if ((complaint.status === 'Open' || complaint.status === 'In Progress') && Date.now() - new Date(complaint.createdAt).getTime() > 24 * 60 * 60 * 1000) {
        publishOverdue('complaint', complaint.id, complaint.title, complaint.assignedToId, complaint.departmentId);
      }
    });
  }, [tasks, complaints, users, departments, language]);

  // Notifications are rendered only in the notification center.
  // Do not use window.alert on login/refresh: the same notification stays in the inbox
  // until the recipient explicitly presses OK, then it is removed and persisted.

  // Save state back to server whenever a client mutation occurs
  const syncStateWithServer = async (updatedData: Partial<SystemData>) => {
    // Record our local modification times to prevent incoming poll/socket race overrides
    lastLocalChangeTime.current = Date.now();
    inFlightSyncRequests.current += 1;

    // Synchronize any partial updates into refs immediately
    if (updatedData.users !== undefined) usersRef.current = updatedData.users;
    if (updatedData.departments !== undefined) departmentsRef.current = updatedData.departments;
    if (updatedData.tasks !== undefined) tasksRef.current = updatedData.tasks;
    if (updatedData.checklists !== undefined) checklistsRef.current = updatedData.checklists;
    if (updatedData.checklistHistory !== undefined) checklistHistoryRef.current = updatedData.checklistHistory;
    if (updatedData.projects !== undefined) projectsRef.current = updatedData.projects;
    if (updatedData.complaints !== undefined) complaintsRef.current = updatedData.complaints;
    if (updatedData.notifications !== undefined) notificationsRef.current = updatedData.notifications;
    if (updatedData.chats !== undefined) chatsRef.current = updatedData.chats;

    try {
      // Form complete state using latest references to avoid stale closure races
      const completeState: SystemData = {
        users: usersRef.current,
        departments: departmentsRef.current,
        tasks: tasksRef.current,
        checklists: checklistsRef.current,
        checklistHistory: checklistHistoryRef.current,
        projects: projectsRef.current,
        complaints: complaintsRef.current,
        notifications: notificationsRef.current,
        chats: chatsRef.current
      };

      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUserRef.current ? currentUserRef.current.id : 'unknown'
        },
        body: JSON.stringify(completeState)
      });

      if (response.status === 409) {
        const errorData = await response.json();
        const serverState = errorData.dbState;
        
        setConflictDetails({
          message: errorData.message || 'Conflict detected',
          conflicts: errorData.conflicts || [],
          serverState: serverState
        });
        
        // Auto-refresh client state with fresh server data immediately!
        if (serverState) {
          updateUsersState(serverState.users || []);
          updateDepartmentsState(serverState.departments || []);
          updateTasksState(serverState.tasks || []);
          updateChecklistsState(serverState.checklists || []);
          updateChecklistHistoryState(serverState.checklistHistory || []);
          updateProjectsState(serverState.projects || []);
          updateComplaintsState(serverState.complaints || []);
          updateNotificationsState(serverState.notifications || []);
          updateChatsState(serverState.chats || []);
        }
        return;
      }

      if (response.ok) {
        const returnedState: SystemData = await response.json();
        // Update local state and refs synchronously
        updateUsersState(returnedState.users);
        updateDepartmentsState(returnedState.departments || []);
        updateTasksState(returnedState.tasks);
        updateChecklistsState(returnedState.checklists);
        updateChecklistHistoryState(returnedState.checklistHistory);
        updateProjectsState(returnedState.projects);
        updateComplaintsState(returnedState.complaints || []);
        updateNotificationsState(returnedState.notifications);
        updateChatsState(returnedState.chats);

        const pendingJournal = readTaskJournal();
        if (pendingJournal && pendingJournal.tasks.every(journalTask => returnedState.tasks.some(serverTask => serverTask.id === journalTask.id))) {
          clearTaskJournal();
        }

        // Retain current user matching their updated parameters
        const currentActiveUser = currentUserRef.current;
        if (currentActiveUser) {
          const matched = returnedState.users.find(u => u.id === currentActiveUser.id);
          if (matched) setCurrentUser(matched);
        }
      } else {
        // A rejected save must never be swallowed silently — otherwise the local
        // edit lingers on screen until the next poll quietly wipes it.
        const detail = await response.text().catch(() => '');
        console.error('State sync rejected:', response.status, detail);
        if (response.status === 401) {
          // Session ended mid-edit: send the user back to sign in rather than
          // pretending the save succeeded. The task journal keeps their last edit.
          setIsLoggedIn(false);
          setCurrentUser(null);
          localStorage.removeItem('is_logged_in');
          localStorage.removeItem('logged_in_user_id');
        }
      }
    } catch (error) {
      console.error('State save sync failed:', error);
    } finally {
      inFlightSyncRequests.current = Math.max(0, inFlightSyncRequests.current - 1);
    }
  };

  // Unified, idempotent notification publisher. The same eventKey can never create the same alert twice.
  const handleAddNotification = (title: string, message: string, category: 'Task' | 'Checklist' | 'Project' | 'Complaint' | 'Alert' | 'System', recipientUserId?: string, eventKey?: string) => {
    if (!recipientUserId || !usersRef.current.some(u => u.id === recipientUserId)) return;
    if (eventKey && notificationsRef.current.some(n => n.recipientUserId === recipientUserId && n.eventKey === eventKey)) return;
    const newNotif: Notification = {
      id: `notif-${Date.now()}-${Math.random()}`, title, message, category, createdAt: new Date().toISOString(), isRead: false,
      recipientUserId, eventKey,
      channels: { inApp: true, telegram: true, email: true }
    };
    const nextNotifs = [newNotif, ...notificationsRef.current];
    updateNotificationsState(nextNotifs);
    syncStateWithServer({ notifications: nextNotifs });
  };

  // Update users matrix and trigger unified synchronisation atomically
  const handleUpdateUsers = (
    updatedUsers: User[],
    optNotif?: {
      title: string;
      message: string;
      category: 'Task' | 'Checklist' | 'Project' | 'Alert' | 'System';
    }
  ) => {
    updateUsersState(updatedUsers);
    if (currentUser) {
      const matched = updatedUsers.find(u => u.id === currentUser.id);
      if (matched) setCurrentUser(matched);
    }

    let nextNotifs = notificationsRef.current;
    if (optNotif) {
      const newNotif: Notification = {
        id: `notif-${Date.now()}-${Math.random()}`,
        title: optNotif.title,
        message: optNotif.message,
        category: optNotif.category,
        createdAt: new Date().toISOString(),
        isRead: false,
        channels: {
          inApp: true,
          telegram: true,
          email: true
        }
      };
      nextNotifs = [newNotif, ...notificationsRef.current];
      updateNotificationsState(nextNotifs);
    }

    syncStateWithServer({ users: updatedUsers, notifications: nextNotifs });
  };

  // Mark single notification read (does not remove it — it stays in the Notification Center)
  const handleMarkNotifRead = (id: string) => {
    const updated = notificationsRef.current.map(n =>
      n.id === id && n.recipientUserId === currentUserRef.current?.id ? { ...n, isRead: true } : n
    );
    updateNotificationsState(updated);
    syncStateWithServer({ notifications: updated });
  };

  // Mark all of the current user's notifications read (does not remove them)
  const handleMarkAllNotifsRead = () => {
    const updated = notificationsRef.current.map(n =>
      n.recipientUserId === currentUserRef.current?.id ? { ...n, isRead: true } : n
    );
    updateNotificationsState(updated);
    syncStateWithServer({ notifications: updated });
  };

  // Acknowledge a notification from its top-of-screen alert popup.
  // OK must always move the current alert into the Notification Center
  // immediately. The server acknowledgement is then persisted in the
  // background so a slow request can never leave the alert stuck on screen.
  const handleAcknowledgeNotification = async (id: string) => {
    const actingUserId = currentUserRef.current?.id;
    const acknowledgedAt = new Date().toISOString();
    const optimisticNotifications = notificationsRef.current.map(n =>
      n.id === id
        ? { ...n, acknowledgedAt: n.acknowledgedAt || acknowledgedAt, acknowledgedBy: n.acknowledgedBy || actingUserId }
        : n
    );

    // Update synchronously first: popup disappears and the item is available
    // in the bell as soon as the user presses OK.
    updateNotificationsState(optimisticNotifications);

    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/acknowledge`, {
        method: 'POST',
        credentials: 'same-origin'
      });

      if (response.ok) {
        const data = await response.json();
        updateNotificationsState(notificationsRef.current.map(n => n.id === id ? data.notification : n));
        return;
      }

      // Frontend fallback for the demo/test environment: keep the acknowledged
      // state locally and ask the normal state sync to persist it.
      syncStateWithServer({ notifications: optimisticNotifications });
    } catch {
      // Do not re-open an alert after OK because of a temporary network delay.
      // The normal sync loop will retry/persist the current frontend state.
      syncStateWithServer({ notifications: optimisticNotifications });
    }
  };

  const handleSignup = async (account: { name: string; password: string; role: 'Director' | 'Manager' | 'Assistant'; departmentId: string; avatar: string; email: string; parentId: string }) => {
    try {
      const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) });
      let data: any = {};
      try {
        data = await response.json();
      } catch {}
      if (!response.ok) {
        return { ok: false, error: data.message || (response.status === 413 ? 'Image is too large. Please select a smaller photo.' : 'Unable to create account.') };
      }
      const usersResponse = await fetch('/api/auth/users');
      if (usersResponse.ok) {
        const authData = await usersResponse.json();
        updateUsersState(authData.users || []);
        if (authData.departments) updateDepartmentsState(authData.departments);
      }
      if (data.user) {
        handleLogin(data.user);
      }
      return { ok: true, user: data.user };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unable to connect to server.' };
    }
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('logged_in_user_id', user.id);
    setActiveTab(isGeneralManager(user) || isDirector(user) || hasManagerAccess(user) ? 'Dashboard' : 'Tasks');
    void fetchStateFromServer();
  };

  const handleUpdateUserProfile = async (updatedFields: Partial<User>, newPassword?: string) => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedFields,
          newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.message || 'Failed to update profile' };
      }
      const nextUser = data.user;
      setCurrentUser(nextUser);
      currentUserRef.current = nextUser;
      const nextUsers = users.map(u => (u.id === nextUser.id ? nextUser : u));
      updateUsersState(nextUsers);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error' };
    }
  };

  const handleLogout = async () => {
    // Let any in-flight state save land first — logout invalidates the session
    // server-side, so a save that arrives after it would be rejected and the
    // user's last edit lost.
    const deadline = Date.now() + 3000;
    while (inFlightSyncRequests.current > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setCurrentUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('logged_in_user_id');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060913] text-white flex flex-col items-center justify-center font-display gap-3 p-6">
        <Cpu className="h-10 w-10 text-emerald-400 animate-spin" />
        <h2 className="text-sm font-semibold tracking-wide font-mono uppercase text-slate-400">{t('boot.title')}</h2>
        <p className="text-slate-600 text-xs text-center max-w-sm">{t('boot.subtitle')}</p>
      </div>
    );
  }

  if (!isLoggedIn || !currentUser) {
    return <LoginPage users={users} departments={departments} onLogin={handleLogin} onSignup={handleSignup} />;
  }

  // Active critical overdue tasks to highlight on dash
  const activeCriticalDeadlinesCount = tasks.filter(t => t.priority === 'Critical' && t.status !== 'Completed').length;

  // Operations Board badge: counts actual TASKS currently assigned to this user
  // that are not yet completed. Deliberately independent from the notification
  // bell counter (which counts unread alerts) — the two must never be tied together.
  const myPendingTasksCount = tasks.filter(t => {
    const recipients = t.assigneeIds?.length ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []);
    return recipients.includes(currentUser.id) && t.status !== 'Completed';
  }).length;

  // Notifications pending acknowledgement for the logged-in user, oldest first.
  // Only the first one is shown as a top-of-screen alert at a time; the rest
  // wait their turn and never appear until the current alert is OK'd.
  const pendingAlertNotifications = notifications
    .filter(n => n.recipientUserId === currentUser.id && !n.acknowledgedAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeAlertNotification = pendingAlertNotifications[0] || null;

  // Per-account live counters for the credential switcher and side navigation.
  const taskCounts: Record<string, number> = Object.fromEntries(users.map(u => [
    u.id,
    tasks.filter(t => {
      const assignees = t.assigneeIds?.length ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []);
      return assignees.includes(u.id) && (t.status === 'Open' || t.status === 'In Progress');
    }).length
  ]));
  const complaintCounts: Record<string, number> = Object.fromEntries(users.map(u => [
    u.id,
    complaints.filter(c => (c.status === 'Open' || c.status === 'In Progress') && (
      isGeneralManager(u) || c.departmentId === u.departmentId
    )).length
  ]));

  return (
    <div className="h-screen bg-[#050507] text-zinc-100 flex flex-col font-sans select-none overflow-hidden">
      <NotificationAlertPopup
        notification={activeAlertNotification}
        onAcknowledge={handleAcknowledgeNotification}
        queueCount={Math.max(0, pendingAlertNotifications.length - 1)}
      />
      
      {/* Central Header */}
      <Header
        currentUser={currentUser}
        users={users}
        onLogout={handleLogout}
        onUpdateProfile={handleUpdateUserProfile}
        notifications={notifications}
        onMarkRead={handleMarkNotifRead}
        onMarkAllRead={handleMarkAllNotifsRead}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        activePresences={activePresences}
        taskCounts={taskCounts}
        complaintCounts={complaintCounts}
      />

      {/* Main Container Layer */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        
        {/* SIDE BAR NAVIGATION */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-white/5 bg-black/20 p-4 space-y-2 lg:block shrink-0 overflow-y-auto">
          
          {/* Official Hotel Logo & Branding */}
          <div className="flex flex-col items-center justify-center p-4 mb-4 border border-orange-500/10 bg-orange-500/5 rounded-2xl">
            <LongBeachLogo size="sm" variant="light" showText={true} />
            <span className="block text-[8px] text-zinc-500 font-mono font-bold uppercase tracking-widest mt-1">{language === 'ar' ? 'مركز العمليات وإدارة المهام' : 'Operations Management Center'}</span>
          </div>

          <div className="px-3 py-2 border border-white/5 bg-white/2 rounded-xl mb-4 glass">
            <span className="block text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest">{t('side.active_credentials')}</span>
            <div className="flex items-center gap-2.5 mt-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-white leading-none truncate max-w-[150px]">{currentUser.name}</p>
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1 italic font-mono uppercase">{isGeneralManager(currentUser) ? t('role.general_manager') : isDirector(currentUser) ? t('role.director') : currentUser.role === 'Manager' ? t('role.manager') : currentUser.role === 'Assistant' ? t('role.assistant') : t('role.coordinator')} {t('side.permissions')}</span>
            
            {/* Environment Indicator Badge */}
            <div className={`mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[9px] font-mono font-extrabold uppercase tracking-wider ${
              serverEnv === 'production' ? 'text-amber-400' : 'text-sky-400'
            }`}>
              <span>{language === 'ar' ? 'بيئة العمل:' : 'ENV POINTER:'}</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                serverEnv === 'production' 
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' 
                  : 'bg-sky-500/10 border-sky-450/30 text-sky-300 animate-pulse'
              }`}>
                {serverEnv === 'production' ? 'PROD (LIVE)' : 'SANDBOX'}
              </span>
            </div>
          </div>

          <span className="block px-3 py-1 text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono">{t('side.operations')}</span>

          <nav className="space-y-1">
            {(isGeneralManager(currentUser) || isDirector(currentUser) || hasManagerAccess(currentUser)) && (
              <button
                onClick={() => setActiveTab('Dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer border ${
                  activeTab === 'Dashboard'
                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-sm shadow-indigo-550/10'
                    : 'hover:bg-white/5 text-zinc-400 hover:text-white border-transparent'
                }`}
              >
                <LayoutDashboard className="h-4 w-4" /> {t('side.command_center')}
              </button>
            )}

            <button
              onClick={() => setActiveTab('Tasks')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer border ${
                activeTab === 'Tasks'
                  ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-sm shadow-indigo-550/10'
                  : 'hover:bg-white/5 text-zinc-400 hover:text-white border-transparent'
              }`}
            >
              <span className="flex items-center gap-3"><Kanban className="h-4 w-4" /> {t('side.operations_board')}</span>
              {taskCounts[currentUser.id] > 0 && (
                <span className="bg-red-500/20 border border-red-500/40 font-mono text-[9px] text-red-300 font-bold px-1.5 rounded">
                  {taskCounts[currentUser.id]}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('Checklists')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer border ${
                activeTab === 'Checklists'
                  ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-sm shadow-indigo-550/10'
                  : 'hover:bg-white/5 text-zinc-400 hover:text-white border-transparent'
              }`}
            >
              <span className="flex items-center gap-3"><ClipboardList className="h-4 w-4" /> {t('side.checklists')}</span>
              {checklists.some(c => c.items.some(i => !i.completed)) && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>


            {/* Complaints section hidden temporarily as requested
            <button
              onClick={() => setActiveTab('Complaints')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer border ${
                activeTab === 'Complaints'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/20 shadow-sm shadow-rose-550/10'
                  : 'hover:bg-white/5 text-zinc-400 hover:text-white border-transparent'
              }`}
            >
              <span className="flex items-center gap-3">
                <MessageSquareWarning className="h-4 w-4" />
                {language === 'ar' ? 'شكاوى Exclusivi' : 'Exclusivi Complaints'}
              </span>
              {complaintCounts[currentUser.id] > 0 && (
                <span className="bg-rose-500/20 border border-rose-500/30 font-mono text-[9px] text-rose-300 font-bold px-1.5 rounded">
                  {complaintCounts[currentUser.id]}
                </span>
              )}
            </button>
            */}

            {isGeneralManager(currentUser) && (
              <button
                onClick={() => setActiveTab('Roster')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer border ${
                  activeTab === 'Roster'
                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-sm shadow-indigo-550/10'
                    : 'hover:bg-white/5 text-zinc-400 hover:text-white border-transparent'
                }`}
              >
                <Users2 className="h-4 w-4" /> {t('side.roster')}
              </button>
            )}

            {isGeneralManager(currentUser) && (
              <>
                <span className="block px-3 py-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono mt-3">
                  {language === 'ar' ? 'أدوات الإدارة' : 'Admin Controls'}
                </span>
                <button
                  onClick={() => setActiveTab('Admin')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-xs font-bold cursor-pointer border ${
                    activeTab === 'Admin'
                      ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-sm shadow-indigo-550/10'
                      : 'hover:bg-white/5 text-indigo-300 hover:text-indigo-200 border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3"><Shield className="h-4 w-4" /> {language === 'ar' ? 'الأقسام والنسخ الاحتياطي' : 'Departments & Backups'}</span>
                  <span className="text-[8px] bg-indigo-550 border border-indigo-500/25 px-1.5 py-0.5 rounded text-indigo-300 font-mono font-bold tracking-tight">GM</span>
                </button>
              </>
            )}

            {canAccessAuditLog(currentUser) && (
              <button
                onClick={() => setActiveTab('AuditLog')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-xs font-bold cursor-pointer border ${
                  activeTab === 'AuditLog'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/20 shadow-sm shadow-amber-500/10'
                    : 'hover:bg-white/5 text-amber-300 hover:text-amber-200 border-transparent'
                }`}
              >
                <span className="flex items-center gap-3"><ShieldCheck className="h-4 w-4" /> {language === 'ar' ? 'سجل التدقيق' : 'Audit Log'}</span>
                <span className="text-[8px] bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold tracking-tight">
                  GM
                </span>
              </button>
            )}

            <div className="pt-4 border-t border-white/5 mt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/15 cursor-pointer animate-in fade-in duration-300"
              >
                <LogOut className="h-4 w-4" />
                {language === 'ar' ? 'تسجيل الخروج الآمن' : 'Log Out (Secure)'}
              </button>
            </div>
          </nav>
        </aside>

        {/* WORKSPACE AREA */}
        <main className="flex-1 p-6 overflow-y-auto min-h-0 space-y-6 flex flex-col">
          
          {activeTab === 'Dashboard' && (isGeneralManager(currentUser) || isDirector(currentUser) || hasManagerAccess(currentUser)) && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 min-h-0 overflow-y-auto pr-1">
              
              {/* Analytics Dashboard component */}
              <AnalyticsReports
                tasks={tasks}
                users={users}
                currentUser={currentUser}
                checklistHistory={checklistHistory}
                complaints={complaints}
                departments={departments}
                checklists={checklists}
                onOpenTask={(id) => { setDashboardFocus({ type: 'task', id }); setActiveTab('Tasks'); }}
                onOpenComplaint={(id) => { setDashboardFocus({ type: 'complaint', id }); setActiveTab('Complaints'); }}
                onOpenChecklist={(id) => { setDashboardFocus({ type: 'checklist', id }); setActiveTab('Checklists'); }}
              />
            </div>
          )}

          {activeTab === 'Tasks' && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full">
              <TaskBoard
                tasks={tasks}
                users={users}
                currentUser={currentUser}
                departments={departments}
                initialTaskId={dashboardFocus?.type === 'task' ? dashboardFocus.id : undefined}
                onUpdateTasks={(updatedTasks) => {
                  const previous = tasksRef.current;
                  const nextNotifications = [...notificationsRef.current];
                  const publish = (recipientUserId: string | undefined, title: string, message: string, eventKey: string) => {
                    if (!recipientUserId || recipientUserId === currentUser.id) return;
                    if (nextNotifications.some(n => n.recipientUserId === recipientUserId && n.eventKey === eventKey)) return;
                    nextNotifications.unshift({
                      id: `notif-${Date.now()}-${Math.random()}`,
                      title,
                      message,
                      category: 'Task',
                      createdAt: new Date().toISOString(),
                      isRead: false,
                      recipientUserId,
                      eventKey,
                      channels: { inApp: true, telegram: true, email: true }
                    });
                  };

                  updatedTasks.forEach(task => {
                    const oldTask = previous.find(t => t.id === task.id);
                    const assignees = task.assigneeIds?.length ? task.assigneeIds : (task.assigneeId ? [task.assigneeId] : []);
                    const senderId = task.lastTransferredById || task.assignedBy || task.createdBy;
                    const senderName = usersRef.current.find(u => u.id === senderId)?.name || currentUser.name;

                    // Exactly one private notification when a task is newly assigned.
                    if (!oldTask) {
                      assignees.forEach(uid => publish(uid, 'New task', `New task from: ${senderName} — ${task.title}`, `task:${task.id}:new:${uid}`));

                      // The GM is also told whenever any task is dispatched to anyone,
                      // not just tasks the GM sends themselves.
                      const assigneeNames = assignees.map(uid => usersRef.current.find(u => u.id === uid)?.name || uid).join(', ');
                      const gmIds = usersRef.current.filter(u => isGeneralManager(u)).map(u => u.id);
                      gmIds.forEach(gmId => publish(gmId, 'Task dispatched', `${senderName} sent a new task to ${assigneeNames}: ${task.title}`, `task:${task.id}:new:gm:${gmId}`));
                      return;
                    }

                    const oldAssignees = oldTask.assigneeIds?.length ? oldTask.assigneeIds : (oldTask.assigneeId ? [oldTask.assigneeId] : []);
                    const assigneeChanged = assignees.join('|') !== oldAssignees.join('|');
                    const transferChanged = task.lastTransferredById && task.lastTransferredById !== oldTask.lastTransferredById;

                    // A switch is one event: notify only the new recipient, with the person who actually switched it.
                    if (assigneeChanged || transferChanged) {
                      assignees.filter(uid => !oldAssignees.includes(uid)).forEach(uid => {
                        publish(uid, 'New task', `New task from: ${senderName} — ${task.title}`, `task:${task.id}:assigned:${task.version || task.updatedAt || 'now'}:${uid}`);
                      });
                    }

                    // Starting work: tell the person who sent/switched the task (and the GM)
                    // the moment the assignee begins active execution, mirroring completion.
                    if (oldTask.status !== 'In Progress' && task.status === 'In Progress') {
                      const startSwitchOwnerId = task.lastTransferredById || task.assignedBy || task.createdBy;
                      const gmIdsStart = usersRef.current.filter(u => isGeneralManager(u)).map(u => u.id);

                      if (startSwitchOwnerId) {
                        publish(
                          startSwitchOwnerId,
                          'Task started',
                          `${currentUser.name} started working on: ${task.title}`,
                          `task:${task.id}:started:${task.version || task.updatedAt || task.startedAt || 'now'}:owner:${startSwitchOwnerId}`
                        );
                      }
                      gmIdsStart.forEach(gmId => {
                        publish(
                          gmId,
                          'Task started',
                          `${currentUser.name} started the task you sent them: ${task.title}`,
                          `task:${task.id}:started:${task.version || task.updatedAt || task.startedAt || 'now'}:gm:${gmId}`
                        );
                      });
                    }

                    // Completion is sent first to the person who currently owns/sent the task
                    // (the latest switcher, if any), then to the GM. Never duplicate a recipient.
                    if (oldTask.status !== 'Completed' && task.status === 'Completed') {
                      const switchOwnerId = task.lastTransferredById || task.assignedBy || task.createdBy;
                      const originalAssigneeId = task.originalAssigneeId || task.assigneeId;
                      const originalAssignee = usersRef.current.find(u => u.id === originalAssigneeId);
                      const gmIds = usersRef.current.filter(u => isGeneralManager(u)).map(u => u.id);

                      // After a switch, notify the switch owner first.
                      if (switchOwnerId) {
                        publish(
                          switchOwnerId,
                          'Task completed',
                          `${currentUser.name} completed the task you switched to them: ${task.title}`,
                          `task:${task.id}:completed:${task.version || task.updatedAt || task.completedAt || 'now'}:switch-owner:${switchOwnerId}`
                        );
                      }

                      // The GM is ALWAYS told when any task is completed — even if the GM
                      // is also the switch owner notified above — so this never depends on
                      // switch history or who directly sent the task. Uses its own eventKey
                      // (":gm:") so it never collides with or gets skipped by the owner notice.
                      gmIds.forEach(gmId => {
                        publish(
                          gmId,
                          'Task completed',
                          `${originalAssignee?.name || currentUser.name} completed the task you sent them: ${task.title}`,
                          `task:${task.id}:completed:${task.version || task.updatedAt || task.completedAt || 'now'}:gm:${gmId}`
                        );
                      });
                    }
                  });

                  updateTasksState(updatedTasks);
                  updateNotificationsState(nextNotifications);
                  // Persist the exact frontend test action first, then synchronize it.
                  // If the browser is refreshed or another account is opened immediately,
                  // the task and its recipient notification remain visible and are retried.
                  saveTaskJournal(updatedTasks, nextNotifications);
                  syncStateWithServer({ tasks: updatedTasks, notifications: nextNotifications });
                }}
                onAddNotification={handleAddNotification}
                activeLocks={activeLocks}
                onLockItem={handleLockItem}
                onUnlockItem={handleUnlockItem}
              />
            </div>
          )}

          {activeTab === 'Checklists' && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full overflow-y-auto pr-1">
              <Checklists
                checklists={checklists}
                initialChecklistId={dashboardFocus?.type === 'checklist' ? dashboardFocus.id : undefined}
                checklistHistory={checklistHistory}
                users={users}
                currentUser={currentUser}
                departments={departments}
                onUpdateChecklists={(updatedChecklists) => {
                  updateChecklistsState(updatedChecklists);
                  syncStateWithServer({ checklists: updatedChecklists });
                }}
                onLogHistory={(newHistoryLog) => {
                  const updatedLogs = [newHistoryLog, ...checklistHistoryRef.current];
                  updateChecklistHistoryState(updatedLogs);
                  syncStateWithServer({ checklistHistory: updatedLogs });
                }}
                onAddNotification={handleAddNotification}
                activeLocks={activeLocks}
                onLockItem={handleLockItem}
                onUnlockItem={handleUnlockItem}
              />
            </div>
          )}


          {activeTab === 'Roster' && isGeneralManager(currentUser) && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full overflow-y-auto pr-1">
              <StaffLeave
                users={users}
                currentUser={currentUser}
                onUpdateUsers={handleUpdateUsers}
                onAddNotification={(title, msg, cat) => handleAddNotification(title, msg, cat === 'Alert' ? 'Alert' : 'System')}
              />
            </div>
          )}

          {activeTab === 'Admin' && isGeneralManager(currentUser) && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full overflow-y-auto pr-1">
              <AdminPanel
                users={users}
                currentUser={currentUser}
                onUpdateUsers={handleUpdateUsers}
                onAddNotification={handleAddNotification}
                serverEnv={serverEnv}
                departments={departments}
                onUpdateDepartments={(updatedDepartments) => {
                  // Detect newly-added departments and auto-provision a fixed Daily/Weekly/Monthly
                  // checklist skeleton for each one, per the "static daily checklist per department" requirement.
                  const existingIds = new Set(departmentsRef.current.map(d => d.id));
                  const newlyAdded = updatedDepartments.filter(d => !existingIds.has(d.id));

                  updateDepartmentsState(updatedDepartments);

                  if (newlyAdded.length > 0) {
                    const now = new Date().toISOString();
                    const newChecklists: Checklist[] = newlyAdded.flatMap(dept => ([
                      {
                        id: `chk-daily-${dept.id}`,
                        type: 'Daily' as const,
                        title: language === 'ar' ? `الفحص اليومي - ${dept.name}` : `Daily Checklist - ${dept.name}`,
                        description: language === 'ar' ? 'قائمة الفحص اليومية الثابتة لهذا القسم.' : 'Fixed daily checklist for this department.',
                        departmentId: dept.id,
                        assignedToId: null,
                        items: [],
                        version: 1,
                        updatedAt: now
                      },
                      {
                        id: `chk-weekly-${dept.id}`,
                        type: 'Weekly' as const,
                        title: language === 'ar' ? `الفحص الأسبوعي - ${dept.name}` : `Weekly Checklist - ${dept.name}`,
                        description: language === 'ar' ? 'قائمة الفحص الأسبوعية الثابتة لهذا القسم.' : 'Fixed weekly checklist for this department.',
                        departmentId: dept.id,
                        assignedToId: null,
                        items: [],
                        version: 1,
                        updatedAt: now
                      },
                      {
                        id: `chk-monthly-${dept.id}`,
                        type: 'Monthly' as const,
                        title: language === 'ar' ? `الفحص الشهري - ${dept.name}` : `Monthly Checklist - ${dept.name}`,
                        description: language === 'ar' ? 'قائمة الفحص الشهرية الثابتة لهذا القسم.' : 'Fixed monthly checklist for this department.',
                        departmentId: dept.id,
                        assignedToId: null,
                        items: [],
                        version: 1,
                        updatedAt: now
                      }
                    ]));

                    const updatedChecklists = [...checklistsRef.current, ...newChecklists];
                    updateChecklistsState(updatedChecklists);
                    syncStateWithServer({ departments: updatedDepartments, checklists: updatedChecklists });
                  } else {
                    syncStateWithServer({ departments: updatedDepartments });
                  }
                }}
                onEnvironmentChanged={(env, state) => {
                  setServerEnv(env);
                  if (state) {
                    updateUsersState(state.users || []);
                    updateDepartmentsState(state.departments || []);
                    updateTasksState(state.tasks || []);
                    updateChecklistsState(state.checklists || []);
                    updateChecklistHistoryState(state.checklistHistory || []);
                    updateProjectsState(state.projects || []);
                    updateComplaintsState(state.complaints || []);
                    updateNotificationsState(state.notifications || []);
                    updateChatsState(state.chats || []);
                  }
                }}
                onRefreshAppState={fetchStateFromServer}
              />
            </div>
          )}

          {activeTab === 'AuditLog' && canAccessAuditLog(currentUser) && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full overflow-y-auto pr-1">
              <AuditLog
                currentUser={currentUser}
                users={users}
                departments={departments}
              />
            </div>
          )}

          {/* Complaints tab view hidden temporarily as requested
          {activeTab === 'Complaints' && (
            <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col min-h-0 h-full overflow-y-auto pr-1">
              <Complaints
                complaints={complaints}
                initialComplaintId={dashboardFocus?.type === 'complaint' ? dashboardFocus.id : undefined}
                departments={departments}
                users={users}
                currentUser={currentUser}
                onUpdateComplaints={(updatedComplaints) => {
                  const prev = complaintsRef.current; const nextNotifications = [...notificationsRef.current];
                  updatedComplaints.forEach(c => {
                    const old = prev.find(x => x.id === c.id);
                    const changed = !old || old.status !== c.status || old.updatedAt !== c.updatedAt;
                    if (!changed) return;
                    const recipients = [c.createdBy, c.assignedToId].filter((v): v is string => !!v && v !== currentUser.id);
                    recipients.forEach(uid => {
                      const key = `complaint:${c.id}:${c.status}:${c.updatedAt || c.createdAt}:${uid}`;
                      if (!nextNotifications.some(n => n.recipientUserId === uid && n.eventKey === key)) {
                        nextNotifications.unshift({ id: `notif-${Date.now()}-${Math.random()}`, title: 'Complaint / Exception', message: `${c.title} — ${c.status}`, category: 'Complaint', createdAt: new Date().toISOString(), isRead: false, recipientUserId: uid, eventKey: key, channels: { inApp: true, telegram: true, email: true } });
                      }
                    });
                  });
                  updateComplaintsState(updatedComplaints); updateNotificationsState(nextNotifications); syncStateWithServer({ complaints: updatedComplaints, notifications: nextNotifications });
                }}
                onAddNotification={handleAddNotification}
              />
            </div>
          )}
          */}

        </main>
      </div>

      {/* Real-time Multi-user Sync Conflict Modal Alert */}
      {conflictDetails && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-amber-500/30 max-w-lg w-full rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in duration-200" id="sync-conflict-modal">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-500 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {language === 'ar' ? 'تعارض في مزامنة البيانات' : 'Sync Conflict Detected'}
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono">CONCURRENCY_ERROR_409</p>
              </div>
            </div>

            <p className="text-xs text-zinc-350 leading-relaxed text-zinc-300">
              {language === 'ar'
                ? 'البيانات التي حاولت تعديلها تم تحديثها من قبل مستخدم آخر في الخلفية! لمنع استبدال البيانات بشكل خاطئ، قمنا بتحميل وتحديث شاشتك بالبيانات الحية المعتمدة حالياً على الخادم.'
                : 'The item you tried to modify was already updated by another operator in the background! To prevent overwriting live operational data, we have safely loaded and synced your dashboard with the authoritative server state.'}
            </p>

            {conflictDetails.conflicts && conflictDetails.conflicts.length > 0 && (
              <div className="bg-white/5 border border-white/8 rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                  {language === 'ar' ? 'العناصر المتأثرة بعملية التعارض:' : 'CONFLICTED ENTITIES DURING TRANSACTION:'}
                </span>
                {conflictDetails.conflicts.map((item: any, idx: number) => (
                  <div key={idx} className="flex flex-col gap-1 text-[11px] border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{item.title}</span>
                      <span className="text-[9px] bg-zinc-800 text-amber-400 px-1.5 py-0.5 rounded font-mono uppercase">
                        {item.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>
                        {language === 'ar' ? 'محجوز/رقم إصدار الخادم:' : 'Server version:'} <strong className="text-zinc-300">{item.serverVersion}</strong>
                      </span>
                      <span>
                        {language === 'ar' ? 'رقم إصدارك:' : 'Your version:'} <strong className="text-zinc-400">{item.clientVersion || 0}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setConflictDetails(null)}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 text-xs font-bold transition-all shadow-lg shadow-orange-550/20 shrink-0 cursor-pointer"
                id="resolve-conflict-btn"
              >
                {language === 'ar' ? 'موافق، مزامنة شاشتي الآن' : 'Acknowledge & Sync Screen'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
