import React, { useState, useMemo } from 'react';
import { User, Department } from '../types';
import { Languages, UserPlus, LogIn, ArrowLeft, Eye, EyeOff, Check, X, Building2 } from 'lucide-react';
import LongBeachLogo from './LongBeachLogo';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  users: User[];
  departments?: Department[];
  onLogin: (user: User) => void;
  onSignup: (data: {
    name: string;
    password: string;
    role: 'Director' | 'Manager' | 'Assistant';
    departmentId: string;
    avatar: string;
    email: string;
    parentId: string;
  }) => Promise<{ ok: boolean; error?: string; user?: User }>;
}

const DEFAULT_DEPARTMENTS: { id: string; name: string; nameAr: string }[] = [
  { id: 'it', name: 'IT Department', nameAr: 'إدارة تقنية المعلومات' },
  { id: 'fnb', name: 'Food & Beverage', nameAr: 'الأغذية والمشروبات' },
  { id: 'rooms', name: 'Rooms Division', nameAr: 'قطاع الغرف والإقامة' },
  { id: 'operations', name: 'Operations', nameAr: 'إدارة العمليات والتشغيل' },
];

export default function LoginPage({ users, departments = [], onLogin, onSignup }: Props) {
  const { language, setLanguage } = useLanguage();
  const isAr = language === 'ar';

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Signup fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Director' | 'Manager' | 'Assistant'>('Assistant');
  const [departmentId, setDepartmentId] = useState('it');
  const [parentId, setParentId] = useState('');
  const [avatar, setAvatar] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Available departments list
  const deptList = useMemo(() => {
    if (departments && departments.length > 0) {
      return departments.map(d => ({
        id: d.id,
        name: d.name,
        nameAr:
          d.id === 'it'
            ? 'إدارة تقنية المعلومات'
            : d.id === 'fnb'
            ? 'الأغذية والمشروبات'
            : d.id === 'rooms'
            ? 'قطاع الغرف'
            : d.id === 'operations'
            ? 'إدارة العمليات'
            : d.name
      }));
    }
    return DEFAULT_DEPARTMENTS;
  }, [departments]);

  // Password rules validation logic
  const passwordRules = useMemo(() => {
    const target = mode === 'signup' ? signupPassword : '';
    return {
      minLength: target.length >= 8,
      hasLower: /[a-z]/.test(target),
      hasUpper: /[A-Z]/.test(target),
      hasNumberOrSymbol: /[0-9\W_]/.test(target),
    };
  }, [mode, signupPassword]);

  const isSignupPasswordValid =
    passwordRules.minLength &&
    passwordRules.hasLower &&
    passwordRules.hasUpper &&
    passwordRules.hasNumberOrSymbol;

  const handleImage = (file?: File) => {
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

  // Filter supervisor leaders strictly based on Role and selected Department
  const leaders = useMemo(() => {
    if (role === 'Director') {
      // Directors report directly to General Manager (GM)
      return users.filter(u => u.role === 'GM' || u.role === 'GeneralManager');
    }
    if (role === 'Manager') {
      // Department Managers report to the Director of their specific department
      const deptDirectors = users.filter(u => u.role === 'Director' && u.departmentId === departmentId);
      if (deptDirectors.length > 0) return deptDirectors;
      return users.filter(u => u.role === 'GM' || u.role === 'GeneralManager');
    }
    // Assistant: strictly reports to the Managers or Director belonging to their chosen department only
    const deptSupervisors = users.filter(
      u => (u.role === 'Manager' || u.role === 'Director') && u.departmentId === departmentId
    );
    if (deptSupervisors.length > 0) return deptSupervisors;
    return users.filter(u => (u.role === 'Manager' || u.role === 'Director') && (!u.departmentId || u.departmentId === departmentId));
  }, [role, departmentId, users]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError(isAr ? 'من فضلك أدخل الاسم أو البريد الإلكتروني' : 'Please enter your name or work email');
      return;
    }
    if (!password) {
      setError(isAr ? 'من فضلك أدخل كلمة المرور' : 'Please enter your password');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      const data = await r.json();
      if (!r.ok) {
        setError(
          data.message ||
            (isAr
              ? 'الاسم أو البريد الإلكتروني أو كلمة المرور غير صحيحة'
              : 'Invalid name, email, or password')
        );
        return;
      }
      onLogin(data.user);
    } catch {
      setError(isAr ? 'تعذر الاتصال بالخادم' : 'Unable to connect to server');
    } finally {
      setSaving(false);
    }
  };

  const doSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !signupPassword || !parentId || !departmentId) {
      setError(
        isAr
          ? 'من فضلك أكمل كل البيانات المطلوبة، وحدد القسم والمسؤول المباشر'
          : 'Please complete all required fields, select department, and choose supervisor'
      );
      return;
    }

    if (!isSignupPasswordValid) {
      setError(
        isAr
          ? 'يجب أن تستوفي كلمة المرور جميع شروط الأمان الموضحة'
          : 'Password must meet all requirement criteria'
      );
      return;
    }

    setSaving(true);
    const r = await onSignup({
      name: name.trim(),
      password: signupPassword,
      role,
      departmentId,
      avatar,
      email: email.trim().toLowerCase(),
      parentId
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error || (isAr ? 'تعذر إنشاء الحساب' : 'Unable to create account'));
      return;
    }
    if (r.user) {
      onLogin(r.user);
    }
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#050507] text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <LongBeachLogo showText={false} size="sm" variant="light" />
            <div>
              <b>LONG BEACH RESORT & SPA</b>
              <div className="text-xs text-zinc-500">
                {isAr ? 'مركز العمليات وإدارة المهام' : 'Operations & Task Management'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="px-3 py-2 border border-white/10 rounded-xl text-xs flex gap-2 cursor-pointer hover:bg-white/[.04] transition-colors"
          >
            <Languages className="w-4" />
            {language === 'en' ? 'العربية' : 'English'}
          </button>
        </div>

        {mode === 'login' ? (
          /* ============================================================ */
          /*                       SIGN IN FORM                           */
          /* ============================================================ */
          <div className="max-w-md mx-auto">
            <form
              onSubmit={doLogin}
              className="bg-white/[.03] border border-white/10 rounded-2xl p-6 sm:p-8 h-fit shadow-xl"
            >
              <div className="flex justify-center mb-4">
                <LongBeachLogo size="md" variant="brand" layout="vertical" showText={false} />
              </div>

              <h1 className="text-2xl font-black text-center mb-1">
                {isAr ? 'تسجيل الدخول إلى حسابك' : 'Sign in to your account'}
              </h1>
              <p className="text-xs text-zinc-400 mb-6 text-center">
                {isAr
                  ? 'أدخل اسمك أو بريدك الإلكتروني الوظيفي وكلمة المرور.'
                  : 'Enter your name or work email and your password.'}
              </p>

              {/* Name or Work Email */}
              <label className="text-xs text-zinc-400 block mb-1">
                {isAr ? 'الاسم أو البريد الإلكتروني' : 'Name or Work Email'}
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={e => {
                  setIdentifier(e.target.value);
                  if (error) setError('');
                }}
                className="mb-4 w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder={isAr ? 'أدخل اسمك أو بريدك الإلكتروني' : 'Enter name or work email'}
              />

              {/* Password */}
              <label className="text-xs text-zinc-400 block mb-1">
                {isAr ? 'كلمة المرور' : 'Password'}
              </label>
              <div className="relative mb-5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                  placeholder={isAr ? 'أدخل كلمة المرور' : 'Enter password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword
                      ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password')
                      : (isAr ? 'إظهار كلمة المرور' : 'Show password')
                  }
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className="w-full p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold flex justify-center items-center gap-2 cursor-pointer transition-colors text-white text-sm disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>{isAr ? 'دخول' : 'Sign In'}</span>
                  </>
                )}
              </button>

              {error && <p className="text-rose-400 text-sm mt-3 text-center">{error}</p>}

              {/* Switch to Signup */}
              <div className="mt-6 pt-5 border-t border-white/10">
                <p className="text-sm text-zinc-400 mb-3 text-center">
                  {isAr ? 'ليس لديك حساب؟' : "Don't have an account?"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className="w-full p-3 rounded-xl border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 flex justify-center items-center gap-2 font-semibold cursor-pointer transition-colors text-sm"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>{isAr ? 'إنشاء حساب جديد' : 'Create Account / Sign Up'}</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ============================================================ */
          /*                       SIGN UP FORM                           */
          /* ============================================================ */
          <form
            onSubmit={doSignup}
            className="max-w-xl mx-auto bg-white/[.03] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="text-sm text-zinc-400 hover:text-white flex gap-2 mb-5 cursor-pointer transition-colors"
            >
              <ArrowLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
              <span>{isAr ? 'الرجوع لتسجيل الدخول' : 'Back to Sign In'}</span>
            </button>

            <h1 className="text-2xl font-black mb-2">{isAr ? 'إنشاء حساب جديد' : 'Create Account'}</h1>
            <p className="text-xs text-zinc-400 mb-6">
              {isAr
                ? 'تسجيل موظف أو مدير وتحديد القسم والهيكل التنظيمي للمنتجع.'
                : 'Register staff or manager within the hotel reporting structure and department.'}
            </p>

            <div className="grid gap-4">
              {/* Name */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'الاسم بالكامل' : 'Full Name'}
                </label>
                <input
                  value={name}
                  required
                  onChange={e => setName(e.target.value)}
                  placeholder={isAr ? 'الاسم' : 'Full Name'}
                  className="p-3 w-full rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'البريد الإلكتروني الوظيفي' : 'Job Email'}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={isAr ? 'البريد الإلكتروني الوظيفي' : 'Job Email'}
                  className="p-3 w-full rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'المستوى الوظيفي (Role)' : 'Role'}
                </label>
                <select
                  value={role}
                  onChange={e => {
                    setRole(e.target.value as any);
                    setParentId('');
                  }}
                  className="p-3 w-full rounded-xl bg-black border border-white/10 text-sm text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="Director">{isAr ? 'مدير إدارة (Director)' : 'Director'}</option>
                  <option value="Manager">{isAr ? 'مدير قسم (Manager)' : 'Manager'}</option>
                  <option value="Assistant">{isAr ? 'مساعد / منسق (Assistant)' : 'Assistant'}</option>
                </select>
              </div>

              {/* Department Selection */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'القسم / الإدارة (Department) *' : 'Department *'}
                </label>
                <select
                  value={departmentId}
                  required
                  onChange={e => {
                    setDepartmentId(e.target.value);
                    setParentId('');
                  }}
                  className="p-3 w-full rounded-xl bg-black border border-white/10 text-sm text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  {deptList.map(d => (
                    <option key={d.id} value={d.id}>
                      {isAr ? d.nameAr : d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reports To */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'يتبع إلى / المسؤول المباشر (Reports To) *' : 'Reports To / Supervisor *'}
                </label>
                <select
                  value={parentId}
                  required
                  onChange={e => setParentId(e.target.value)}
                  className="p-3 w-full rounded-xl bg-black border border-white/10 text-sm text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="">
                    {leaders.length === 0
                      ? isAr
                        ? 'لا يوجد مسؤولين مسجلين في هذا القسم حالياً'
                        : 'No supervisors in this department yet'
                      : isAr
                      ? 'اختر المسؤول المباشر...'
                      : 'Select supervisor...'}
                  </option>
                  {leaders.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.title || u.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Password with rules */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    required
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    placeholder={isAr ? 'كلمة المرور' : 'Password'}
                    className="p-3 w-full rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    aria-label={
                      showSignupPassword
                        ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password')
                        : (isAr ? 'إظهار كلمة المرور' : 'Show password')
                    }
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Rules Indicators */}
                <div className="mt-2.5 p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5 text-xs">
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
                </div>
              </div>

              {/* Avatar Upload */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  {isAr ? 'الصورة الشخصية' : 'Personal Image'}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleImage(e.target.files?.[0])}
                    className="p-3 flex-1 rounded-xl bg-black/30 border border-white/10 text-xs text-zinc-400 cursor-pointer"
                  />
                  {avatar && (
                    <img
                      src={avatar}
                      className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
                      alt="Preview"
                    />
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || !isSignupPasswordValid}
                className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white cursor-pointer transition-colors text-sm disabled:opacity-50"
              >
                {saving
                  ? isAr
                    ? 'جاري الإنشاء...'
                    : 'Creating...'
                  : isAr
                  ? 'إنشاء الحساب'
                  : 'Create Account'}
              </button>

              {error && <p className="text-rose-400 text-sm">{error}</p>}

              <p className="text-xs text-zinc-500">
                {isAr
                  ? 'يتم وضع المدير (Director) تحت المدير العام، والمدير (Manager) تحت مدير إدارة، والمساعد تحت مدير القسم المختار. هذا يحافظ على خصوصية صلاحيات المهام وتسلسلها الهرمي.'
                  : 'Director is placed under GM, Manager under a Director, and Assistant under a Manager in the selected department. This keeps task permissions private and hierarchical.'}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
