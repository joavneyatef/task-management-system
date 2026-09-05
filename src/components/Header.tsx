import React, { useState, useEffect } from 'react';
import { Shield, Bell, Check, Clock, Radio, ChevronDown, User as UserIcon, UserCheck, Terminal, AlertTriangle, LogOut, Sun, Moon, Settings as SettingsIcon, Languages, Mail, Phone, Menu } from 'lucide-react';
import { User, Notification } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { isGeneralManager, isDirector } from '../utils/permissions';
import LongBeachLogo from './LongBeachLogo';
import UserProfileModal from './UserProfileModal';

interface HeaderProps {
  currentUser: User;
  users: User[];
  onSelectUser?: (user: User) => void;
  onLogout: () => void;
  onUpdateProfile?: (updatedFields: Partial<User>, newPassword?: string) => Promise<{ ok: boolean; error?: string }>;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activePresences?: any[];
  taskCounts?: Record<string, number>;
  complaintCounts?: Record<string, number>;
  // Shown only below the lg breakpoint, where the sidebar becomes an
  // off-canvas drawer instead of the always-visible column.
  onOpenMenu?: () => void;
}

export default function Header({
  currentUser,
  users,
  onLogout,
  onUpdateProfile,
  notifications,
  onMarkRead,
  onMarkAllRead,
  theme,
  onToggleTheme,
  activePresences = [],
  taskCounts = {},
  complaintCounts = {},
  onOpenMenu
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const { language, setLanguage, t, isRtl } = useLanguage();
  const isAr = language === 'ar';

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatEgyptTime = (d: Date) => {
    try {
      return d.toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });
    } catch (e) {
      return d.toISOString().replace('T', ' ').substring(0, 19);
    }
  };

  // Filter personal acknowledged notifications
  const filteredNotifications = notifications.filter(
    n => n.recipientUserId === currentUser.id && !!n.acknowledgedAt
  );

  const unreadCount = filteredNotifications.filter(n => !n.isRead).length;

  const handleProfileUpdate = async (updatedFields: Partial<User>, newPassword?: string) => {
    if (onUpdateProfile) {
      return await onUpdateProfile(updatedFields, newPassword);
    }
    return { ok: true };
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-black/40 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
        {/* Brand & Telemetry */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Sidebar drawer toggle — the sidebar is off-canvas below lg */}
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              className="lg:hidden p-2 -ms-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer shrink-0"
              aria-label={isAr ? 'فتح القائمة' : 'Open menu'}
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
          <div className="relative flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center shrink-0">
            <LongBeachLogo showText={false} size="sm" variant="light" className="!mt-0" />
            <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 border border-black animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-sm sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
                {t('brand.title')} <span className="text-orange-500">{t('brand.subtitle')}</span>
              </h1>
              <span className="hidden sm:flex rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-450 items-center gap-1">
                <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-400" /> {t('status.active_core')}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-zinc-400 italic font-medium truncate">{t('brand.command_center')}</p>
          </div>
        </div>

        {/* Clock and System Metrics */}
        <div className="hidden lg:flex items-center gap-6 border-x border-white/5 px-6 py-1 font-mono text-xs">
          <div className={isRtl ? 'text-left' : 'text-right'}>
            <span className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{t('header.system_clock')}</span>
            <span className={`text-zinc-200 flex items-center gap-1.5 ${isRtl ? 'justify-start' : 'justify-end'}`}>
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              {formatEgyptTime(time)}
            </span>
          </div>
          <div className={isRtl ? 'text-left' : 'text-right'}>
            <span className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{t('header.sla_compliance')}</span>
            <span className="text-emerald-400 font-bold">96.7% {t('header.secure')}</span>
          </div>
        </div>

        {/* Control Actions & User Profile Menu */}
        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
          {/* Quick Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Moon className="h-4 w-4 text-indigo-400" /> : <Sun className="h-4 w-4 text-amber-400" />}
          </button>

          {/* Quick Language Switcher — icon-only on narrow screens */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="px-2 sm:px-2.5 py-2 sm:py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Toggle Arabic / English"
          >
            <Languages className="h-3.5 w-3.5 text-orange-400" />
            <span className="hidden sm:inline">{language === 'en' ? 'العربية' : 'EN'}</span>
          </button>

          {/* Notifications Center */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen(!notifOpen);
                setDropdownOpen(false);
              }}
              className="relative p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              title="System Alerts & Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white shadow-lg">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Drawer */}
            {notifOpen && (
              <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-[calc(100vw-1.5rem)] max-w-80 sm:w-96 rounded-xl glass-heavy shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 border border-white/10`}>
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{t('header.bulletins')}</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllRead}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      {t('header.mark_all_read')}
                    </button>
                  )}
                </div>

                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredNotifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                      {t('header.no_alerts')}
                    </div>
                  ) : (
                    filteredNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => onMarkRead(notif.id)}
                        className={`p-3 rounded-lg border text-xs transition-all cursor-pointer ${
                          notif.isRead
                            ? 'border-white/5 bg-white/[0.01] text-zinc-400 opacity-60'
                            : 'border-indigo-500/20 bg-indigo-500/5 text-zinc-200 shadow-sm'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {notif.category === 'Alert' ? (
                            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                          ) : (
                            <Radio className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-white">{notif.title}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{notif.message}</p>
                            <div className="flex items-center justify-between mt-1.5 font-mono text-[9px] text-zinc-500">
                              <span>
                                {new Date(notif.createdAt).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                  timeZone: 'Africa/Cairo',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              <div className="flex gap-1.5 font-bold">
                                {notif.channels.telegram && <span className="text-emerald-500">TG ✓</span>}
                                {notif.channels.email && <span className="text-blue-400">EM ✓</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                setNotifOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 hover:border-white/20 hover:bg-white/8 transition-all text-left cursor-pointer"
              id="user-profile-button"
            >
              <div className="relative shrink-0">
                <img
                  src={currentUser.avatar || 'https://placehold.co/80x80?text=User'}
                  alt={currentUser.name}
                  className="h-8 w-8 rounded-lg object-cover border border-white/10"
                  referrerPolicy="no-referrer"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#050507] ${
                    currentUser.status === 'Active'
                      ? 'bg-emerald-400'
                      : currentUser.status === 'On Leave'
                      ? 'bg-amber-400'
                      : 'bg-slate-500'
                  }`}
                />
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white leading-none">{currentUser.name}</span>
                  <span
                    className={`text-[9px] leading-none px-1.5 py-0.5 rounded ${
                      isGeneralManager(currentUser)
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        : isDirector(currentUser)
                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                        : currentUser.role === 'Manager'
                        ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                        : currentUser.role === 'Assistant'
                        ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                        : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                    }`}
                  >
                    {isGeneralManager(currentUser)
                      ? t('role.general_manager')
                      : isDirector(currentUser)
                      ? t('role.director')
                      : currentUser.role === 'Manager'
                      ? t('role.manager')
                      : currentUser.role === 'Assistant'
                      ? t('role.assistant')
                      : t('role.coordinator')}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate max-w-[130px]">
                  {currentUser.title || currentUser.role}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
            </button>

            {/* Clean Profile & Settings Dropdown Menu (No impersonate list) */}
            {dropdownOpen && (
              <div
                className={`absolute ${
                  isRtl ? 'left-0' : 'right-0'
                } mt-2 w-[calc(100vw-1.5rem)] max-w-72 rounded-2xl glass-heavy shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-3 duration-200 border border-white/10`}
              >
                {/* User Summary Card */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2.5 flex items-center gap-3">
                  <img
                    src={currentUser.avatar || 'https://placehold.co/80x80?text=User'}
                    alt={currentUser.name}
                    className="h-10 w-10 rounded-xl object-cover border border-white/10 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{currentUser.email}</p>
                    <span className="inline-block mt-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                      ● {isAr ? 'حساب نشط' : 'Active Account'}
                    </span>
                  </div>
                </div>

                {/* Actions Menu */}
                <div className="space-y-1">
                  {/* Edit Profile Action */}
                  <button
                    onClick={() => {
                      setProfileModalOpen(true);
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-zinc-200 hover:text-white transition-all text-xs font-medium cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span>{isAr ? 'تعديل الملف الشخصي' : 'User Profile & Password'}</span>
                    </div>
                    <span className="text-[9px] text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {isAr ? 'تعديل' : 'Edit'}
                    </span>
                  </button>

                  {/* Settings Action */}
                  <button
                    onClick={() => {
                      setProfileModalOpen(true);
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 text-zinc-200 hover:text-white transition-all text-xs font-medium cursor-pointer text-left"
                  >
                    <SettingsIcon className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span>{isAr ? 'تفضيلات العرض والمظهر' : 'Display & Preferences'}</span>
                  </button>

                  <div className="border-t border-white/10 pt-1.5 mt-1.5">
                    {/* Logout */}
                    <button
                      onClick={() => {
                        onLogout();
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 font-bold cursor-pointer text-left"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span>{isAr ? 'تسجيل الخروج الآمن' : 'Log Out (Secure)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* User Profile & Password Update Modal */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        currentUser={currentUser}
        users={users}
        onUpdateProfile={handleProfileUpdate}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    </>
  );
}
