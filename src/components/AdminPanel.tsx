import React, { useState } from 'react';
import { User, UserRole, Department } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Shield, KeyRound, UserSquare2, Check, RefreshCw, Trash2, UserPlus, X, Users, Copy, Eye, EyeOff, Plus } from 'lucide-react';

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
  /** @deprecated Backup/Restore & environment switching were removed from the Admin panel. Kept optional for callers. */
  serverEnv?: 'production' | 'test';
  onEnvironmentChanged?: (env: 'production' | 'test', updatedState: any) => void;
  onRefreshAppState?: () => void;
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
  departments,
  onUpdateDepartments
}: AdminPanelProps) {
  const { language } = useLanguage();
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
              {isAr ? 'إدارة الأقسام والإدارات' : 'Departments & Divisions'}
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {isAr ? 'مصرحة حصرياً لمدير القطاع ومدير الإدارة (التحكم الأمني المتقدم)' : 'Restricted to Sector Director & Operations Director administrative clearances.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-indigo-300 text-[10px] uppercase font-mono tracking-widest shrink-0">
            {isAr ? 'حساب مدير معتمد' : 'AUTHORIZED ACCESS'}
          </div>
        </div>
      </div>

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
            {departments.map(dept => {
              const deptManagers = users.filter(u => u.role === 'Manager');
              const deptStaff = users.filter(u => u.departmentId === dept.id);
              return (
              <div
                key={dept.id}
                className={`p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3 shadow-sm transition-colors hover:border-white/20 ${dept.isActive ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{dept.name}</h4>
                    {dept.description && <p className="text-[10px] text-zinc-500 mt-0.5">{dept.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleDeptActive(dept.id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase border cursor-pointer transition-colors ${
                        dept.isActive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/20'
                      }`}
                    >
                      {dept.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept.id)}
                      aria-label={isAr ? 'حذف القسم' : 'Delete department'}
                      className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 cursor-pointer transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] text-zinc-400 font-mono uppercase tracking-wider mb-1.5">{isAr ? 'المديرون' : 'Managers'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {deptManagers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleToggleDeptManager(dept.id, u.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors ${
                          dept.managerIds.includes(u.id)
                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                            : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:border-white/25'
                        }`}
                      >
                        {u.name}
                      </button>
                    ))}
                    {deptManagers.length === 0 && (
                      <span className="text-[10px] text-zinc-500">{isAr ? 'لا يوجد مديرون مضافون بعد' : 'No managers added yet'}</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] text-zinc-400 font-mono uppercase tracking-wider mb-1.5">{isAr ? 'الموظفون التابعون' : 'Assigned staff'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {deptStaff.map(u => (
                      <span key={u.id} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
                        {u.name}
                      </span>
                    ))}
                    {deptStaff.length === 0 && (
                      <span className="text-[10px] text-zinc-500">{isAr ? 'لا يوجد موظفون معينون بعد' : 'No staff assigned yet'}</span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
