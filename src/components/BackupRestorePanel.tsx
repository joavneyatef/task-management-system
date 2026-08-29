import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { hasManagerAccess } from '../utils/permissions';
import { 
  Database, 
  Download, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  History, 
  RefreshCcw, 
  FileJson, 
  Loader2,
  Lock
} from 'lucide-react';

interface Backup {
  id: string;
  filename: string;
  date: string;
  time: string;
  timestamp: string;
  version: string;
  size: number;
  createdBy: string;
  type: 'Manual' | 'Auto-Before-Deploy' | 'Rollback Prevention Sync' | string;
  isTestEnv: boolean;
}

interface BackupRestorePanelProps {
  currentUser: User;
  serverEnv: 'production' | 'test';
  onEnvironmentChanged: (env: 'production' | 'test', updatedState: any) => void;
  onRefreshAppState: () => void;
  onAddNotification: (title: string, message: string, category: 'Task' | 'Checklist' | 'Project' | 'Alert' | 'System') => void;
}

export default function BackupRestorePanel({
  currentUser,
  serverEnv,
  onEnvironmentChanged,
  onRefreshAppState,
  onAddNotification
}: BackupRestorePanelProps) {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // 'create', 'restore-{filename}', 'restore-test-{filename}'
  
  // Notifications State
  const [localStatus, setLocalStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Restore Confirmation Dialog
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<Backup | null>(null);
  const [confirmRestoreType, setConfirmRestoreType] = useState<'production' | 'test' | null>(null);

  // Upload state
  const [uploadLoading, setUploadLoading] = useState(false);

  const handleUploadBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setLocalStatus({
        type: 'error',
        message: isAr
          ? 'خطأ: حجم ملف النسخة الاحتياطية أكبر من 10 ميجابايت!'
          : 'Error: Backup file size exceeds 10MB limit.'
      });
      return;
    }

    setUploadLoading(true);
    setLocalStatus(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        let parsed;
        try {
          parsed = JSON.parse(fileContent);
        } catch (jsonErr) {
          throw new Error(isAr ? 'الملف ليس بتنسيق JSON صحيح!' : 'File is not a valid JSON document.');
        }

        const dataState = parsed.data || parsed;
        if (!dataState || typeof dataState !== 'object') {
          throw new Error(isAr ? 'محتوى ملف النسخة الاحتياطية غير صالح.' : 'Invalid database schema format in backup.');
        }

        if (!Array.isArray(dataState.tasks) || !Array.isArray(dataState.checklists)) {
          throw new Error(isAr ? 'خطأ في بنية البيانات: النسخة الاحتياطية لا تحتوي على مصفوفة مهام أو كشوف تفقد.' : 'Standard parameters mismatch: missing tasks or checklists arrays.');
        }

        // Upload to server
        const response = await fetch('/api/backups/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: file.name,
            backupData: parsed,
            createdBy: currentUser.name
          })
        });

        if (response.ok) {
          const result = await response.json();
          setLocalStatus({
            type: 'success',
            message: isAr
              ? `تم رفع واستيراد النسخة الاحتياطية بنجاح: ${result.filename}`
              : `Backup imported and registered successfully: ${result.filename}`
          });
          
          onAddNotification(
            isAr ? 'تم رفع ملف نسخة احتياطية' : 'Backup File Uploaded',
            isAr
              ? `قام الموظف "${currentUser.name}" برفع نسخة احتياطية من الكمبيوتر تحت اسم (${result.filename}).`
              : `Crew member "${currentUser.name}" uploaded a custom backup file from computer: (${result.filename}).`,
            'System'
          );

          // Clear file input
          e.target.value = '';
          // Refresh list
          fetchBackups();
        } else {
          const errRes = await response.json();
          throw new Error(errRes.error || (isAr ? 'فشلت معالجة وتخزين البيانات على الخادم' : 'Failed to parse and write response on server.'));
        }
      } catch (err: any) {
        setLocalStatus({
          type: 'error',
          message: err?.message || (isAr ? 'حدث خطأ غير متوقع أثناء معالجة الملف' : 'An error occurred during file import.')
        });
      } finally {
        setUploadLoading(false);
      }
    };

    reader.onerror = () => {
      setLocalStatus({
        type: 'error',
        message: isAr ? 'فشل قراءة الملف من الجهاز!' : 'Failed to read file from local computer!'
      });
      setUploadLoading(false);
    };

    reader.readAsText(file);
  };

  // Load backups list
  const fetchBackups = async () => {
    setLoadingList(true);
    try {
      const response = await fetch('/api/backups');
      if (response.ok) {
        const data = await response.json();
        setBackups(data);
      } else {
        console.error('Failed to load backups list');
      }
    } catch (e) {
      console.error('Error fetching backups:', e);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  // Helper to format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Create Manual Backup
  const handleCreateBackup = async () => {
    setActionLoading('create');
    setLocalStatus(null);
    try {
      const response = await fetch('/api/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: currentUser.name })
      });

      if (response.ok) {
        const data = await response.json();
        setLocalStatus({
          type: 'success',
          message: isAr 
            ? `تم إنشاء النسخة الاحتياطية بنجاح: ${data.filename}`
            : `Backup completed successfully: ${data.filename}`
        });
        onAddNotification(
          isAr ? 'نسخة احتياطية للنظام' : 'Database Snapshot Created',
          isAr 
            ? `قام الموظف "${currentUser.name}" بإنشاء نسخة احتياطية محلية تحت اسم ${data.filename}.`
            : `Operator "${currentUser.name}" successfully created system backup file "${data.filename}".`,
          'System'
        );
        fetchBackups();
      } else {
        setLocalStatus({
          type: 'error',
          message: isAr ? 'فشلت عملية المزامنة وحفظ النسخة الاحتياطية' : 'Backup alignment failed'
        });
      }
    } catch (e) {
      setLocalStatus({
        type: 'error',
        message: isAr ? 'فشل الاتصال بالخادم لإنشاء النسخة الاحتياطية' : 'Backup connection failed due to network disruption'
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Process Restore Backup
  const handleRestore = async (backup: Backup, target: 'production' | 'test') => {
    const isProd = target === 'production';
    setActionLoading(`restore-${backup.filename}`);
    setLocalStatus(null);
    setConfirmRestoreFile(null);
    setConfirmRestoreType(null);

    const apiEndpoint = isProd ? '/api/backups/restore' : '/api/backups/restore-test';
    
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ filename: backup.filename })
      });

      if (response.ok) {
        const data = await response.json();
        setLocalStatus({
          type: 'success',
          message: isProd
            ? (isAr ? 'تم استعادة قاعدة البيانات بنجاح للنظام المباشر!' : 'Restoration of production data completed successfully!')
            : (isAr ? 'تم استعادة البيانات وبدء تشغيل بيئة الاختبار الآمنة بنجاح!' : 'Development Sandbox database loaded successfully!')
        });

        if (isProd) {
          await onRefreshAppState();
        } else {
          onEnvironmentChanged('test', data.state);
        }
        
        fetchBackups();
      } else {
        let errMsg = '';
        try {
          const errRes = await response.json();
          errMsg = errRes.error || errRes.details || '';
        } catch (_) {}

        setLocalStatus({
          type: 'error',
          message: errMsg 
            ? `${isAr ? 'فشلت الاستعادة:' : 'Restore failed:'} ${errMsg}`
            : (isAr ? 'حدث خطأ أثناء تحميل واستعادة ملف البيانات' : 'Restore alignment synchronization failure')
        });
      }
    } catch (e: any) {
      setLocalStatus({
        type: 'error',
        message: isAr 
          ? `فشل الاتصال بالخادم لإتمام عملية الاستعادة: ${e?.message || ''}` 
          : `Restore request failed due to connection issue: ${e?.message || ''}`
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Active Environment (Live Production vs Sandbox Dev)
  const handleToggleEnvironment = async () => {
    setActionLoading('env-toggle');
    setLocalStatus(null);
    const targetEnv = serverEnv === 'production' ? 'test' : 'production';
    
    try {
      const response = await fetch('/api/env', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ env: targetEnv })
      });

      if (response.ok) {
        const data = await response.json();
        setLocalStatus({
          type: 'success',
          message: targetEnv === 'production'
            ? (isAr ? 'تم التبديل بنجاح إلى بيئة الإنتاج المباشرة (LIVE)' : 'Switched active context to Live Production database.')
            : (isAr ? 'تم التبديل بنجاح لبيئة الاختبار المعزولة (SANDBOX)' : 'Switched active context to Sandbox Test Playground.')
        });

        onEnvironmentChanged(targetEnv, data.state);
        onRefreshAppState();
      } else {
        setLocalStatus({
          type: 'error',
          message: isAr ? 'فشل تغيير البيئة الافتراضية المحددة' : 'Failed to switch active deployment environment'
        });
      }
    } catch (e) {
      setLocalStatus({
        type: 'error',
        message: isAr ? 'خطأ في الاتصال بالشبكة لتبديل بيئة الخادم' : 'Failed to reach network parameters'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadBackup = (backup: Backup) => {
    // Trigger the file download without navigating the SPA away from its
    // current page/state (window.location.href would do a full navigation).
    const link = document.createElement('a');
    link.href = `/api/backups/${encodeURIComponent(backup.filename)}/download`;
    link.download = backup.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-left" id="backup-restore-container">
      
      {/* Top Banner Status */}
      {localStatus && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-3 transition-all animate-in slide-in-from-top-2 border ${
          localStatus.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {localStatus.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
          )}
          <span className="font-semibold leading-normal">{localStatus.message}</span>
        </div>
      )}

      {/* Main Grid Control Console */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Side: System State Settings & Instant Operations */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Backup Database Instant Commands */}
          <div className="bg-[#0b0c10]/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Database className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {isAr ? 'العمليات الفورية والمزامنة' : 'Instant Backup Control'}
              </span>
            </div>

            <div className="space-y-3.5">
              {/* Force Create Backup */}
              <button
                disabled={actionLoading === 'create'}
                onClick={handleCreateBackup}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-55 text-white font-bold text-xs py-3 px-4 rounded-xl cursor-pointer transition-all shadow-lg shadow-indigo-555/10"
              >
                {actionLoading === 'create' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري ضغط وحفظ البيانات...' : 'Exporting Cloud Matrix...'}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 shrink-0" />
                    <span>{isAr ? 'إنشاء نسخة احتياطية فورية' : 'Create Live Cloud Backup'}</span>
                  </>
                )}
              </button>

              <div className="text-[10px] text-zinc-500 italic leading-snug">
                {isAr
                  ? 'تنبيه: يتم تشفير وعزل بيانات المستخدمين، التذاكر، سجلات الفحص، المشاريع، والإعدادات تلقائياً في ملف JSON مشفر برقم تسلسلي وطابع زمني دقيق.'
                  : 'Notice: Compiles users, checklists compliance matrix, team tickets, live threads, configurations, settings, files references and system versions securely.'}
              </div>

              <div className="h-px bg-white/5 my-1" />

              {/* Upload Backup From Computer */}
              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  {isAr ? 'استيراد نسخة احتياطية من الكمبيوتر:' : 'IMPORT BACKUP FROM COMPUTER:'}
                </span>
                
                <div className="relative border border-dashed border-white/10 hover:border-indigo-500/30 bg-[#06070a]/40 hover:bg-indigo-500/[0.02] rounded-xl p-4 transition-all flex flex-col items-center justify-center text-center gap-2 group cursor-pointer min-h-[110px]">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadBackupFile}
                    disabled={uploadLoading || !!actionLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                    id="backup-upload-input"
                  />
                  {uploadLoading ? (
                    <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                  ) : (
                    <UploadCloud className="h-6 w-6 text-zinc-500 group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-300" />
                  )}
                  <div className="space-y-1">
                    <span className="block text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {uploadLoading 
                        ? (isAr ? 'جاري رفع وتحليل الملف...' : 'Parsing uploaded file...') 
                        : (isAr ? 'اختر أو اسحب ملف النسخة الاحتياطية (.json)' : 'Drag & drop or browse backup (.json)')}
                    </span>
                    <span className="block text-[9px] text-zinc-500 font-mono">
                      {isAr ? 'حجم الملف الأقصى: 10 ميجابايت' : 'Maximum file size: 10MB'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: History Log */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* Core Backup History Logs */}
          <div className="bg-[#0b0c10]/60 border border-white/5 rounded-2xl p-6.5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <History className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {isAr ? 'سجل النسخ الاحتياطية المتاحة' : 'Historical System Backups'}
                </span>
              </div>
              <button
                disabled={loadingList}
                onClick={fetchBackups}
                className="p-1 px-2 border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-[10px] text-zinc-300 hover:text-white rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 font-mono"
              >
                <RefreshCcw className={`h-3 w-3 ${loadingList ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'تحديث السجل' : 'RELOAD INDEX'}</span>
              </button>
            </div>

            {loadingList && backups.length === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center p-6 text-zinc-500">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-2" />
                <p className="text-xs font-mono">{isAr ? 'جاري فحص وتكشيف ملفات الخادم المتاحة...' : 'Scanning local filesystem records...'}</p>
              </div>
            ) : backups.length === 0 ? (
              <div className="h-36 border border-dashed border-white/5 bg-black/10 rounded-2xl flex flex-col items-center justify-center p-6 text-zinc-500 space-y-2">
                <FileJson className="h-7 w-7 text-zinc-600 animate-bounce" />
                <p className="text-xs font-bold font-mono">
                  {isAr ? 'لا يوجد أي نسخ احتياطية مسجلة في النظام حتى الآن.' : 'No system database backup files compiled yet.'}
                </p>
                <p className="text-[10px] text-zinc-650 block max-w-sm text-center">
                  {isAr ? 'استخدم زر إنشاء نسخة احتياطية فورية لحفظ نسخة من البيانات الحالية.' : 'Use Create Backup to compile transactional logs and data states.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-zinc-350 select-none font-sans border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] font-bold uppercase text-zinc-500 tracking-wider">
                      <th className="py-2.5 pb-2 text-left">{isAr ? 'النسخة / المعرف التراكمي' : 'VERSION / FILE'}</th>
                      <th className="py-2.5 pb-2 text-left hidden sm:table-cell">{isAr ? 'التاريخ والوقت والنوع' : 'TIMESTAMPS & SOURCE'}</th>
                      <th className="py-2.5 pb-2 text-right">{isAr ? 'الحجم' : 'SIZE'}</th>
                      <th className="py-2.5 pb-2 text-right">{isAr ? 'إجراءات التحكم وال rollback' : 'ACTIONS'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup) => {
                      const isRestoring = actionLoading === `restore-${backup.filename}`;
                      const isTestRestoring = actionLoading === `restore-test-${backup.filename}`;

                      return (
                        <tr 
                          key={backup.id} 
                          className="border-b border-white/5 hover:bg-white/2 transition-colors align-middle text-left"
                        >
                          {/* File / Version */}
                          <td className="py-3 text-left">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-300">
                                <FileJson className="h-3.5 w-3.5 shrink-0" />
                              </div>
                              <div className="max-w-[130px] sm:max-w-xs truncate text-left">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white text-[11px] font-mono">v{backup.version}</span>
                                  {backup.type === 'Auto-Before-Deploy' && (
                                    <span className="text-[8px] px-1 bg-amber-500/10 text-amber-400 hover:text-amber-300 rounded font-bold uppercase font-mono tracking-widest leading-none">
                                      {isAr ? 'تلقائي قبل النشر' : 'DEPLOY'}
                                    </span>
                                  )}
                                  {/* removed test env tag */}
                                </div>
                                <span className="block text-[9px] text-zinc-500 font-mono truncate mt-0.5" title={backup.filename}>
                                  {backup.filename}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Date and Details */}
                          <td className="py-3 hidden sm:table-cell text-left">
                            <span className="block font-medium text-white text-[11px] font-mono leading-none">{backup.date} · {backup.time}</span>
                            <span className="block text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
                              {isAr ? 'بواسطة:' : 'BY:'} <strong className="text-zinc-400 normal-case font-mono font-medium">{backup.createdBy}</strong>
                            </span>
                          </td>

                          {/* Size */}
                          <td className="py-3 text-right font-mono text-[11px] font-bold text-zinc-300">
                            {formatSize(backup.size)}
                          </td>

                          {/* Actions */}
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Download Button */}
                              <button
                                onClick={() => handleDownloadBackup(backup)}
                                className="p-1.5 border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer"
                                title={isAr ? 'تحميل نسخة محلية' : 'Download copy locally'}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>



                              {/* Restore to Live Production Button */}
                              {hasManagerAccess(currentUser) && (
                                <button
                                  disabled={isRestoring || !!actionLoading}
                                  onClick={() => {
                                    setConfirmRestoreFile(backup);
                                    setConfirmRestoreType('production');
                                  }}
                                  className="p-1 px-2 border border-amber-500/20 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer font-mono"
                                  title={isAr ? 'عزل والبدء باستعادة قاعدة البيانات الحية' : 'Execute direct active live operational database override'}
                                >
                                  {isRestoring ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Lock className="h-3 w-3" />
                                  )}
                                  <span>{isAr ? 'استعادة' : 'RESTORE'}</span>
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Confirmation Modal Safeguard */}
      {confirmRestoreFile && confirmRestoreType && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-amber-500/30 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in duration-150">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {isAr ? 'تأكيد تجاوز واستبدال البيانات' : 'Confirm Overwrite Transaction'}
                </h3>
                <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">{confirmRestoreFile.filename}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-zinc-350">
              <p className="text-zinc-300">
                {confirmRestoreType === 'production' ? (
                  isAr 
                    ? 'تحذير أمني هام! أنت على وشك مسح واستبدال قاعدة البيانات الفعالة الحالية بكامل محتويات هذه النسخة المحددة. سيؤثر هذا التغيير على كافة فنيي الصيانة المتصلين الآن.'
                    : 'Warning! You are about to override the authoritative, active live production database with the absolute contents of this file. This action will immediately reset operations data and notify all operators.'
                ) : (
                  isAr
                    ? 'سلوك تشغيلي آمن: سيتم عزل ومزامنة هذه المخرجات في البيئة التجريبية المغلقة للتحقق، ولن يؤثر هذا الإجراء على الفنيين الآخرين أو لوحة الإنتاج الحية.'
                    : 'Aesthetic allocation: Swapping database elements cleanly in the designated Sandbox. This sandbox operation will not disturb real operational logs or active operators.'
                )}
              </p>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-[10px] space-y-1 text-left text-zinc-400">
                <div><span className="text-zinc-500 uppercase">{isAr ? 'رمز الإصدار:' : 'VER:'}</span> <strong className="text-zinc-200">v{confirmRestoreFile.version}</strong></div>
                <div><span className="text-zinc-500 uppercase">{isAr ? 'حجم الملف:' : 'SIZE:'}</span> <strong className="text-zinc-200">{formatSize(confirmRestoreFile.size)}</strong></div>
                <div><span className="text-zinc-500 uppercase">{isAr ? 'تاريخ التعديل:' : 'STAMPS:'}</span> <strong className="text-zinc-200">{confirmRestoreFile.date} · {confirmRestoreFile.time}</strong></div>
                <div><span className="text-zinc-500 uppercase">{isAr ? 'المسؤول:' : 'BY:'}</span> <strong className="text-zinc-200">{confirmRestoreFile.createdBy}</strong></div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/5">
              <button
                onClick={() => {
                  setConfirmRestoreFile(null);
                  setConfirmRestoreType(null);
                }}
                className="px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-zinc-805 text-zinc-300 text-[11px] font-bold rounded-xl cursor-pointer transition-all"
              >
                {isAr ? 'إلغاء الأمر' : 'Abandon'}
              </button>
              <button
                onClick={() => handleRestore(confirmRestoreFile, confirmRestoreType)}
                className={`px-4 py-2 rounded-xl text-white text-[11px] font-extrabold cursor-pointer transition-all ${
                  confirmRestoreType === 'production' 
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' 
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmRestoreType === 'production' 
                  ? (isAr ? 'تأكيد واستبدال قاعدة البيانات' : 'Authorize Overwrite Override')
                  : (isAr ? 'تشغيل وتفعيل التجربة' : 'Sync Sandbox Workspace')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
