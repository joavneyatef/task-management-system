import React, { useState, useMemo } from 'react';
import {
  MessageSquareWarning,
  Plus,
  X,
  Filter,
  Building2,
  Clock,
  Check,
  User as UserIcon,
  StickyNote,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Complaint, ComplaintStatus, ComplaintPriority, Department, User, ComplaintHistoryEntry } from '../types';
import { canViewComplaint, isGeneralManager } from '../utils/permissions';
import { useLanguage } from '../context/LanguageContext';

interface ComplaintsProps {
  complaints: Complaint[];
  departments: Department[];
  users: User[];
  currentUser: User;
  onUpdateComplaints: (complaints: Complaint[]) => void;
  initialComplaintId?: string;
  onAddNotification: (
    title: string,
    message: string,
    category: 'Task' | 'Checklist' | 'Project' | 'Complaint' | 'Alert' | 'System',
    recipientUserId?: string
  ) => void;
}

const STATUS_ORDER: ComplaintStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed'];

const statusLabelsAr: Record<ComplaintStatus, string> = {
  Open: 'مفتوحة',
  'In Progress': 'قيد التنفيذ',
  Resolved: 'محلولة',
  Closed: 'مغلقة',
};

const priorityLabelsAr: Record<ComplaintPriority, string> = {
  Critical: 'حرجة',
  High: 'عالية',
  Medium: 'متوسطة',
  Low: 'منخفضة',
};

const statusColors: Record<ComplaintStatus, string> = {
  Open: 'bg-rose-500/10 border-rose-500/25 text-rose-400',
  'In Progress': 'bg-amber-500/10 border-amber-500/25 text-amber-400',
  Resolved: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  Closed: 'bg-zinc-500/10 border-zinc-500/25 text-zinc-400',
};

const priorityColors: Record<ComplaintPriority, string> = {
  Critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  High: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Low: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

export default function Complaints({
  complaints,
  departments,
  users,
  currentUser,
  onUpdateComplaints,
  onAddNotification,
  initialComplaintId,
}: ComplaintsProps) {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const visibleComplaints = complaints.filter(c => canViewComplaint(currentUser, c, users));
  const complaintReasons = departments.flatMap(d => (d.complaintReasons || []).map(reason => ({ reason, departmentId: d.id, directorId: d.directorId })));

  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const focusedComplaintRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (initialComplaintId && initialComplaintId !== focusedComplaintRef.current && visibleComplaints.some(c => c.id === initialComplaintId)) {
      focusedComplaintRef.current = initialComplaintId;
      setExpandedId(initialComplaintId);
    }
    if (!initialComplaintId) focusedComplaintRef.current = null;
  }, [initialComplaintId, visibleComplaints]);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newReason, setNewReason] = useState(complaintReasons[0]?.reason || '');
  const [newPriority, setNewPriority] = useState<ComplaintPriority>('Medium');

  const filtered = useMemo(() => {
    return visibleComplaints
      .filter((c) => deptFilter === 'All' || c.departmentId === deptFilter)
      .filter((c) => statusFilter === 'All' || c.status === statusFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [visibleComplaints, deptFilter, statusFilter]);

  const overdueCount = visibleComplaints.filter(
    (c) => c.status !== 'Resolved' && c.status !== 'Closed' &&
      (Date.now() - new Date(c.createdAt).getTime()) > 24 * 60 * 60 * 1000
  ).length;

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || id;
  const getUserName = (id?: string | null) => (id ? users.find((u) => u.id === id)?.name || id : null);

  const pushHistory = (complaint: Complaint, entry: Omit<ComplaintHistoryEntry, 'id' | 'userId' | 'userName' | 'timestamp'>): ComplaintHistoryEntry[] => {
    const newEntry: ComplaintHistoryEntry = {
      id: `ch-${Date.now()}-${Math.random()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    return [...(complaint.history || []), newEntry];
  };

  const handleCreateComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    const route = complaintReasons.find(r => r.reason === newReason);
    if (!newTitle.trim() || !route?.departmentId || !route.directorId) return;

    const newComplaint: Complaint = {
      id: `complaint-${Date.now()}`,
      title: newTitle.trim(),
      description: newDescription.trim(),
      source: 'Exclusivi',
      departmentId: route.departmentId,
      assignedToId: route.directorId,
      createdBy: currentUser.id,
      status: 'Open',
      priority: newPriority,
      createdAt: new Date().toISOString(),
      history: [
        {
          id: `ch-${Date.now()}`,
          type: 'create',
          userId: currentUser.id,
          userName: currentUser.name,
          timestamp: new Date().toISOString(),
          details: isAr ? 'تم استلام الشكوى من Exclusivi وتسجيلها في النظام.' : 'Complaint received from Exclusivi and logged into the system.',
        },
      ],
      version: 1,
    };

    onUpdateComplaints([newComplaint, ...complaints]);

    onAddNotification(
      isAr ? 'شكوى جديدة من Exclusivi' : 'New Exclusivi Complaint',
      isAr
        ? `تم تسجيل شكوى جديدة "${newComplaint.title}" وإحالتها مباشرة إلى المدير المختص فقط.`
        : `A new complaint "${newComplaint.title}" was routed only to the responsible Director.`,
      'Complaint',
      route.directorId
    );

    setNewTitle('');
    setNewDescription('');
    setNewReason(complaintReasons[0]?.reason || '');
    setNewPriority('Medium');
    setShowCreateModal(false);
  };

  const updateComplaint = (id: string, updater: (c: Complaint) => Complaint) => {
    onUpdateComplaints(complaints.map((c) => (c.id === id ? updater(c) : c)));
  };

  const handleAssign = (complaint: Complaint, userId: string) => {
    updateComplaint(complaint.id, (c) => ({
      ...c,
      assignedToId: userId || null,
      status: c.status === 'Open' ? 'In Progress' : c.status,
      updatedAt: new Date().toISOString(),
      history: pushHistory(c, {
        type: 'assign',
        details: userId
          ? (isAr ? `تم إسناد الشكوى إلى ${getUserName(userId)}.` : `Complaint assigned to ${getUserName(userId)}.`)
          : (isAr ? 'تم إلغاء إسناد الشكوى.' : 'Complaint unassigned.'),
      }),
    }));
  };

  const handleStatusChange = (complaint: Complaint, status: ComplaintStatus) => {
    updateComplaint(complaint.id, (c) => ({
      ...c,
      status,
      resolvedAt: status === 'Resolved' || status === 'Closed' ? new Date().toISOString() : c.resolvedAt,
      updatedAt: new Date().toISOString(),
      history: pushHistory(c, {
        type: status === 'Resolved' ? 'resolve' : status === 'Closed' ? 'close' : 'update',
        details: isAr ? `تم تغيير الحالة إلى: ${status}` : `Status changed to: ${status}`,
      }),
    }));

    if (status === 'Resolved') {
      onAddNotification(
        isAr ? 'تم حل شكوى' : 'Complaint Resolved',
        isAr ? `تم حل شكوى "${complaint.title}" بواسطة ${currentUser.name}.` : `Complaint "${complaint.title}" was resolved by ${currentUser.name}.`,
        'Complaint'
      );
    }
  };

  const handleAddNote = (complaint: Complaint) => {
    if (!noteDraft.trim()) return;
    updateComplaint(complaint.id, (c) => ({
      ...c,
      updatedAt: new Date().toISOString(),
      history: pushHistory(c, { type: 'note', details: noteDraft.trim() }),
    }));
    setNoteDraft('');
  };

  const handleDelete = (id: string) => {
    onUpdateComplaints(complaints.filter((c) => c.id !== id));
  };

  const canCreate = true;

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <MessageSquareWarning className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'شكاوى Exclusivi' : 'Exclusivi Complaints'}
            </h2>
            <p className="text-[11px] text-zinc-500">
              {isAr ? 'تتبع الشكاوى الواردة وإحالتها للأقسام المختصة' : 'Track incoming complaints and route them to the right department'}
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'تسجيل شكوى جديدة' : 'Log New Complaint'}</span>
          </button>
        )}
      </div>

      {overdueCount > 0 && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2.5 text-xs text-rose-300 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {isAr
              ? `يوجد ${overdueCount} شكوى بدون حل منذ أكثر من ٢٤ ساعة.`
              : `${overdueCount} complaint(s) unresolved for more than 24 hours.`}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Filter className="h-3.5 w-3.5 text-zinc-500" />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="bg-white border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
        >
          <option value="All" className="bg-white text-slate-900">{isAr ? 'كل الأقسام' : 'All Departments'}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id} className="bg-white text-slate-900">{d.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
        >
          <option value="All" className="bg-white text-slate-900">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-white text-slate-900">{isAr ? statusLabelsAr[s] : s}</option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-600 font-mono ml-auto">
          {filtered.length} {isAr ? 'نتيجة' : 'results'}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-zinc-500 text-xs border border-white/5 rounded-2xl bg-black/10">
            {isAr ? 'لا توجد شكاوى مطابقة للفلاتر الحالية.' : 'No complaints match the current filters.'}
          </div>
        )}

        {filtered.map((c) => {
          const dept = departments.find((d) => d.id === c.departmentId);
          const deptUsers = users.filter((u) => u.departmentId === c.departmentId);
          const isExpanded = expandedId === c.id;
          const canManage = isGeneralManager(currentUser) || c.assignedToId === currentUser.id;
          const canUpdateStatus = canManage;

          return (
            <div key={c.id} className="border border-white/5 bg-[#0b0c10]/60 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 text-left cursor-pointer hover:bg-white/2 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{c.title}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${priorityColors[c.priority]}`}>
                      {isAr ? priorityLabelsAr[c.priority] : c.priority}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusColors[c.status]}`}>
                      {isAr ? statusLabelsAr[c.status] : c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500 flex-wrap">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{dept?.name || c.departmentId}</span>
                    {c.assignedToId && (
                      <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{getUserName(c.assignedToId)}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(c.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3 animate-in fade-in duration-150">
                  {c.description && <p className="text-xs text-zinc-300 leading-relaxed">{c.description}</p>}

                  <div className="flex flex-wrap gap-3">
                    {canManage && (
                      <div>
                        <span className="block text-[9px] text-zinc-500 font-mono uppercase mb-1">{isAr ? 'إسناد إلى' : 'Assign to'}</span>
                        <select
                          value={c.assignedToId || ''}
                          onChange={(e) => handleAssign(c, e.target.value)}
                          className="bg-white border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 outline-none"
                        >
                          <option value="" className="bg-white text-slate-900">{isAr ? 'غير مسند' : 'Unassigned'}</option>
                          {deptUsers.map((u) => (
                            <option key={u.id} value={u.id} className="bg-white text-slate-900">{u.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {canUpdateStatus && (
                      <div>
                        <span className="block text-[9px] text-zinc-500 font-mono uppercase mb-1">{isAr ? 'الحالة' : 'Status'}</span>
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c, e.target.value as ComplaintStatus)}
                          className="bg-white border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 outline-none"
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s} className="bg-white text-slate-900">{s}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {canManage && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="self-end flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 px-2 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    )}
                  </div>

                  {/* History log */}
                  {c.history && c.history.length > 0 && (
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1.5 max-h-40 overflow-y-auto">
                      {c.history.slice().reverse().map((h) => (
                        <div key={h.id} className="text-[10px] text-zinc-400 flex items-start gap-1.5">
                          <span className="text-zinc-600 shrink-0">{new Date(h.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>
                          <span>— {h.userName}: {h.details}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add note */}
                  {(canManage || c.assignedToId === currentUser.id) && (
                    <div className="flex items-center gap-2">
                      <input
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={isAr ? 'أضف ملاحظة عن الإجراء المتخذ...' : 'Add a note about the action taken...'}
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white outline-none"
                      />
                      <button
                        onClick={() => handleAddNote(c)}
                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateComplaint}
            className="bg-zinc-950 border border-white/10 max-w-lg w-full rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{isAr ? 'تسجيل شكوى جديدة من Exclusivi' : 'Log a New Exclusivi Complaint'}</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-zinc-400 text-xs font-bold mb-1.5">{isAr ? 'عنوان الشكوى *' : 'Complaint Title *'}</label>
              <input
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-[#111116]/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-xs font-bold mb-1.5">{isAr ? 'تفاصيل الشكوى' : 'Details'}</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full bg-[#111116]/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 text-xs font-bold mb-1.5">{isAr ? 'سبب الشكوى *' : 'Complaint Reason *'}</label>
                <select required value={newReason} onChange={(e) => setNewReason(e.target.value)} className="w-full bg-white border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500/50">
                  <option value="" disabled className="bg-white text-slate-900">{isAr ? 'اختر السبب' : 'Select reason'}</option>
                  {complaintReasons.map(r => <option key={r.reason} value={r.reason}>{r.reason}</option>)}
                </select>
                <p className="text-[9px] text-zinc-500 mt-1">{isAr ? 'التوجيه تلقائي وسري للـ Director المختص فقط.' : 'Private automatic routing to the responsible Director only.'}</p>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-bold mb-1.5">{isAr ? 'الأولوية' : 'Priority'}</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as ComplaintPriority)}
                  className="w-full bg-white border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500/50"
                >
                  <option value="Low" className="bg-white text-slate-900">{isAr ? priorityLabelsAr.Low : 'Low'}</option>
                  <option value="Medium" className="bg-white text-slate-900">{isAr ? priorityLabelsAr.Medium : 'Medium'}</option>
                  <option value="High" className="bg-white text-slate-900">{isAr ? priorityLabelsAr.High : 'High'}</option>
                  <option value="Critical" className="bg-white text-slate-900">{isAr ? priorityLabelsAr.Critical : 'Critical'}</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!newReason}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              {isAr ? 'تسجيل الشكوى' : 'Log Complaint'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
