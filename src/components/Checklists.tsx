import React, { useState } from 'react';
import { Checklist, User, ChecklistItem, ChecklistHistory, Department } from '../types';
import { CheckSquare, Square, AlertTriangle, ShieldCheck, UserCheck, CalendarDays, RefreshCw, Layers, Trash2, Building2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { isGeneralManager, isManager, canAuthorChecklist, canSignChecklistItems } from '../utils/permissions';

interface ChecklistsProps {
  checklists: Checklist[];
  checklistHistory?: ChecklistHistory[];
  users: User[];
  currentUser: User;
  departments: Department[];
  onUpdateChecklists: (checklists: Checklist[]) => void;
  onLogHistory: (history: ChecklistHistory) => void;
  onAddNotification: (title: string, message: string, category: 'Checklist' | 'Alert', recipientRole?: 'Manager' | 'Coordinator') => void;
  activeLocks?: { [itemId: string]: any };
  onLockItem?: (itemId: string) => void;
  onUnlockItem?: (itemId: string) => void;
  initialChecklistId?: string;
}

export default function Checklists({
  checklists,
  checklistHistory = [],
  users,
  currentUser,
  departments,
  onUpdateChecklists,
  onLogHistory,
  onAddNotification,
  activeLocks = {},
  onLockItem,
  onUnlockItem,
  initialChecklistId
}: ChecklistsProps) {
  const [activeTab, setActiveTab] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const { language, t, isRtl } = useLanguage();
  const [newItemText, setNewItemText] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const focusedChecklistRef = React.useRef<string | null>(null);
  // Departments we have already auto-provisioned the fixed Daily/Weekly/Monthly
  // skeleton for this session. Guards against re-firing the provisioning sync in
  // a tight loop if a save round-trips without the new rows for any reason.
  const provisionedDeptsRef = React.useRef<Set<string>>(new Set());

  // GM / Director own the checklist (add & remove items, file the log).
  const canManageChecklist = canAuthorChecklist(currentUser);
  // Everyone but a plain Manager can sign items; a Manager's view is read-only.
  const canSignItems = canSignChecklistItems(currentUser);
  const isInspectorOnly = isManager(currentUser);

  // The General Manager (role: 'GeneralManager', e.g. Mr. Hany) can browse the
  // fixed checklist of every department.
  const isTopAdmin = isGeneralManager(currentUser);

  // Which department's checklist is currently in view.
  // Regular staff are locked to their own department; Mr. Hany can switch between all of them.
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    currentUser.departmentId || departments[0]?.id || ''
  );

  const viewDeptId = isTopAdmin ? (selectedDeptId || departments[0]?.id || '') : (currentUser.departmentId || departments[0]?.id || '');
  const viewDepartment = departments.find(d => d.id === viewDeptId);

  React.useEffect(() => {
    if (initialChecklistId && initialChecklistId !== focusedChecklistRef.current) {
      const target = checklists.find(c => c.id === initialChecklistId);
      if (!target) return;
      focusedChecklistRef.current = initialChecklistId;
      setActiveTab(target.type);
      if (isTopAdmin && target.departmentId) setSelectedDeptId(target.departmentId);
    }
    if (!initialChecklistId) focusedChecklistRef.current = null;
  }, [initialChecklistId, checklists, isTopAdmin]);

  React.useEffect(() => {
    if (!viewDeptId) return;
    // A Manager only inspects — they never write checklists, so they never
    // bootstrap the skeleton either (the server would freeze that sync anyway).
    if (!canSignItems) return;
    if (provisionedDeptsRef.current.has(viewDeptId)) return;
    const existingTypes = new Set(checklists.filter(c => c.departmentId === viewDeptId).map(c => c.type));
    const missingTypes = (['Daily', 'Weekly', 'Monthly'] as const).filter(t => !existingTypes.has(t));
    if (missingTypes.length > 0) {
      provisionedDeptsRef.current.add(viewDeptId);
      const dept = departments.find(d => d.id === viewDeptId);
      const deptName = dept?.name || viewDeptId.toUpperCase();
      const newChecklists: Checklist[] = missingTypes.map(type => ({
        id: `chk-${type.toLowerCase()}-${viewDeptId}`,
        type,
        title: language === 'ar' ? `فحص ${type === 'Daily' ? 'اليومي' : type === 'Weekly' ? 'الأسبوعي' : 'الشهري'} - ${deptName}` : `${type} Inspection - ${deptName}`,
        description: language === 'ar' ? `قائمة الفحص الـ ${type === 'Daily' ? 'اليومية' : type === 'Weekly' ? 'الأسبوعية' : 'الشهرية'} الثابتة لقسم ${deptName}.` : `Fixed ${type.toLowerCase()} checklist for ${deptName}.`,
        departmentId: viewDeptId,
        assignedToId: null,
        items: [],
        version: 1,
        updatedAt: new Date().toISOString()
      }));
      onUpdateChecklists([...checklists, ...newChecklists]);
    }
  }, [viewDeptId, checklists, departments, language]);

  // Add checklist item handler
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageChecklist) return;
    if (!newItemText.trim() || !activeChecklist) return;

    const newItem: ChecklistItem = {
      id: `chk-item-${Date.now()}-${Math.random()}`,
      text: newItemText.trim(),
      completed: false
    };

    const updatedChecklist = {
      ...activeChecklist,
      items: [...activeChecklist.items, newItem]
    };

    const updatedChecklists = checklists.map(chk => 
      chk.id === activeChecklist.id ? updatedChecklist : chk
    );

    onUpdateChecklists(updatedChecklists);
    setNewItemText('');
    
    onAddNotification(
      language === 'ar' ? 'تمت إضافة بند فحص جديد' : 'New Checklist Item Added',
      language === 'ar' 
        ? `قام ${currentUser.name} بإضافة البند "${newItemText.trim()}" إلى الفحص الـ ${activeTab === 'Daily' ? 'اليومي' : activeTab === 'Weekly' ? 'الأسبوعي' : 'الشهري'}.`
        : `${currentUser.name} added item "${newItemText.trim()}" to the ${activeTab} checklist.`,
      'Checklist',
      currentUser.role !== 'Manager' ? 'Manager' : undefined
    );
  };

  // Delete checklist item handler
  const handleDeleteItem = (itemId: string) => {
    if (!canManageChecklist) return;
    if (!activeChecklist) return;

    const updatedItems = activeChecklist.items.filter(item => item.id !== itemId);

    const updatedChecklists = checklists.map(chk => {
      if (chk.id === activeChecklist.id) {
        return {
          ...chk,
          items: updatedItems
        };
      }
      return chk;
    });

    onUpdateChecklists(updatedChecklists);

    onAddNotification(
      language === 'ar' ? 'تم حذف بند فحص' : 'Checklist Item Deleted',
      language === 'ar' 
        ? `قام ${currentUser.name} بحذف بند فحص من القائمة.`
        : `${currentUser.name} deleted a checklist item from the list.`,
      'Checklist',
      currentUser.role !== 'Manager' ? 'Manager' : undefined
    );
  };


  // Find the active checklist for the tab, scoped to the department currently in view
  const activeChecklist = checklists.find(c => c.type === activeTab && c.departmentId === viewDeptId);

  // Determine items to display based on history date selection
  let displayItems: ChecklistItem[] = [];
  let isDisplayingHistory = false;
  let historyCompletedCount = 0;
  let historyTotalCount = 0;

  if (selectedDate && activeChecklist) {
    const matchedHistory = checklistHistory.find(
      h => h.date === selectedDate && h.type === activeTab
    );
    if (matchedHistory) {
      isDisplayingHistory = true;
      historyCompletedCount = matchedHistory.itemsCompleted;
      historyTotalCount = matchedHistory.itemsAttempted;
      
      if (matchedHistory.items && matchedHistory.items.length > 0) {
        displayItems = matchedHistory.items;
      } else {
        // Fallback for legacy history entries (populate with simulated items based on completed count to prevent blank displays)
        const baseItems = activeChecklist.items;
        displayItems = baseItems.map((item, idx) => {
          const isCompleted = idx < matchedHistory.itemsCompleted;
          return {
            ...item,
            completed: isCompleted,
            completedAt: isCompleted ? matchedHistory.timestamp : undefined,
            completedBy: isCompleted ? matchedHistory.completedBy : undefined,
            note: isCompleted ? (language === 'ar' ? 'سجل مؤرشف مسبقاً' : 'Archived session log') : undefined
          };
        });
      }
    }
  } else if (activeChecklist) {
    displayItems = activeChecklist.items;
  }

  // Toggle item checking
  const handleToggleItem = (itemId: string, noteText?: string) => {
    if (!activeChecklist) return;

    // A Manager only inspects the checklist — signing is done by the department
    // technicians (or the Director / GM).
    if (!canSignItems) {
      alert(language === 'ar'
        ? 'وضع الفحص للقراءة فقط. توقيع بنود الفحص يقوم به فنيو القسم.'
        : 'Inspection view is read-only — checklist items are signed off by the department technicians.');
      return;
    }

    // Check if the current user is permitted (Staff must not be on leave)
    const activeUserRecord = users.find(u => u.id === currentUser.id);
    if (activeUserRecord && activeUserRecord.status === 'On Leave') {
      alert(language === 'ar' 
        ? 'أنت مسجل حالياً في حالة إجازة. لا يمكن للموظفين المشارقة بحالة إجازة التوقيع على تقارير العمليات التشغيلية.' 
        : 'You are currently status On Leave. Personnel flagged as on leave cannot sign operational logs.');
      return;
    }

    const itemToToggle = activeChecklist.items.find(i => i.id === itemId);
    if (itemToToggle && itemToToggle.completed) {
      alert(language === 'ar'
        ? 'عذراً، بمجرد إتمام واعتماد بند الفحص لا يمكن التراجع أو إلغاء اكتماله.'
        : 'Sorry, once a checklist item is completed and certified, it cannot be reverted to incomplete.');
      return;
    }

    if (itemToToggle) {
      const itemText = itemToToggle.text;
      onAddNotification(
        language === 'ar' ? 'بند فحص مكتمل' : 'Checklist Item Verified',
        language === 'ar'
          ? `أتم الفني "${currentUser.name}" بند الفحص: "${itemText}" في الفحص الـ ${activeTab === 'Daily' ? 'اليومي' : activeTab === 'Weekly' ? 'الأسبوعي' : 'الشهري'}${noteText?.trim() ? ` (ملاحظة: "${noteText.trim()}")` : ''}.`
          : `Technician "${currentUser.name}" completed item: "${itemText}" in the ${activeTab} checklist${noteText?.trim() ? ` (Note: "${noteText.trim()}")` : ''}.`,
        'Checklist',
        'Manager'
      );
    }

    const updatedItems = activeChecklist.items.map(item => {
      if (item.id === itemId) {
        const isNowCompleted = true; // Once completed, it cannot be reverted
        return {
          ...item,
          completed: isNowCompleted,
          completedAt: isNowCompleted ? new Date().toISOString() : undefined,
          completedBy: isNowCompleted ? currentUser.id : undefined,
          note: isNowCompleted ? (noteText?.trim() || undefined) : undefined
        };
      }
      return item;
    });

    const updatedChecklists = checklists.map(chk => {
      if (chk.id === activeChecklist.id) {
        return {
          ...chk,
          items: updatedItems
        };
      }
      return chk;
    });

    onUpdateChecklists(updatedChecklists);
  };

  // Log complete checklist cycle
  const handleCommitChecklist = () => {
    if (!canSignItems) return; // a Manager only inspects — never files the log
    if (!activeChecklist) return;

    const total = activeChecklist.items.length;
    const completed = activeChecklist.items.filter(i => i.completed).length;

    if (completed === 0) {
      alert(language === 'ar' 
        ? 'يجب تأكيد وإنهاء بند فحص واحد على الأقل قبل تسجيل السجل في قاعدة البيانات.' 
        : 'Must complete at least one compliance item before recording log.');
      return;
    }

    const newHistory: ChecklistHistory = {
      date: new Date().toISOString().split('T')[0],
      type: activeChecklist.type,
      itemsAttempted: total,
      itemsCompleted: completed,
      completedBy: currentUser.id,
      timestamp: new Date().toISOString(),
      items: JSON.parse(JSON.stringify(activeChecklist.items))
    };

    onLogHistory(newHistory);

    // If partial completion, warn about missed items!
    if (completed < total) {
      const missedCount = total - completed;
      onAddNotification(
        language === 'ar' ? 'فجوة في الامتثال: إنذار فحص مفقود' : 'Compliance Gap Missed Checklist Alert',
        language === 'ar' 
          ? `تم حفظ فحص ${activeChecklist.type} مع بقاء ${missedCount} بنداً دون تحقق. تم رفع الحالة لمراجعة الإدارة.` 
          : `${activeChecklist.type} checklist logged with ${missedCount} unverified items. Inspection flagged for review.`,
        'Alert',
        currentUser.role !== 'Manager' ? 'Manager' : undefined
      );
    } else {
      onAddNotification(
        language === 'ar' ? 'تم تدقيق الفحص دورياً بالكامل' : 'Checklist Fully Audited',
        language === 'ar' 
          ? `تم التحقق بنجاح من جميع البنود في فحص ${activeChecklist.type} بواسطة ${currentUser.name}.` 
          : `All items in ${activeChecklist.type} Checklist verified by ${currentUser.name}. Server telemetry metrics nominal.`,
        'Checklist',
        currentUser.role !== 'Manager' ? 'Manager' : undefined
      );
    }

    // Reset items for next rotation simulation
    const resetItems = activeChecklist.items.map(item => ({
      ...item,
      completed: false,
      completedAt: undefined,
      completedBy: undefined
    }));

    const updated = checklists.map(c => {
      if (c.id === activeChecklist.id) {
        return { ...c, items: resetItems };
      }
      return c;
    });

    onUpdateChecklists(updated);
    alert(language === 'ar' 
      ? 'تم تقديم واعتماد تقرير فحص الخدمة وأرشفته في السجلات. تمت إعادة تعيين الواجهة للدورة المجدولة القادمة.' 
      : 'Checklist audit submitted and archived. Telemetry indicators reset for the next scheduled cycle.');
  };

  // Simulate missed checklist rotation warning
  const triggerSimulateMissedAlert = () => {
    if (!activeChecklist) return;
    const pendingItemsCount = activeChecklist.items.filter(i => !i.completed).length;
    
    onAddNotification(
      language === 'ar' ? 'خطأ في النظام: إنذار تجاوز موعد الفحص المجدول' : 'System Fault: Checklist Missed Deadline Alert',
      language === 'ar' 
        ? `دورة الفحص المجدولة لـ ${activeChecklist.type} انتهت مع بقاء ${pendingItemsCount} بنود دون استجابة تشغيلية فنية.` 
        : `The scheduled ${activeChecklist.type} check cycle reached deadline with ${pendingItemsCount} unresolved interfaces. Priority escalation active.`,
      'Alert',
      currentUser.role !== 'Manager' ? 'Manager' : undefined
    );
    alert(language === 'ar' 
      ? 'تم إطلاق مهمة جدولة مستويات الخدمة بنجاح! تم توزيع تنبيه الموعد الفائت على القنوات الفنية فوراً.' 
      : 'Automatic SLA Schedule daemon triggered! Missed checklist notifications has been broadcasted to Slack/Telegram.');
  };

  const completedCount = isDisplayingHistory
    ? historyCompletedCount
    : (activeChecklist?.items.filter(i => i.completed).length || 0);
  const totalCount = isDisplayingHistory
    ? historyTotalCount
    : (activeChecklist?.items.length || 0);
  const completionRatio = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Per-department progress on the currently selected checklist type (Daily /
  // Weekly / Monthly). Computed live from the checklist items — e.g. IT 2/5.
  const departmentProgress = React.useMemo(() => {
    return departments.map(dept => {
      const items = checklists
        .filter(c => c.departmentId === dept.id && c.type === activeTab)
        .flatMap(c => c.items || []);
      const total = items.length;
      const done = items.filter(i => i.completed).length;
      return {
        id: dept.id,
        name: dept.name,
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });
  }, [departments, checklists, activeTab]);

  const availableCoordinators = users.filter(
    u => u.role === 'Coordinator' && u.status === 'Active' && (!viewDeptId || u.departmentId === viewDeptId)
  );

  return (
    <div className="space-y-6">
      
      {/* Configuration Header info */}
      <div className="border border-white/5 rounded-xl bg-white/2 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 glass">
        <div>
          <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
            {language === 'ar' ? 'قوائم التحقق وعمليات الفحص الدوري' : 'Recurring Operational Controls'}
            {viewDepartment && (
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {viewDepartment.name}
              </span>
            )}
            {isInspectorOnly && (
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                {language === 'ar' ? 'عرض للفحص فقط' : 'Inspection only'}
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-400">
            {language === 'ar' ? 'قائمة فحص يومية/أسبوعية/شهرية ثابتة خاصة بهذا القسم مع توجيه واسناد الموظفين تلقائياً.' : 'A fixed daily/weekly/monthly checklist dedicated to this department, with automated staff routing.'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Department switcher - Mr. Hany only, everyone else is locked to their own department */}
          {isTopAdmin && departments.length > 0 && (
            <select
              value={viewDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-white border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-slate-900 outline-none focus:border-indigo-500/40"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id} className="bg-white text-slate-900">{d.name}</option>
              ))}
            </select>
          )}

          {/* Available technician metrics */}
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <span className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <UserCheck className="h-4 w-4" /> 
              {language === 'ar' ? `المشغلون المتاحون: ${availableCoordinators.length} نشط` : `Available Operators: ${availableCoordinators.length} active`}
            </span>
            {users.some(u => u.status === 'On Leave' && u.departmentId === viewDeptId) && (
              <span className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                {language === 'ar' ? '* تم استبعاد طواقم العمل التي في إجازة حالياً' : '* Staff on leave bypassed during automation'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cross-department progress on the active checklist type (X/Y and %).
          Only the General Manager sees this org-wide roll-up — a Director or
          Manager runs their own department and has no business seeing another
          department's compliance numbers. */}
      {isTopAdmin && departmentProgress.length > 0 && (
        <div className="border border-white/5 rounded-xl bg-white/2 px-4 py-3 glass" data-testid="department-progress">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-2">
            {language === 'ar'
              ? `تقدم الأقسام — فحص ${activeTab === 'Daily' ? 'يومي' : activeTab === 'Weekly' ? 'أسبوعي' : 'شهري'}`
              : `Department Progress — ${activeTab} Checklist`}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {departmentProgress.map(dp => {
              const active = dp.id === viewDeptId;
              const tone = dp.total === 0 ? 'text-zinc-500' : dp.pct === 100 ? 'text-emerald-400' : dp.pct >= 50 ? 'text-sky-400' : 'text-amber-400';
              return (
                <button
                  key={dp.id}
                  type="button"
                  onClick={() => { if (isTopAdmin) setSelectedDeptId(dp.id); }}
                  disabled={!isTopAdmin}
                  aria-label={`${dp.name}: ${dp.done} of ${dp.total} done, ${dp.pct}%`}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    active ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/5 bg-black/20'
                  } ${isTopAdmin ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-200 truncate">{dp.name}</span>
                    <span className={`text-[11px] font-mono font-bold tabular-nums ${tone}`}>
                      {dp.done}/{dp.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        dp.pct === 100 ? 'bg-emerald-400' : dp.pct >= 50 ? 'bg-sky-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${dp.pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-zinc-500 tabular-nums">{dp.pct}%</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!viewDepartment && (
        <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-black/10">
          {language === 'ar'
            ? 'لا يوجد قسم مرتبط بحسابك بعد. يرجى مراجعة مدير النظام لتعيين قسمك من لوحة الإدارة.'
            : 'No department is linked to your account yet. Please ask an administrator to assign your department from the Admin panel.'}
        </div>
      )}

      {/* Checklist Tab bar */}
      <div className="flex border-b border-white/5 pb-px">
        {(['Daily', 'Weekly', 'Monthly'] as const).map(type => {
          const typeName = language === 'ar'
            ? type === 'Daily' ? 'يومي' : type === 'Weekly' ? 'أسبوعي' : 'شهري'
            : type;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-6 py-3 font-semibold font-display text-sm border-b-2 transition-all cursor-pointer ${
                activeTab === type
                  ? 'border-indigo-400 text-indigo-400 bg-indigo-500/5'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {language === 'ar' ? `فحص ${typeName} مجدول` : `${type} Inspection Schedule`}
            </button>
          );
        })}
      </div>

      {activeChecklist ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active Checklist Items Panel */}
          <div className="lg:col-span-2 rounded-xl bg-[#0a0a0f]/50 border border-white/5 p-5 space-y-4 glass">
            
            {/* Completion stats bar */}
            <div className="bg-white/4 p-4 border border-white/5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">
                  {language === 'ar' ? 'نطاق تدقيق الامتثال' : 'Verification Scope'}
                </span>
                <h4 className="font-semibold text-white text-xs">
                  {activeChecklist.title}
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {activeChecklist.description}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[11.5px] font-mono text-zinc-400 font-bold block">
                  {language === 'ar' ? `تم توقيع ${completedCount} من أصل ${totalCount}` : `${completedCount} of ${totalCount} signed`}
                </span>
                <div className="w-32 bg-white/5 h-2 rounded-full overflow-hidden mt-1.5 border border-white/5">
                  <div
                    className="bg-emerald-400 h-full rounded transition-all duration-300"
                    style={{ width: `${completionRatio}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Checklist items list */}
            {canManageChecklist && (
              <form onSubmit={handleAddItem} className="bg-[#111116]/80 p-3.5 border border-dashed border-indigo-500/25 rounded-xl flex items-center gap-2 mb-3">
                <input
                  type="text"
                  required
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? `إضافة بند فحص جديد لقائمة الفحص الـ ${activeTab === 'Daily' ? 'اليومي' : activeTab === 'Weekly' ? 'الأسبوعي' : 'الشهري'}...`
                      : `Add new ${activeTab.toLowerCase()} checklist item...`
                  }
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-650 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1"
                >
                  <span>+</span>
                  <span>{language === 'ar' ? 'إضافة بند' : 'Add Item'}</span>
                </button>
              </form>
            )}

            {selectedDate && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl flex items-center justify-between text-xs animate-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4.5 w-4.5 text-amber-400 shrink-0" />
                  <span>
                    {language === 'ar' 
                      ? `سجل مؤرشف ليوم: ${selectedDate} (${activeTab === 'Daily' ? 'فحص يومي' : activeTab === 'Weekly' ? 'فحص أسبوعي' : 'فحص شهري'})` 
                      : `Archived log for: ${selectedDate} (${activeTab} Inspection)`}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedDate('')}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-white font-bold rounded-lg cursor-pointer transition-all text-[11px]"
                >
                  {language === 'ar' ? 'الرجوع للحالي' : 'Return to Active'}
                </button>
              </div>
            )}

            {selectedDate && displayItems.length === 0 && (
              <div className="text-center py-12 p-6 bg-[#111116]/40 rounded-xl border border-dashed border-white/5 space-y-3">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto animate-bounce" />
                <h5 className="font-bold text-white text-xs">
                  {language === 'ar' ? 'لا يوجد سجل مؤرشف في هذا التاريخ' : 'No Checklist Record Saved'}
                </h5>
                <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                  {language === 'ar' 
                    ? `لا يوجد فحص معتمد في تاريخ ${selectedDate}. يمكنك العودة للفترة النشطة بالضغط على الزر أدناه.` 
                    : `No completed checklists found on ${selectedDate} under this schedule. Check past entries or return below.`}
                </p>
                <button 
                  onClick={() => setSelectedDate('')}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-505 hover:bg-indigo-505 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md"
                >
                  {language === 'ar' ? 'الرجوع للفحص الحالي' : 'Return to Active List'}
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {displayItems.map((item) => {
                const signedUser = users.find(u => u.id === item.completedBy);

                // Quick translate item text if in Arabic
                let itemTextTranslated = item.text;
                if (language === 'ar') {
                  if (item.text.includes("Verify lobby APs")) itemTextTranslated = "التحقق من نقاط وصول الواي فاي في الردهة وصالونات النزلاء";
                  else if (item.text.includes("Check core fiber")) itemTextTranslated = "قياس واختبار الألياف الضوئية الموصلة بـ ISP ونسب فقدان البيانات";
                  else if (item.text.includes("Confirm backup power")) itemTextTranslated = "تأكيد عمل المولد الكهربائي ومزود الطاقة غير المنقطع UPS بالردهة";
                  else if (item.text.includes("Save databases backup")) itemTextTranslated = "تشغيل وحفظ النسخ الاحتياطي لقواعد بيانات نزلاء غرف الفندق";
                  else if (item.text.includes("Audit system core patches")) itemTextTranslated = "مراجعة وترقية الرزم والترقيعات الأمنية الأساسية على خوادم الاتصال";
                  else if (item.text.includes("Clean server racks")) itemTextTranslated = "تنظيف ومراجعة قنوات التبريد بمقصورات الخوادم والاتصالات";
                  else if (item.text.includes("Verify disaster failover")) itemTextTranslated = "معاينة البنية التحتية بالكامل، تفتيش المولدات الاحتياطية، وتدقيق تراخيص البرامج الأساسية.";
                  else if (item.text.includes("Audit license usage compliance")) itemTextTranslated = "مراجعة وجرد تراخيص الأنظمة والبرمجيات المعتمدة للغرف والإدارات";
                  else if (item.text.includes("Inspect HVAC ventilation")) itemTextTranslated = "تفتيش مكيفات تهوية وصمامات التبريد المخصصة لغرف الخوادم المركزية";
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (selectedDate || !canSignItems) return;
                      if (!item.completed) {
                        handleToggleItem(item.id, itemNotes[item.id]);
                      } else {
                        handleToggleItem(item.id);
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 select-none ${
                      item.completed
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-zinc-350 cursor-default'
                        : selectedDate
                        ? 'bg-[#111116]/30 border-white/5 text-zinc-600 opacity-60 cursor-default'
                        : `bg-[#111116]/50 border-white/5 text-zinc-200 ${canSignItems ? 'hover:border-white/10 cursor-pointer' : 'cursor-default'}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3.5 w-full">
                      <div className="flex items-start gap-3.5 flex-1">
                        <div className="shrink-0 mt-0.5 text-zinc-400">
                          {item.completed ? (
                            <CheckSquare className="h-4.5 w-4.5 text-emerald-400" />
                          ) : (
                            <Square className={`h-4.5 w-4.5 ${selectedDate || !canSignItems ? 'text-zinc-700' : 'text-zinc-500 hover:text-indigo-400 transition-colors'}`} />
                          )}
                        </div>

                        <div className="flex-1">
                          <p className={`text-xs ${item.completed ? 'line-through text-zinc-500 font-medium' : ''}`}>{itemTextTranslated}</p>
                          
                          {item.completed && item.completedAt && (
                            <span className="block mt-1 font-mono text-[9px] text-zinc-500">
                              {language === 'ar' ? (
                                <>✓ تم التوقيع بواسطة <strong className="text-emerald-400">{signedUser?.name || 'فني'}</strong> الساعة {new Date(item.completedAt).toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</>
                              ) : (
                                <>✓ Signed by <strong className="text-emerald-400">{signedUser?.name || 'Technician'}</strong> @ {new Date(item.completedAt).toLocaleTimeString([], { timeZone: 'Africa/Cairo' })}</>
                              )}
                            </span>
                          )}

                          {item.note && (
                            <span className="block mt-1 text-[11px] font-sans font-medium text-amber-400 italic">
                              {language === 'ar' ? `📝 الملاحظة: "${item.note}"` : `📝 Note: "${item.note}"`}
                            </span>
                          )}
                        </div>
                      </div>

                      {canManageChecklist && !selectedDate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(item.id);
                          }}
                          className="p-1.5 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 hover:border-red-500/35 text-rose-400 hover:text-rose-300 transition-all text-[10px] uppercase font-bold shrink-0 self-center focus:outline-none cursor-pointer flex items-center gap-1"
                          title={language === 'ar' ? 'حذف البند' : 'Delete Item'}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                        </button>
                      )}
                    </div>

                    {!item.completed && !selectedDate && canSignItems && (
                      <div className="mt-1 flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          placeholder={language === 'ar' ? "أضف ملاحظة فنية اختيارية قبل التوقيع..." : "Add an optional tech note before signing..."}
                          value={itemNotes[item.id] || ''}
                          onChange={(e) => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="flex-1 bg-black/40 border border-white/5 focus:border-indigo-500 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500/40 transition-all font-sans"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cairo Schedule Resets Info & Archive Selector Card */}
          <div className="rounded-xl bg-[#0a0a0f]/50 border border-white/5 p-5 flex flex-col justify-between glass">
            <div className="space-y-4">
              <div className="pb-3 border-b border-white/5">
                <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider block">
                  {language === 'ar' ? 'البوابة الفنية والتدقيق التاريخي' : 'ARCHIVAL & AUDIT TRACEPORT'}
                </span>
                <h4 className="font-display font-semibold text-white mt-1 text-sm">
                  {language === 'ar' ? 'سجل عمليات فندق لونج بيتش' : 'Long Beach Operations History'}
                </h4>
              </div>

              {/* Dynamic Date Picker & Archive Navigator */}
              <div className="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10 space-y-3 text-xs">
                <div className="flex items-center gap-1.5 text-indigo-300 font-bold">
                  <span className="text-sm">📅</span>
                  <span>{language === 'ar' ? 'اختار اليوم للمراجعة الفنية:' : 'Select Day for Technical Review:'}</span>
                </div>

                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                    style={{ colorScheme: 'dark' }}
                    id="checklist-history-datepicker"
                  />
                </div>

                {selectedDate ? (
                  <button
                    onClick={() => setSelectedDate('')}
                    className="w-full py-2 px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-300 hover:text-red-200 rounded-xl font-bold transition-all text-[11px] cursor-pointer"
                  >
                    {language === 'ar' ? '✕ العودة لـ فحص اليوم المباشر' : '✕ Back to Today\'s Active Checklist'}
                  </button>
                ) : (
                  <p className="text-[10.5px] text-zinc-400 leading-normal">
                    {language === 'ar' 
                      ? 'يمكنك فحص سجل وأرشيف أي يوم سابق بالكامل للوقوف على التوقيعات الفنية والملاحظات التشغيلية.' 
                      : 'Load historical checkpoints and check-marks signed by technicians on past operational calendar days.'}
                  </p>
                )}

                {/* Quick select list of completed history days */}
                {checklistHistory.filter(h => h.type === activeTab).length > 0 && (
                  <div className="pt-2.5 border-t border-white/5 mt-2.5 space-y-2">
                    <span className="block text-[10px] text-zinc-500 font-mono uppercase tracking-wider font-bold">
                      {language === 'ar' ? 'السجلات المؤرشفة المتاحة للرجوع:' : 'Available Saved Archives:'}
                    </span>
                    <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {checklistHistory
                        .filter(h => h.type === activeTab)
                        .map((entry, idx) => {
                          const isSelected = selectedDate === entry.date;
                          return (
                            <button
                              key={`${entry.date}-${entry.type}-${idx}`}
                              onClick={() => setSelectedDate(entry.date)}
                              className={`w-full text-left px-3 py-2 text-[10.5px] font-mono rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-500/20 border-indigo-400 text-white font-bold'
                                  : 'bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span>📅 {entry.date}</span>
                              <span className="text-[9.5px] px-1.5 py-0.5 bg-black/40 rounded border border-white/5 text-indigo-300 font-bold">
                                {entry.itemsCompleted}/{entry.itemsAttempted} {language === 'ar' ? 'بند' : 'items'}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Schedules and Operational Rules */}
              <div className="p-3 bg-white/[0.01] rounded-xl border border-white/5 text-[11px] text-zinc-400 space-y-2">
                <span className="block font-mono text-[9px] text-zinc-500 uppercase font-bold tracking-wider">
                  ℹ️ {language === 'ar' ? 'قواعد جدول الفتح التلقائي بالقاهرة' : 'Cairo Auto-Open Regulations'}
                </span>
                <div className="flex justify-between text-zinc-400 text-[10.5px]">
                  <span>{language === 'ar' ? '🌅 الفحص اليومي:' : '🌅 Daily:'}</span>
                  <span className="font-mono text-zinc-400">{language === 'ar' ? 'قبل 12:00 ص' : 'Resets 12:05 AM daily'}</span>
                </div>
                <div className="flex justify-between text-zinc-400 text-[10.5px]">
                  <span>{language === 'ar' ? '📅 الفحص الأسبوعي:' : '📅 Weekly:'}</span>
                  <span className="font-mono text-zinc-400">{language === 'ar' ? 'كل أحد' : 'Every Sunday'}</span>
                </div>
              </div>
            </div>

            {/* Commit actions */}
            <div className="space-y-2 pt-4 border-t border-white/5 mt-4">
              {!selectedDate ? (
                canSignItems ? (
                  <button
                    onClick={handleCommitChecklist}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold p-2.5 text-slate-950 text-xs rounded-xl transition-all font-display cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5"
                  >
                    <span>📥</span>
                    <span>{language === 'ar' ? `حفظ وأرشفة فحص الـ ${activeTab === 'Daily' ? 'اليومي' : activeTab === 'Weekly' ? 'الأسبوعي' : 'الشهري'}` : `File & Archive ${activeTab} Log`}</span>
                  </button>
                ) : (
                  <p className="w-full text-center text-[11px] text-zinc-500 font-mono py-2">
                    {language === 'ar' ? 'وضع الفحص — للقراءة فقط' : 'Inspection view — read-only'}
                  </p>
                )
              ) : (
                <button
                  onClick={() => setSelectedDate('')}
                  className="w-full bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 font-bold p-2.5 text-indigo-200 text-xs rounded-xl transition-all font-display cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🔄</span>
                  <span>{language === 'ar' ? 'العودة لقائمة اليوم النشطة' : 'Return to Active List'}</span>
                </button>
              )}
            </div>
          </div>

        </div>
      ) : (
        <p className="text-xs text-zinc-500 text-center py-6">
          {language === 'ar' ? 'نوع جدول فحص النظام غير متوفر حالياً.' : 'Checklist schedule type unavailable.'}
        </p>
      )}

    </div>
  );
}
