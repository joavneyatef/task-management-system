import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw, Download, FileJson, FileSpreadsheet, AlertCircle, ChevronDown } from 'lucide-react';
import { User, Department } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { isGeneralManager, getDescendantIds } from '../utils/permissions';

interface AuditLogProps {
  currentUser: User;
  users: User[];
  departments: Department[];
}

interface AuditEntry {
  id: string;
  entityType: 'Task' | 'Complaint' | 'Checklist';
  entityId: string;
  entityTitle: string;
  action: string;
  userId: string;
  userName: string;
  departmentId: string;
  department: string;
  timestamp: string;
  details: string;
}

const ENTITY_COLORS: Record<string, string> = {
  Task: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
  Complaint: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  Checklist: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
};

export default function AuditLog({ currentUser, users, departments }: AuditLogProps) {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [entityFilter, setEntityFilter] = useState<'All' | 'Task' | 'Complaint' | 'Checklist'>('All');
  // Directors and Managers only ever audit their own reporting chain, so
  // their department filter is locked to their own department from the
  // start — they never see the "All Departments" option.
  const isGM = isGeneralManager(currentUser);
  const [deptFilter, setDeptFilter] = useState(isGM ? 'All' : (currentUser.departmentId || 'All'));
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const userPanelRef = useRef<HTMLDivElement>(null);

  // Directors/Managers can only audit themselves and everyone below them in
  // the reporting chain (a Director sees their whole department; a Manager
  // sees only their direct reports) — never the rest of the company.
  const myScope = useMemo(() => {
    if (isGM) return null;
    const descendantIds = new Set(getDescendantIds(currentUser.id, users));
    return users.filter(u => u.id === currentUser.id || descendantIds.has(u.id));
  }, [isGM, currentUser.id, users]);

  // Users scoped to the currently selected department. Restricted to
  // Directors, Managers and Assistants per department, as requested — and,
  // for non-GM viewers, further restricted to their own reporting chain
  // regardless of the department dropdown.
  const departmentScopedUsers = useMemo(() => {
    if (!isGM) return myScope || [];
    if (deptFilter === 'All') return users;
    return users.filter(u => u.departmentId === deptFilter && ['Director', 'Manager', 'Assistant'].includes(u.role));
  }, [users, deptFilter, isGM, myScope]);

  // Whenever the department changes, reset the user selection so it always
  // reflects users that actually belong to the newly selected department.
  useEffect(() => {
    setSelectedUserIds([]);
  }, [deptFilter]);

  // Close the "All Users" panel when clicking outside both the trigger
  // button and the panel itself
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const clickedTrigger = userDropdownRef.current && userDropdownRef.current.contains(target);
      const clickedPanel = userPanelRef.current && userPanelRef.current.contains(target);
      if (!clickedTrigger && !clickedPanel) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const allDeptUsersSelected = departmentScopedUsers.length > 0 && selectedUserIds.length === departmentScopedUsers.length;

  const toggleSelectAllUsers = () => {
    setSelectedUserIds(allDeptUsersSelected ? [] : departmentScopedUsers.map(u => u.id));
  };

  const userFilterLabel = selectedUserIds.length === 0
    ? (isAr ? 'كل المستخدمين' : 'All Users')
    : selectedUserIds.length === 1
      ? (users.find(u => u.id === selectedUserIds[0])?.name || (isAr ? 'مستخدم واحد' : '1 User'))
      : (isAr ? `${selectedUserIds.length} مستخدمين` : `${selectedUserIds.length} Users Selected`);

  const buildParams = (format: string) => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (entityFilter !== 'All') params.set('entityType', entityFilter);
    if (deptFilter !== 'All') params.set('departmentId', deptFilter);
    if (selectedUserIds.length > 0) params.set('userIds', selectedUserIds.join(','));
    if (startDate) params.set('startDate', new Date(startDate).toISOString());
    if (endDate) {
      // "To" date should be inclusive of the whole day, not just its
      // midnight instant — otherwise any entry timestamped later that
      // same day (e.g. 08:00) gets excluded from the range.
      const inclusiveEnd = new Date(endDate);
      inclusiveEnd.setHours(23, 59, 59, 999);
      params.set('endDate', inclusiveEnd.toISOString());
    }
    return params;
  };

  const loadLog = async () => {
    setLoading(true);
    setError('');
    try {
      const params = buildParams('json');
      const response = await fetch(`/api/audit-log?${params.toString()}`, {
        headers: { 'x-user-id': currentUser.id }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setEntries(data.rows || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  // Report refreshes automatically whenever any filter changes (type,
  // department, users, date range) — there is no separate "Generate
  // Report" action; Export CSV always reflects what's currently filtered.
  useEffect(() => {
    loadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityFilter, deptFilter, selectedUserIds, startDate, endDate]);

  const downloadCsv = async () => {
    try {
      const params = buildParams('csv');
      const response = await fetch(`/api/audit-log?${params.toString()}`, {
        headers: { 'x-user-id': currentUser.id }
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    }
  };

  return (
    <div className="space-y-4 w-full flex-1 flex flex-col min-h-0">
      <div className="rounded-xl border border-white/5 bg-[#0a0a0f]/40 p-5 glass shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <h3 className="font-display font-semibold text-white text-base">
              {isAr ? 'سجل التدقيق — من فعل ماذا ومتى' : 'Audit Log — Who Did What, When'}
            </h3>
          </div>
          <button
            onClick={downloadCsv}
            className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer text-[11px]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> {isAr ? 'تصدير CSV' : 'Export CSV'}
          </button>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          {isAr
            ? 'سجل موحّد لكل الإجراءات على المهام والشكاوى وقوائم الفحص، للمساءلة ومراقبة تنفيذ الأعمال. مصرح للمدراء العامين والمديرين ورؤساء الأقسام فقط، كل حسب فريقه.'
            : "A unified accountability trail across tasks, complaints, and checklists — restricted to the General Manager, Directors, and Managers, each scoped to their own team."}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-start">
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value as any)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40"
          >
            <option value="All">{isAr ? 'كل الأنواع' : 'All Types'}</option>
            <option value="Task">{isAr ? 'مهام' : 'Tasks'}</option>
            <option value="Complaint">{isAr ? 'شكاوى' : 'Complaints'}</option>
            <option value="Checklist">{isAr ? 'قوائم فحص' : 'Checklists'}</option>
          </select>

          {/* Department filter — for the GM this scopes the "All Users" list
              below to the chosen department's Directors/Managers/Assistants.
              Directors and Managers are locked to their own department: they
              can only ever audit their own reporting chain. */}
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            disabled={!isGM}
            title={!isGM ? (isAr ? 'مقصور على قسمك' : 'Locked to your department') : undefined}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGM
              ? [
                  <option key="All" value="All">{isAr ? 'كل الأقسام' : 'All Departments'}</option>,
                  ...departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                ]
              : (() => {
                  const myDept = departments.find(d => d.id === currentUser.departmentId);
                  return myDept ? <option value={myDept.id}>{myDept.name}</option> : null;
                })()}
          </select>

          {/* Users multi-select trigger, scoped to the selected department */}
          <div ref={userDropdownRef}>
            <button
              type="button"
              onClick={() => setUserDropdownOpen(prev => !prev)}
              className="w-full flex items-center justify-between gap-1.5 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40 cursor-pointer"
            >
              <span className="truncate">{userFilterLabel}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Date range: From / To */}
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            title={isAr ? 'من تاريخ' : 'From'}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            title={isAr ? 'إلى تاريخ' : 'To'}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40"
          />
        </div>

        {/* Users multi-select panel — rendered inline (not as a floating overlay)
            so the full list is always visible and never gets clipped by the
            page's scrollable containers; it simply expands the card. */}
        {userDropdownOpen && (
          <div className="mt-3 border border-white/10 rounded-lg bg-black/20 p-3" ref={userPanelRef}>
            <label className="flex items-center gap-2 pb-2 mb-2 border-b border-white/5 text-xs text-white font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={allDeptUsersSelected}
                onChange={toggleSelectAllUsers}
                className="accent-amber-500"
              />
              {isAr ? 'تحديد كل المستخدمين' : 'Select All Users'}
              <span className="text-zinc-500 font-normal">({departmentScopedUsers.length})</span>
            </label>

            {departmentScopedUsers.length === 0 ? (
              <p className="text-[11px] text-zinc-500 py-1">{isAr ? 'لا يوجد مستخدمون في هذا القسم' : 'No users in this department'}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 max-h-64 overflow-y-auto pr-1">
                {departmentScopedUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-xs text-zinc-200 hover:bg-white/5 rounded px-1.5 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleUserSelection(u.id)}
                      className="accent-amber-500 shrink-0"
                    />
                    <span className="truncate">{u.name} <span className="text-zinc-500">({u.role})</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-xl border border-white/5 bg-[#0a0a0f]/40 glass flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-zinc-400 text-xs p-8">
            <RefreshCw className="h-4 w-4 animate-spin" /> {isAr ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-zinc-500 text-xs p-8">{isAr ? 'لا توجد سجلات مطابقة' : 'No matching entries'}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-[#0a0a0f] border-b border-white/5">
              <tr className="text-left text-zinc-500 uppercase text-[10px] font-mono tracking-wider">
                <th className="px-4 py-2.5">{isAr ? 'الوقت' : 'Timestamp'}</th>
                <th className="px-4 py-2.5">{isAr ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-2.5">{isAr ? 'العنصر' : 'Item'}</th>
                <th className="px-4 py-2.5">{isAr ? 'الإجراء' : 'Action'}</th>
                <th className="px-4 py-2.5">{isAr ? 'بواسطة' : 'By'}</th>
                <th className="px-4 py-2.5">{isAr ? 'القسم' : 'Department'}</th>
                <th className="px-4 py-2.5">{isAr ? 'تفاصيل' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 text-zinc-400 font-mono whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${ENTITY_COLORS[entry.entityType]}`}>
                      {entry.entityType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white font-medium max-w-[220px] truncate">{entry.entityTitle}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{entry.action}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{entry.userName}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{entry.department || '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-500 max-w-[260px] truncate">{entry.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
