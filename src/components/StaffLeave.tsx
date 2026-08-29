import React from 'react';
import { User, UserStatus } from '../types';
import { Calendar, UserCheck, UserMinus, ShieldCheck, Mail, Phone, Settings, Activity } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface StaffLeaveProps {
  users: User[];
  currentUser: User;
  onUpdateUsers: (
    users: User[],
    optionalNotification?: {
      title: string;
      message: string;
      category: 'Task' | 'Checklist' | 'Project' | 'Alert' | 'System';
    }
  ) => void;
  onAddNotification: (title: string, message: string, category: 'System' | 'Alert') => void;
}

export default function StaffLeave({
  users,
  currentUser,
  onUpdateUsers,
  onAddNotification
}: StaffLeaveProps) {
  const { language, t, isRtl } = useLanguage();
  
  const handleStatusChange = (userId: string, newStatus: UserStatus) => {
    const userToChange = users.find(u => u.id === userId);
    if (!userToChange) return;

    if (userId === currentUser.id && newStatus === 'On Leave') {
      const confirmSelf = window.confirm(
        language === 'ar'
          ? 'أنت مسجل الدخول حالياً بهذا الحساب. إن تفعيل حالة "في إجازة" سيمنعك مؤقتاً من إدارة المهام الفنية وتفعيل التوزيع التلقائي. هل تود الاستمرار؟'
          : 'You are currently logged in as this employee. Toggling status to "On Leave" will log you out of operational writing duties. Direct automatic task delegation will active. Proceed?'
      );
      if (!confirmSelf) return;
    }

    const updated = users.map(u => {
      if (u.id === userId) {
        return { 
          ...u, 
          status: newStatus,
          updatedAt: new Date().toISOString()
        };
      }
      return u;
    });

    // Create correct notification payload based on state
    const notifPayload = newStatus === 'On Leave'
      ? {
          title: language === 'ar' ? 'تفعيل جدول تفويض العمل للطاقم' : 'Staff Roster Change Delegation Active',
          message: language === 'ar' 
            ? `قام الفني "${userToChange.name}" (${userToChange.title}) بتحويل حالته إلى "في إجازة". تم تفعيل نظام التوزيع التلقائي للمهام.`
            : `${userToChange.name} (${userToChange.title}) switched status to "On Leave". Automated redistribution system executed successfully.`,
          category: 'System' as const
        }
      : {
          title: language === 'ar' ? 'تحديث نشاط الطاقم الفني' : 'Staff Roster Change Active',
          message: language === 'ar'
            ? `قام الفني "${userToChange.name}" بتسجيل دخوله وبدء استلام مهام المناوبة الحالية.`
            : `${userToChange.name} checked in and is currently "Active" on core operations queues.`,
          category: 'System' as const
        };

    // Update with both users and the notification atomically to prevent asynchronous state races
    onUpdateUsers(updated, notifPayload);

    if (newStatus === 'On Leave') {
      alert(
        language === 'ar'
          ? `الموظف ${userToChange.name} مسجل حالياً في إجازة. تم إلغاء ربط المهام المفتوحة به وإعادتها فوراً إلى سلة المهام المشتركة للحفاظ على مستويات اتفاقية الخدمة (SLA).`
          : `${userToChange.name} is now flagged as On Leave. Any open uncompleted tasks assigned to them have been auto-redistributed or set back to the Open Pool to maintain hotel SLA timelines.`
      );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Informative layout info card */}
      <div className="rounded-xl border border-white/5 bg-white/2 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 glass">
        <div>
          <h3 className="font-display font-bold text-white text-base">
            {language === 'ar' ? 'سجل حضور وكفاءة طاقم العمل' : 'IT Attendance & Skill Roster'}
          </h3>
          <p className="text-xs text-zinc-400">
            {language === 'ar' ? 'إدارة حضور الطاقم وتتبع الكفاءات مع التفويض التلقائي والذكي للمهام لضمان اتفاقيات مستويات الخدمة.' : 'Manage crew leaves and track technician skill proficiencies. Redistribution engines fire automatically on status updates.'}
          </p>
        </div>

        <div className="text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 glass">
          <Activity className="h-4 w-4 animate-pulse text-indigo-400" /> 
          {language === 'ar' ? 'محرك إعادة التوزيع: نشط ومكتمل' : 'REDISTRIBUTOR ENGINE: INTEGRATED'}
        </div>
      </div>

      {/* Roster Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map(user => {
          const isActive = user.status === 'Active';
          const isOnLeave = user.status === 'On Leave';
          const isOffDuty = user.status === 'Off Duty';

          // Translate title if needed
          let userTitle = user.title;
          if (language === 'ar') {
            if (user.title.includes("Senior Network Architect")) {
              userTitle = "مهندس أول معماري شبكات";
            } else if (user.title.includes("Lead Operations Manager")) {
              userTitle = "مدير أول عمليات تكنولوجيا المعلومات";
            } else if (user.title.includes("Cloud Infrastructure Engineer")) {
              userTitle = "منسق بنية سحابية تشغيلية";
            } else if (user.title.includes("PMS Integration Coordinator")) {
              userTitle = "منسق تكامل غرف فندقية (Opera PMS)";
            } else if (user.title.includes("Systems Security Specialist")) {
              userTitle = "أخصائي أمن نظم وحماية معلومات";
            }
          }

          return (
            <div
              key={user.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between transition-all glass ${
                isOnLeave 
                  ? 'border-orange-500/25 bg-orange-500/[0.02] hover:bg-orange-500/[0.04]' 
                  : 'border-white/5 bg-white/2 hover:border-white/12 hover:bg-white/4'
              }`}
            >
              <div>
                {/* Upper Avatar & Title Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-11 w-11 rounded-xl object-cover border border-white/5"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h4 className="font-bold text-white text-xs">{user.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{userTitle}</p>
                    </div>
                  </div>

                  {/* Status pills selector */}
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-lg uppercase border ${
                    isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    isOnLeave ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 animate-pulse' :
                    'bg-white/5 text-zinc-400 border-white/5'
                  }`}>
                    {isOnLeave && language === 'ar' ? 'في إجازة' : 
                     isActive && language === 'ar' ? 'نشط بالدورية' : 
                     isOffDuty && language === 'ar' ? 'خارج العمل' : user.status}
                  </span>
                </div>

                {/* Sub info details */}
                <div className="space-y-1.5 py-4 border-y border-white/5 my-4 text-[11px] text-zinc-400">
                  <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-zinc-500" /> {user.email}</p>
                  <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-zinc-500" /> {user.phone}</p>
                </div>

                {/* Technical skillsets */}
                <div>
                  <span className="text-[9px] text-zinc-400 font-mono font-extrabold uppercase tracking-wider block mb-1.5">
                    {language === 'ar' ? 'المؤهلات ومجال التركيز الفني' : 'Focus Capabilities'}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {user.skills.map((skill, sIdx) => {
                      let skillName = skill;
                      if (language === 'ar') {
                        if (skill === 'WAN Fiber Optimization') skillName = 'تحسين اتصالات الألياف البنائية WAN';
                        else if (skill === 'Opera PMS Sync') skillName = 'مزامنة Opera PMS للمغادرة والوصول';
                        else if (skill === 'Layer-3 Switching') skillName = 'إعداد وتجهيز سويتشات الطبقة الثالثة';
                        else if (skill === 'Virtualization Security') skillName = 'حماية وتأمين الخوادم والأنظمة الافتراضية';
                        else if (skill === 'Cloud Hosting') skillName = 'إدارة الحوسبة السحابية AWS/GCP';
                        else if (skill === 'CCTV Firewalls') skillName = 'تهيئة كاميرات المراقبة وجدران الحماية للشبكة';
                      }
                      return (
                        <span key={sIdx} className="px-2.5 py-1 rounded bg-white/5 border border-white/5 text-[10px] text-zinc-300 font-mono">
                          {skillName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Attendance quick switch dropdown actions */}
              <div className="pt-5 flex items-center justify-between border-t border-white/5 mt-5 text-xs">
                <span className="text-[10px] text-zinc-400 font-mono font-bold">
                  {language === 'ar' ? 'تحويل الحالة الفورية' : 'STATUS SWITCH'}
                </span>
                <select
                  value={user.status}
                  onChange={(e) => handleStatusChange(user.id, e.target.value as UserStatus)}
                  className="bg-white border border-white/5 hover:border-white/10 py-1.5 px-2.5 rounded-xl text-xs focus:outline-none text-slate-900 cursor-pointer font-mono font-semibold"
                >
                  <option value="Active" className="bg-white text-slate-900">
                    {language === 'ar' ? 'نشط بالمناوبة' : 'Active Duty'}
                  </option>
                  <option value="On Leave" className="bg-white text-slate-900">
                    {language === 'ar' ? 'في إجازة (إعادة توزيع)' : 'On Leave (Redistribute)'}
                  </option>
                  <option value="Off Duty" className="bg-white text-slate-900">
                    {language === 'ar' ? 'خارج الدوام' : 'Off Duty'}
                  </option>
                </select>
              </div>

            </div>
          );
        })}
      </div>

      {/* Automatic redistribution operational checklist details explanation */}
      <div className="rounded-xl border border-white/5 bg-white/1 p-5 leading-relaxed text-xs text-zinc-400 space-y-4 font-sans glass">
        <h4 className="font-display font-semibold text-white text-xs flex items-center gap-1.5">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" /> 
          {language === 'ar' ? 'محددات وسلوكيات مصفوفة توزيع المهام التلقائي' : 'Roster Sync Delegation Matrix Rules'}
        </h4>
        <p>
          {language === 'ar' 
            ? 'تعمل المنظومة على تدوير الوردية خلال نفاذ 76 ساعة تماشياً مع مؤشرات مستويات الخدمة SLA المعتمدة للفندق. بمجرد تحول حالة أي مهندس أو منسق إلى "في إجازة"، يبدأ العمل الفوري بما يلي:' 
            : 'Hotel operations operate on 76-hour rolling windows matching strict hotel Guest SLA indices. When any IT specialist or coordinator toggles status to "On Leave", the core backend daemon activates:'}
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          {language === 'ar' ? (
            <>
              <li><strong>تفويض المهام:</strong> يتم إلغاء ربط المهام المفتوحة أو "قيد التنفيذ" من الفني فوراً لحمايتها من الكتمان.</li>
              <li><strong>التوجيه التلقائي:</strong> تعود هذه التقارير والواجبات إلى سلة المهام المشتركة أو توجّه تلقائياً للتقنيين المتاحين طبقاً لمهاراتهم.</li>
              <li><strong>إشعارات البث:</strong> يتم إنشاء وتدوين إخلاء طرف في لوحة المعلومات ويرسل فوراً للمدراء مع طوابع زمنية مشددة.</li>
              <li><strong>مستويات الأمان والنزلاء:</strong> يتم تقديم أنظمة الفندق الحيوية وخدمات النزلاء والغرف كأولوية قصوى لمستويات الخدمة (مثل Opera PMS).</li>
            </>
          ) : (
            <>
              <li><strong>Delegation:</strong> Pending sub-tasks of state <span className="text-white">"Open"</span> or <span className="text-white">"In Progress"</span> are decoupled from their owner.</li>
              <li><strong>Routing:</strong> The tasks partition back into the shared open pool or auto-assign to the next logically available active technician.</li>
              <li><strong>Broadcast:</strong> Log records and Telegram alerts dispatch to managers George and Ahmed instantly with timestamp markers.</li>
              <li><strong>Protection:</strong> Critical guest features such as Opera PMS room synchronization are prioritised above standard admin devices.</li>
            </>
          )}
        </ul>
      </div>

    </div>
  );
}
