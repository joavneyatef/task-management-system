import React from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { Notification } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface NotificationAlertPopupProps {
  // The single next notification pending acknowledgement for the current user.
  // Parent is responsible for only ever passing notifications that belong to
  // the currently logged-in user (recipientUserId === currentUser.id) and
  // that have not been acknowledged yet, so the same alert never appears twice.
  notification: Notification | null;
  onAcknowledge: (id: string) => void;
  queueCount?: number;
}

// Top-of-screen "alert" for a freshly arrived notification.
// Pressing OK acknowledges it, which removes it from this popup permanently
// and reveals it inside the Notification Center (Header bell) instead.
export default function NotificationAlertPopup({ notification, onAcknowledge, queueCount = 0 }: NotificationAlertPopupProps) {
  const { language, isRtl } = useLanguage();

  if (!notification) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="rounded-xl glass-heavy shadow-2xl border border-white/15 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex items-start gap-3">
          {notification.category === 'Alert' ? (
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Radio className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-white">{notification.title}</p>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{notification.message}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-zinc-500 font-mono">
            {queueCount > 0
              ? (language === 'ar' ? `+${queueCount} إشعارات أخرى بالانتظار` : `+${queueCount} more waiting`)
              : ''}
          </span>
          <button
            onClick={() => onAcknowledge(notification.id)}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
          >
            {language === 'ar' ? 'حسناً' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
