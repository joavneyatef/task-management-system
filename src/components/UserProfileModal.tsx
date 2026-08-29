import React, { useState, useMemo } from 'react';
import { User } from '../types';
import { X, User as UserIcon, Lock, Settings as SettingsIcon, Eye, EyeOff, Check, AlertCircle, Save, Camera, Mail, Phone, Shield, Moon, Sun, Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  users: User[];
  onUpdateProfile: (updatedFields: Partial<User>, newPassword?: string) => Promise<{ ok: boolean; error?: string }>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  users,
  onUpdateProfile,
  theme,
  onToggleTheme
}: UserProfileModalProps) {
  const { language, setLanguage } = useLanguage();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'settings'>('profile');

  // Form states
  const [name, setName] = useState(currentUser.name || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [avatar, setAvatar] = useState(currentUser.avatar || '');

  // Security states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password rules validation
  const passwordRules = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasLower: /[a-z]/.test(newPassword),
      hasUpper: /[A-Z]/.test(newPassword),
      hasNumberOrSymbol: /[0-9\W_]/.test(newPassword),
      matches: newPassword.length > 0 && newPassword === confirmPassword
    };
  }, [newPassword, confirmPassword]);

  const isPasswordValid =
    newPassword.length === 0 ||
    (passwordRules.minLength &&
      passwordRules.hasLower &&
      passwordRules.hasUpper &&
      passwordRules.hasNumberOrSymbol &&
      passwordRules.matches);

  if (!isOpen) return null;

  const handleImageUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setAvatar(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          setAvatar(raw);
        }
      };
      img.onerror = () => setAvatar(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  const supervisor = users.find(u => u.id === currentUser.parentId || u.id === currentUser.managerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError(isAr ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    if (!email.trim()) {
      setError(isAr ? 'البريد الإلكتروني مطلوب' : 'Email is required');
      return;
    }

    if (newPassword && !isPasswordValid) {
      setError(isAr ? 'يرجى استيفاء جميع شروط كلمة المرور وتطابقها' : 'Password must meet all criteria and match confirmation.');
      return;
    }

    setSaving(true);
    const res = await onUpdateProfile(
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        avatar
      },
      newPassword || undefined
    );
    setSaving(false);

    if (!res.ok) {
      setError(res.error || (isAr ? 'تعذر حفظ التعديلات' : 'Failed to update profile'));
    } else {
      setSuccess(isAr ? 'تم حفظ التعديلات بنجاح!' : 'Profile updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="w-full max-w-lg bg-[#0e0f17] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {isAr ? 'الملف الشخصي والإعدادات' : 'User Profile & Settings'}
              </h2>
              <p className="text-[10px] text-zinc-400 font-mono">
                {currentUser.title || currentUser.role}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-black/40 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>{isAr ? 'البيانات الشخصية' : 'Profile'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isAr ? 'الأمان وكلمة المرور' : 'Security'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>{isAr ? 'تفضيلات العرض' : 'Preferences'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Avatar Uploader */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="relative">
                  <img
                    src={avatar || 'https://placehold.co/100x100?text=User'}
                    alt={name}
                    className="w-16 h-16 rounded-xl object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <label className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg transition-transform hover:scale-105">
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleImageUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">{name || currentUser.name}</h3>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{currentUser.email}</p>
                  <p className="text-[10px] text-indigo-400 mt-1">
                    {isAr ? 'انقر على أيقونة الكاميرا لتغيير الصورة' : 'Click the camera icon to upload new photo'}
                  </p>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  {isAr ? 'الاسم بالكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  {isAr ? 'البريد الإلكتروني الوظيفي *' : 'Job Email *'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-zinc-500">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl p-2.5 ps-9 text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  {isAr ? 'رقم الهاتف / التحويلة' : 'Phone / Extension'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-zinc-500">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+20 ..."
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl p-2.5 ps-9 text-xs text-white placeholder:text-zinc-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Organizational Position (Read-Only) */}
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-zinc-500 block text-[9px] font-mono uppercase font-bold">
                    {isAr ? 'المستوى الوظيفي:' : 'Role Level:'}
                  </span>
                  <span className="text-white font-semibold">{currentUser.title || currentUser.role}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[9px] font-mono uppercase font-bold">
                    {isAr ? 'المسؤول المباشر:' : 'Reports To:'}
                  </span>
                  <span className="text-indigo-300 font-semibold">{supervisor ? supervisor.name : 'Executive Management'}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 flex items-start gap-2">
                <Shield className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  {isAr
                    ? 'لتغيير كلمة المرور، أدخل كلمة المرور الجديدة وتأكيدها. إذا كنت لا ترغب في التغيير، اترك الحقول فارغة.'
                    : 'To change your password, enter a new password and confirm it. Leave blank if unchanged.'}
                </span>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={isAr ? 'أدخل كلمة المرور الجديدة' : 'Enter new password'}
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl p-2.5 pe-10 text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={isAr ? 'أعد إدخال كلمة المرور' : 'Re-enter password'}
                  className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                />
              </div>

              {/* Password Rule Validation Matrix */}
              {newPassword.length > 0 && (
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1.5 text-[11px]">
                  <span className="block text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
                    {isAr ? 'شروط كلمة المرور:' : 'Password Requirements:'}
                  </span>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        passwordRules.minLength
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {passwordRules.minLength ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    </div>
                    <span className={passwordRules.minLength ? 'text-emerald-300 font-medium' : 'text-zinc-400'}>
                      {isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        passwordRules.hasLower
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {passwordRules.hasLower ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    </div>
                    <span className={passwordRules.hasLower ? 'text-emerald-300 font-medium' : 'text-zinc-400'}>
                      {isAr ? 'حرف صغير واحد على الأقل (a-z)' : 'At least one lowercase letter (a-z)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        passwordRules.hasUpper
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {passwordRules.hasUpper ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    </div>
                    <span className={passwordRules.hasUpper ? 'text-emerald-300 font-medium' : 'text-zinc-400'}>
                      {isAr ? 'حرف كبير واحد على الأقل (A-Z)' : 'At least one uppercase letter (A-Z)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        passwordRules.hasNumberOrSymbol
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {passwordRules.hasNumberOrSymbol ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    </div>
                    <span
                      className={
                        passwordRules.hasNumberOrSymbol ? 'text-emerald-300 font-medium' : 'text-zinc-400'
                      }
                    >
                      {isAr ? 'رقم أو رمز خاص (0-9 أو #$%)' : 'At least one number or symbol (0-9, #$%)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        passwordRules.matches
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {passwordRules.matches ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    </div>
                    <span className={passwordRules.matches ? 'text-emerald-300 font-medium' : 'text-zinc-400'}>
                      {isAr ? 'تطابق كلمتي المرور' : 'Passwords match'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Language Preference */}
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                    <Languages className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {isAr ? 'لغة الواجهة' : 'Interface Language'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {language === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-white cursor-pointer transition-colors"
                >
                  {language === 'en' ? 'العربية' : 'English'}
                </button>
              </div>

              {/* Theme Preference */}
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {isAr ? 'المظهر والألوان' : 'Color Theme'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {theme === 'dark' ? (isAr ? 'الوضع الداكن (Dark)' : 'Dark Theme') : (isAr ? 'الوضع الفاتح (Light)' : 'Light Theme')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-white cursor-pointer transition-colors"
                >
                  {theme === 'dark' ? (isAr ? 'تفعيل الفاتح' : 'Switch Light') : (isAr ? 'تفعيل الداكن' : 'Switch Dark')}
                </button>
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving || (newPassword.length > 0 && !isPasswordValid)}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
