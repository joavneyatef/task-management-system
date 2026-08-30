import React, { useState } from 'react';
import { User, UserRole, Department } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Shield, KeyRound, UserSquare2, Check, RefreshCw, Upload, Trash2, UserPlus, X, Database, Users, Palette, Copy, Image, FileCode, Eye, EyeOff, Building2, Plus } from 'lucide-react';
import BackupRestorePanel from './BackupRestorePanel';
import LongBeachLogo from './LongBeachLogo';

interface AdminPanelProps {
  users: User[];
  currentUser: User;
  onUpdateUsers: (
    updatedUsers: User[],
    optionalNotification?: {
      title: string;
      message: string;
      category: 'Task' | 'Checklist' | 'Project' | 'Alert' | 'System';
    }
  ) => void;
  onAddNotification: (title: string, message: string, category: 'Task' | 'Checklist' | 'Project' | 'Alert' | 'System') => void;
  serverEnv: 'production' | 'test';
  onEnvironmentChanged: (env: 'production' | 'test', updatedState: any) => void;
  onRefreshAppState: () => void;
  departments: Department[];
  onUpdateDepartments: (updatedDepartments: Department[]) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150', // George
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', // Ahmed Matar
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', // Ahmed Khaled
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150', // Ahmed Adel
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', // Mohamed Emad
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
];

export default function AdminPanel({
  users,
  currentUser,
  onUpdateUsers,
  onAddNotification,
  serverEnv,
  onEnvironmentChanged,
  onRefreshAppState,
  departments,
  onUpdateDepartments
}: AdminPanelProps) {
  const { language } = useLanguage();
  const [adminSubTab, setAdminSubTab] = useState<'departments' | 'backups' | 'branding'>('departments');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isAddingNewUser, setIsAddingNewUser] = useState(false);

  // Departments management local state
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [newDeptManagerIds, setNewDeptManagerIds] = useState<string[]>([]);

  const handleAddDepartment = () => {
    if (!newDeptName.trim()) return;
    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name: newDeptName.trim(),
      description: newDeptDesc.trim(),
      managerIds: newDeptManagerIds,
      isActive: true
    };
    onUpdateDepartments([...departments, newDept]);
    onAddNotification(
      isAr ? 'تم إنشاء قسم جديد' : 'New Department Created',
      isAr ? `تم إنشاء قسم "${newDept.name}" بواسطة ${currentUser.name}.` : `Department "${newDept.name}" was created by ${currentUser.name}.`,
      'System'
    );
    setNewDeptName('');
    setNewDeptDesc('');
    setNewDeptManagerIds([]);
    setIsAddingDept(false);
  };

  const handleToggleDeptActive = (deptId: string) => {
    onUpdateDepartments(departments.map(d => d.id === deptId ? { ...d, isActive: !d.isActive } : d));
  };

  const handleDeleteDepartment = (deptId: string) => {
    onUpdateDepartments(departments.filter(d => d.id !== deptId));
  };

  const handleToggleDeptManager = (deptId: string, userId: string) => {
    onUpdateDepartments(departments.map(d => {
      if (d.id !== deptId) return d;
      const has = d.managerIds.includes(userId);
      return { ...d, managerIds: has ? d.managerIds.filter(id => id !== userId) : [...d.managerIds, userId] };
    }));
  };

  const handleAssignUserDepartment = (userId: string, deptId: string) => {
    onUpdateUsers(users.map(u => u.id === userId ? { ...u, departmentId: deptId || undefined, updatedAt: new Date().toISOString() } : u));
  };

  const [customLogo, setCustomLogo] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('custom_hotel_logo') : null;
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      onAddNotification(
        isAr ? 'عذراً، حجم ملف الصورة أكبر من 5 ميجابايت!' : 'Sorry, the image file is larger than 5MB!',
        isAr ? 'حجم الملف زائد' : 'File Size Limit',
        'System'
      );
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      localStorage.setItem('custom_hotel_logo', base64String);
      setCustomLogo(base64String);
      window.dispatchEvent(new Event('logo-changed'));
      onAddNotification(
        isAr ? 'شعار الفندق' : 'Hotel Logo',
        isAr ? 'تم تحديث شعار الفندق بنجاح وتطبيقه على كافة الأقسام!' : 'Hotel logo updated successfully and propagated to all areas!',
        'System'
      );
    };
    reader.readAsDataURL(file);
  };

  const handleLogoClear = () => {
    localStorage.removeItem('custom_hotel_logo');
    setCustomLogo(null);
    window.dispatchEvent(new Event('logo-changed'));
    onAddNotification(
      isAr ? 'شعار الفندق' : 'Hotel Logo',
      isAr ? 'تمت إزالة الشعار المخصص والعودة للشعار الأصلي!' : 'Custom logo removed and reverted back to default SVG logo!',
      'System'
    );
  };

  // Edit user state
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add user state
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Assistant');
  const [newTitle, setNewTitle] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAvatar, setNewAvatar] = useState(PRESET_AVATARS[0]);
  const [newPin, setNewPin] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [newSkillsStr, setNewSkillsStr] = useState('');

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const isAr = language === 'ar';

  // Automatically select first user once users are loaded (if not adding)
  React.useEffect(() => {
    if (!selectedUserId && users.length > 0 && !isAddingNewUser) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId, isAddingNewUser]);

  // Fallback map of pins if not already customized (matches LoginPage static pins)
  const fallbackPins: Record<string, string> = {
    sarah: '123456',
    david: '234567',
    ahmed: '345678',
    elena: '456789',
    john: '567890'
  };

  const selectedEditUser = users.find(u => u.id === selectedUserId) || null;

  React.useEffect(() => {
    if (selectedEditUser) {
      setName(selectedEditUser.name);
      setAvatar(selectedEditUser.avatar);
      setPin(selectedEditUser.pin || fallbackPins[selectedEditUser.id] || '123456');
      setSuccessMsg(null);
      setDeleteConfirmId(null);
    }
  }, [selectedUserId, selectedEditUser?.name, selectedEditUser?.avatar, selectedEditUser?.pin]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'edit' | 'add') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if (target === 'edit') {
            setAvatar(reader.result);
          } else {
            setNewAvatar(reader.result);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEditUser) return;

    if (!name.trim()) {
      alert(isAr ? 'الرجاء إدخال اسم صحيح' : 'Please enter a valid name');
      return;
    }

    if (pin.length !== 6 || isNaN(Number(pin))) {
      alert(isAr ? 'كلمة المرور مطلوبة' : 'Password is required');
      return;
    }

    const updatedUsers = users.map(u => {
      if (u.id === selectedEditUser.id) {
        return {
          ...u,
          name,
          avatar,
          pin,
          updatedAt: new Date().toISOString()
        };
      }
      return u;
    });

    onUpdateUsers(updatedUsers, {
      title: isAr ? 'تعديل بيانات فني' : 'Crew Credentials Altered',
      message: isAr
        ? `قام "${currentUser.name}" بتحديث ملف ${name} (الاسم والرمز السري والصورة) بنجاح.`
        : `Manager "${currentUser.name}" successfully updated profile settings for "${name}".`,
      category: 'System'
    });

    setSuccessMsg(
      isAr
        ? 'تم حفظ التحديثات وتعميم كود التوثيق الجديد بأمان!'
        : 'Credentials synchronized successfully across all hubs.'
    );

    setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
  };

  const handleAddNewUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUsername.trim()) {
      alert(isAr ? 'برجاء ملئ الحقول المطلوبة' : 'Please fill in all required fields');
      return;
    }

    if (!newPin.trim()) {
      alert(isAr ? 'كلمة المرور مطلوبة' : 'Password is required');
      return;
    }

    // Check if username already exists
    const usernameTaken = users.some(u => u.username === newUsername.trim().toLowerCase());
    if (usernameTaken) {
      alert(isAr ? 'اسم المستخدم هذا مستخدم بالفعل!' : 'This username is already taken!');
      return;
    }

    const newId = `user-${Date.now()}`;
    const newUser: User = {
      id: newId,
      username: newUsername.trim().toLowerCase(),
      name: newName.trim(),
      role: newRole,
      title: newTitle.trim() || 'IT Assistant',
      email: newEmail.trim() || `${newUsername.trim()}@longbeach-resort.com`,
      phone: newPhone.trim() || '+20 100 000 0000',
      avatar: newAvatar,
      status: 'Active',
      skills: newSkillsStr.split(',').map(s => s.trim()).filter(Boolean),
      pin: newPin,
      password: newPin,
      departmentId: newDeptId || undefined,
      parentId: newParentId || undefined,
      managerId: newParentId || undefined,
      updatedAt: new Date().toISOString()
    };

    onUpdateUsers([...users, newUser], {
      title: isAr ? 'إضافة فني جديد لطاقم العمل' : 'New Crew Member Registered',
      message: isAr
        ? `قام "${currentUser.name}" بتسجيل الفني الجديد "${newUser.name}" بنجاح.`
        : `Manager "${currentUser.name}" successfully registered new technician "${newUser.name}".`,
      category: 'System'
    });

    // Reset states
    setNewName('');
    setNewUsername('');
    setNewPin('');
    setNewTitle('');
    setNewEmail('');
    setNewPhone('');
    setNewSkillsStr('');
    setIsAddingNewUser(false);
    setSelectedUserId(newId);

    setSuccessMsg(
      isAr
        ? `تم إضافة وتوثيق الموظف الجديد "${newUser.name}" بنجاح!`
        : `Staff profile for ${newUser.name} propagated successfully across all hubs.`
    );
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser.id) {
      alert(isAr ? 'لا يمكنك حذف حسابك الحالي أثناء تسجيل الدخول به!' : 'You cannot delete your own active account while logged in!');
      return;
    }

    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUser.id
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      const remainingUsers = users.filter(u => u.id !== userId);

      onUpdateUsers(remainingUsers, {
        title: isAr ? 'حذف فني من طاقم العمل' : 'Crew Member Removed',
        message: isAr
          ? `قام "${currentUser.name}" بإلغاء اعتماد وحذف حساب الفني "${userToDelete.name}".`
          : `Manager "${currentUser.name}" removed crew member "${userToDelete.name}" from active registers.`,
        category: 'System'
      });

      setDeleteConfirmId(null);
      if (selectedUserId === userId) {
        setSelectedUserId(remainingUsers[0]?.id || null);
      }

      setSuccessMsg(
        isAr
          ? `تم إزالة حساب "${userToDelete.name}" بنجاح من قاعدة البيانات.`
          : `User registration for ${userToDelete.name} destroyed securely.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
      alert(isAr ? 'فشل حذف الموظف من الخادم' : 'Failed to delete staff member from server');
    }
  };

  return (
    <div className="w-full bg-[#0b0c10]/40 border border-white/5 rounded-2xl p-6 glass-heavy font-sans" id="admin-panel-container">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-4 mb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-500/15 border border-indigo-500/25 rounded-xl flex items-center justify-center text-indigo-400">
            <Shield className="h-5 w-5 shrink-0" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              {adminSubTab === 'backups'
                ? (isAr ? 'مركز النسخ الاحتياطي السحابي والاستعادة ركامات' : 'Systems Backup & Cloud Recovery Hub')
                : adminSubTab === 'branding'
                ? (isAr ? 'رفع وتعديل شعار الفندق التفاعلي' : 'Hotel Brand Image & Dynamic Logo Uploader')
                : (isAr ? 'إدارة الأقسام والإدارات' : 'Departments & Divisions')}
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {adminSubTab === 'branding'
                ? (isAr ? 'ارفع صورة شعار منتجع لونج بيتش لتخصيص الهوية والتقارير والواجهات حياً فورياً' : 'Upload custom brand images for instant full-system application inside all headers, reports, and logins.')
                : (isAr ? 'مصرحة حصرياً لمدير القطاع ومدير الإدارة (التحكم الأمني المتقدم)' : 'Restricted to Sector Director & Operations Director administrative clearances.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-indigo-300 text-[10px] uppercase font-mono tracking-widest shrink-0">
            {isAr ? 'حساب مدير معتمد' : 'AUTHORIZED ACCESS'}
          </div>
        </div>
      </div>

      {/* Admin Panel Sub-tabs Routing Selector */}
      <div className="flex flex-wrap gap-2.5 border-b border-white/5 pb-4 mb-6">
        <button
          onClick={() => setAdminSubTab('departments')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
            adminSubTab === 'departments'
              ? 'bg-indigo-600/15 border border-indigo-500/40 text-indigo-300 shadow-md shadow-indigo-500/5'
              : 'bg-black/20 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>{isAr ? 'الأقسام والإدارات' : 'Departments'}</span>
        </button>
        <button
          onClick={() => setAdminSubTab('backups')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
            adminSubTab === 'backups'
              ? 'bg-indigo-600/15 border border-indigo-500/40 text-indigo-300 shadow-md shadow-indigo-550/5'
              : 'bg-black/20 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Database className="h-4 w-4" />
          <span>{isAr ? 'النسخ الاحتياطي والاستعادة ركامات' : 'Backup & Restore Hub'}</span>
        </button>
        <button
          onClick={() => setAdminSubTab('branding')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
            adminSubTab === 'branding'
              ? 'bg-indigo-600/15 border border-indigo-500/40 text-indigo-300 shadow-md shadow-indigo-550/5'
              : 'bg-black/20 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Palette className="h-4 w-4 text-orange-400 animate-pulse" />
          <span>{isAr ? 'الهوية البصرية وشعار المنتجع' : 'Brand Identity & Logo Kit'}</span>
        </button>
      </div>

      {adminSubTab === 'departments' ? (
        <div className="animate-in fade-in duration-200 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400 max-w-lg leading-relaxed">
              {isAr
                ? 'إدارة الأقسام (مثل تكنولوجيا المعلومات، الصيانة، الاستقبال...). كل قسم له مديرون وموظفون مرتبطون به، ويستخدم في قوائم الفحص اليومية وتوزيع الشكاوى.'
                : 'Manage departments (e.g. IT, Maintenance, Front Office...). Each department has managers and staff linked to it, used for daily checklists and complaint routing.'}
            </p>
            <button
              onClick={() => setIsAddingDept(!isAddingDept)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shrink-0"
            >
              {isAddingDept ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              <span>{isAddingDept ? (isAr ? 'إلغاء' : 'Cancel') : (isAr ? 'إضافة قسم' : 'Add Department')}</span>
            </button>
          </div>

          {isAddingDept && (
            <div className="p-4 bg-white/2 border border-white/10 rounded-2xl space-y-3">
              <input
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder={isAr ? 'اسم القسم' : 'Department name'}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/40"
              />
              <input
                value={newDeptDesc}
                onChange={e => setNewDeptDesc(e.target.value)}
                placeholder={isAr ? 'وصف مختصر (اختياري)' : 'Short description (optional)'}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/40"
              />
              <div>
                <span className="block text-[10px] text-zinc-500 font-mono uppercase mb-1.5">{isAr ? 'المديرون المسؤولون' : 'Responsible managers'}</span>
                <div className="flex flex-wrap gap-2">
                  {users.filter(u => u.role === 'Manager').map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setNewDeptManagerIds(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        newDeptManagerIds.includes(u.id)
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                          : 'bg-black/20 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleAddDepartment}
                disabled={!newDeptName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isAr ? 'حفظ القسم' : 'Save Department'}</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.length === 0 && (
              <p className="text-xs text-zinc-500 col-span-2">{isAr ? 'لا يوجد أقسام مضافة بعد.' : 'No departments added yet.'}</p>
            )}
            {departments.map(dept => (
              <div key={dept.id} className="p-4 bg-[#090a10]/60 border border-white/5 rounded-2xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">{dept.name}</h4>
                    {dept.description && <p className="text-[10px] text-zinc-500 mt-0.5">{dept.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleDeptActive(dept.id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase border cursor-pointer ${
                        dept.isActive
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                          : 'bg-zinc-500/10 border-zinc-500/25 text-zinc-400'
                      }`}
                    >
                      {dept.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[9px] text-zinc-500 font-mono uppercase mb-1">{isAr ? 'المديرون' : 'Managers'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {users.filter(u => u.role === 'Manager').map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleToggleDeptManager(dept.id, u.id)}
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold border cursor-pointer ${
                          dept.managerIds.includes(u.id)
                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                            : 'bg-black/20 border-white/10 text-zinc-500'
                        }`}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[9px] text-zinc-500 font-mono uppercase mb-1">{isAr ? 'الموظفون التابعون' : 'Assigned staff'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {users.filter(u => u.departmentId === dept.id).map(u => (
                      <span key={u.id} className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                        {u.name}
                      </span>
                    ))}
                    {users.filter(u => u.departmentId === dept.id).length === 0 && (
                      <span className="text-[9px] text-zinc-600">{isAr ? 'لا يوجد موظفون بعد — عيّنهم من تبويب الطاقم' : 'No staff yet — assign from the Crew tab'}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : adminSubTab === 'backups' ? (
        <div className="animate-in fade-in duration-200">
          <BackupRestorePanel
            currentUser={currentUser}
            serverEnv={serverEnv}
            onEnvironmentChanged={onEnvironmentChanged}
            onRefreshAppState={onRefreshAppState}
            onAddNotification={onAddNotification}
          />
        </div>
      ) : (
        <div className="animate-in fade-in duration-200 space-y-6">
          {/* Logo Upload Station replacing the Static Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Column 1: Active Logo Simulator View (4 cols) */}
            <div className="lg:col-span-4 flex flex-col border border-white/5 bg-[#090a10]/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-white/5 bg-white/2">
                <span className="block text-[10px] uppercase font-mono font-bold text-white">
                  🔍 {isAr ? 'معاينة الشعار النشط بالمنصة' : 'Active Logo Display Mock'}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {isAr ? 'عرض حي للشعار عبر مكونات النظام' : 'LIVE RENDERING ENVIRONMENT'}
                </span>
              </div>
              
              <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center p-6 bg-radial-at-t from-[#13141f] via-[#090a10] to-[#050510] gap-6">
                <div className="space-y-2 text-center">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                    {isAr ? 'الشعار رأسي المظهر' : 'Vertical Presentation'}
                  </span>
                  <div className="p-4 bg-black/30 rounded-xl border border-white/5 inline-block">
                    <LongBeachLogo size="md" variant="brand" layout="vertical" showText={true} />
                  </div>
                </div>

                <div className="h-px w-full bg-white/5" />

                <div className="space-y-2 text-center w-full">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                    {isAr ? 'النسخة الأفقية العريضة' : 'Horizontal Menu Layout'}
                  </span>
                  <div className="p-3 bg-black/30 rounded-xl border border-white/5 w-full flex justify-center">
                    <LongBeachLogo size="sm" variant="brand" layout="horizontal" showText={true} />
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Upload Station Panel (8 cols) */}
            <div className="lg:col-span-8 flex flex-col border border-white/5 bg-[#090a10]/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
                <div className="text-left">
                  <span className="block text-[10px] uppercase font-mono font-bold text-white">
                    📤 {isAr ? 'رفع شعار المنتجع الجديد' : 'Hotel Logo Uploader'}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {isAr ? 'استبدال الشعار بصورة مخصصة' : 'CUSTOM HOTEL BRAND ASSET MANAGEMENT'}
                  </span>
                </div>
                {customLogo && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[8px] font-bold uppercase">
                    {isAr ? 'شعار مخصص نشط' : 'Custom Image Active'}
                  </span>
                )}
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed text-left">
                    {isAr 
                      ? 'يمكنك الآن رفع صورة الشعار الفني الحقيقي لمنتجع لونج بيتش لاستبدال الهوية الافتراضية بنقرة واحدة. ننصح بملفات صور شفافة (PNG أو WebP أو SVG) لضمان التوافق التام مع الخلفيات والمظهر الفاخر لمنصة الإشراف والمجالس.'
                      : 'Upload the real brand logo file for Long Beach Resort to replace the default vector identity. Transparent background files (.png, .webp, or .svg) are highly recommended to blend perfectly with deep navy backgrounds and light sheets.'}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Drag and Drop Zone */}
                    <div className="border border-dashed border-white/10 hover:border-[#ff8c00]/30 bg-[#06070a]/50 rounded-xl p-6 transition-all relative flex flex-col items-center justify-center text-center gap-2 group cursor-pointer min-h-[140px]">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        id="hotel-logo-file-picker"
                      />
                      <Upload className="h-8 w-8 text-zinc-500 group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-300" />
                      <div className="space-y-1">
                        <span className="block text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {isAr ? 'اختر ملف الشعار' : 'Choose Logo Image'}
                        </span>
                        <span className="block text-[10px] text-zinc-500 font-mono">
                          PNG, JPG, WEBP, SVG
                        </span>
                      </div>
                    </div>

                    {/* Logo Information & Parameters Check */}
                    <div className="bg-black/25 rounded-xl p-4 border border-white/5 space-y-2.5 text-left text-[11px] font-mono text-zinc-400">
                      <span className="block text-white font-bold text-[10px] uppercase tracking-wider text-zinc-300">
                        📋 {isAr ? 'متطلبات وضوابط فنية:' : 'Technical Guidelines:'}
                      </span>
                      <div className="space-y-1.5 leading-relaxed">
                        <p>🔹 {isAr ? 'حجم الملف الأقصى المقترح: ٥ ميجابايت' : 'Maximum suggested size: 5 MB'}</p>
                        <p>🔹 {isAr ? 'أبعاد متساوية ونسبة عرض لارتفاع مربعة' : 'Symmetrical 1:1 or square aspect ratio'}</p>
                        <p>🔹 {isAr ? 'الشفافية مفضلة للمظهر الموحد للفندق' : 'Transparency is essential for dark-mode headers'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5">
                  {customLogo && (
                    <button
                      onClick={handleLogoClear}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>{isAr ? 'استعادة الشعار الأصلي المطور' : 'Reset to Default SVG Logo'}</span>
                    </button>
                  )}
                  
                  <label
                    htmlFor="hotel-logo-file-picker"
                    className="flex-1 text-center py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 hover:scale-[1.01]"
                  >
                    <Image className="h-4 w-4 shrink-0" />
                    <span>{isAr ? 'تحديث الشعار بالصورة المرفوعة' : 'Upload New Brand Image'}</span>
                  </label>
                </div>
              </div>
            </div>

          </div>

          {/* Guidelines on where the brand is injected */}
          <div className="p-4 bg-white/2 border border-white/5 rounded-2xl block text-left">
            <h4 className="text-xs font-bold text-white mb-2 font-mono flex items-center gap-1.5">
              <FileCode className="h-4 w-4 text-orange-400" />
              {isAr ? 'الأنظمة والتكامل الفعلي النشط في منصة التشغيل:' : 'COMPREHENSIVE ENTERPRISE SYSTEM INTEGRATION INDEX:'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[10px] text-zinc-400 font-mono">
              <div className="p-2 border border-white/5 bg-black/20 rounded-xl space-y-0.5">
                <p className="text-white font-bold">{isAr ? '١. الأشرطة الجانبية والرؤوس الرقمية' : '1. Digital Sidebars & Headers'}</p>
                <p className="text-[9px] text-zinc-500">{isAr ? 'يستخدم النسخة الأفقية المدمجة تلقائياً حسب حجم الشاشة.' : 'Uses compact responsive horizontal variant natively.'}</p>
              </div>
              <div className="p-2 border border-white/5 bg-black/20 rounded-xl space-y-0.5">
                <p className="text-white font-bold">{isAr ? '٢. شاشة تسجيل الدخول الآمنة' : '2. Secure Login Screen'}</p>
                <p className="text-[9px] text-zinc-500">{isAr ? 'يستخدم التخطيط الرأسي الكامل عند عدم اختيار مستخدم.' : 'Uses full luxury vertical layout when no operator selected.'}</p>
              </div>
              <div className="p-2 border border-white/5 bg-black/20 rounded-xl space-y-0.5">
                <p className="text-white font-bold">{isAr ? '٣. تقارير PDF القابلة للطباعة' : '3. Printable PDF Reports'}</p>
                <p className="text-[9px] text-zinc-500">{isAr ? 'يضيف تصميماً عالي التباين تلقائياً أثناء الطباعة.' : 'Injects high contrast stencils automatically inside window.print() callbacks.'}</p>
              </div>
              <div className="p-2 border border-white/5 bg-black/20 rounded-xl space-y-0.5">
                <p className="text-white font-bold">{isAr ? '٤. نظام هوية الطاقم' : '4. Roster Identity System'}</p>
                <p className="text-[9px] text-zinc-500">{isAr ? 'يزامن لاحقة البريد الإلكتروني تلقائياً مع نطاق @longbeach-resort.com.' : 'Syncs email suffixes automatically to @longbeach-resort.com domains.'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
