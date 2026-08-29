import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  isRtl: boolean;
}

const translations = {
  en: {
    // Header
    'brand.title': 'LONG BEACH',
    'brand.subtitle': 'OPERATIONS',
    'brand.command_center': 'Long Beach Operations Command Center',
    'status.active_core': 'ACTIVE CORE',
    'header.system_clock': 'SYSTEM CLOCK UTC',
    'header.sla_compliance': 'SLA COMPLIANCE',
    'header.secure': 'SECURE',
    'header.bulletins': 'System Alerts Feed',
    'header.mark_all_read': 'Mark all read',
    'header.no_alerts': 'No active ops alerts right now.',
    'header.impersonate': 'Impersonate Profile',
    'header.impersonate_desc': 'Switch roles to test task permissions & workflows.',
    'header.credential_switch_title': 'Technician Credentials switched',
    'header.credential_switch_desc': 'Logged in as {name} ({role}) to test views and action permissions.',
    
    // Sidebar
    'side.active_credentials': 'Active Credentials',
    'side.permissions': 'permissions',
    'side.operations': 'Operations',
    'side.command_center': 'Command Center',
    'side.operations_board': 'Operations Board',
    'side.checklists': 'Inspection Checklists',
    'side.projects': 'Projects',
    'side.roster': 'Crew Roster & Leaves',
    'side.intelligence': 'INTELLIGENCE',
    'side.ai_assistant': 'Ops AI Assistant',
    'side.gemini': 'GEMINI',
    
    // Global & Roles
    'role.general_manager': 'General Manager',
    'role.director': 'Director',
    'role.manager': 'Manager',
    'role.assistant': 'Assistant',
    'role.coordinator': 'Coordinator',
    'status.active': 'Active',
    'status.active_duty': 'Active Duty',
    'status.on_leave': 'On Leave',
    'status.on_leave_option': 'On Leave (Redistribute)',
    'status.off_duty': 'Off Duty',
    'status.unassigned': 'Unassigned (Open Pool)',
    'status.priority': 'Urgency Level',
    'status.sla_alert': 'SLA Alert!',
    
    // Booting Screen
    'boot.title': 'Booting Operations Command Center ...',
    'boot.subtitle': 'Synchronizing core database schedules, SLA deadlines, and checklists...',
    
    // Notifications Categories
    'notif.category.Task': 'Task',
    'notif.category.Checklist': 'Checklist',
    'notif.category.Project': 'Project',
    'notif.category.Alert': 'Alert',
    'notif.category.System': 'System',

    // Dashboard (Command Center)
    'dash.alert.overdue_title': 'URGENT: OVERDUE OPERATIONS TICKETS ALERT',
    'dash.alert.overdue_desc': 'We have detected {count} uncompleted tasks past their scheduled deadlines. Immediate delegation required.',
    'dash.alert.delegate_btn': 'DELEGATE NOW',
    'dash.title': 'Hospitality SLA Analytics Dashboard',
    'dash.subtitle': 'Real-time telemetry on diagnostic workflows, compliance parameters, and technician availability.',
    'dash.metric.total_tasks': 'TOTAL OPERATIONAL TICKETS',
    'dash.metric.completed': 'COMPLETED DELEGATIONS',
    'dash.metric.pending': 'PENDING ASSIGNMENTS',
    'dash.metric.sla_critical': 'SLA CRITICAL OVERDUE',
    'dash.metric.hours_saved': 'HOURS SPENT ON SLA',
    'dash.metric.roster_ratio': 'ROSTER IN SERVICE',
    'dash.metric.active_crew': 'active crew',
    'dash.metric.completion_rate': 'SLA completion rate',
    'dash.chart.title': 'Milestone SLA Fulfilment Velocity (Hours Spent Input)',
    'dash.chart.desc': 'Real-time actual SLA delivery hours vs. nominal allocation metrics.',
    'dash.chart.actual': 'Actual Duration (Hours)',
    'dash.chart.target': 'Target Limit (Hours)',
    'dash.distribution.title': 'Incident SLA Urgency Allocation Ratio',
    'dash.distribution.desc': 'Proportional share of live operations tickets categorized by priority boundaries.',
    'dash.history.title': 'Inspection Control Performance Log (Last Checklist Saves)',
    'dash.history.desc': 'Audit trail of recurring operations checklists verified on shift handovers.',
    'dash.history.th.date': 'DATE',
    'dash.history.th.type': 'CYCLE TYPE',
    'dash.history.th.signed_by': 'SIGNED BY',
    'dash.history.th.integrity': 'INTEGRITY RATIO',
    'dash.history.th.status': 'SYNC STATUS',
    'dash.history.empty': 'No historical logs captured during this container session.',
    'dash.history.signed_by_user': 'Signed by {name}',
    'dash.history.items_count': '{completed} of {attempted} checked',
    'dash.history.verified': 'VERIFIED ✓',

    // Task Board
    'task.title': 'Operations Dispatch Board & Timer',
    'task.subtitle': 'Track IT service tickets in real time. Claims, timers, and automatic status distributions.',
    'task.add_ticket': 'Dispatch SLA Ticket',
    'task.filter.all_priorities': 'All Urgent Levels',
    'task.filter.all_staff': 'All Active Operators',
    'task.filter.label': 'FILTER BY:',
    'task.col.open': 'Open tickets & Unassigned Pool',
    'task.col.progress': 'In Progress Diagnostics & Timers',
    'task.col.completed': 'Completed SLA Tickets (SLA Signed)',
    'task.empty_state': 'No operational tasks in this section.',
    'task.action.claim': 'Claim Task',
    'task.action.start_timer': 'Start Timer',
    'task.action.mark_complete': 'Mark Completed',
    'task.card.deadline': 'SLA Deadline',
    'task.card.overdue': 'OVERDUE',
    'task.card.duration': 'Duration',
    'task.card.notes_count': '{count} logs',
    'task.card.no_notes': 'No logs',
    
    // Task Modals
    'task.notes.title': 'Task Notes & Operations Logging',
    'task.notes.close': 'Close [esc]',
    'task.notes.empty_logs': 'No diagnostic logs added yet.',
    'task.notes.placeholder': 'Log network check values or update descriptions...',
    'task.notes.add_btn': 'Add Diagnostic Note',
    
    'task.create.title': 'Dispatch New Operations SLA Ticket',
    'task.create.subtitle': 'Dispatch an enterprise hotel service task on available hospitality queues.',
    'task.create.field_title': 'Task Title',
    'task.create.field_title_placeholder': 'e.g. Opera PMS sync latency on Room RFID encoders',
    'task.create.field_desc': 'Description',
    'task.create.field_assignee': 'Assign Operators (Active list)',
    'task.create.field_deadline': 'SLA Deadline Time Limit',
    'task.create.cancel': 'Cancel',
    'task.create.submit': 'Dispatch SLA',

    // Checklists Page
    'check.title': 'Recurring Operational Controls',
    'check.subtitle': 'Hotel network infrastructure check schedules with automated technician routing.',
    'check.available_ops': 'Available Operators: {count} active',
    'check.staff_leave_bypass': '* Staff on leave bypassed during automation',
    'check.tab_suffix': 'Inspection Schedule',
    'check.scope_title': 'Verification Scope',
    'check.signed_stat': '{completed} of {total} signed',
    'check.signed_by': 'Signed by {name}',
    'check.routing_title': 'Automatic Routing',
    'check.routing_desc': 'Auditor Routing Details',
    'check.routing_empty': 'No technicians are active to receive logs! (Everyone is on leave)',
    'check.rules_title': 'Roster Sync Delegation Matrix Rules',
    'check.rule_1_title': 'Roster Shift Boundary:',
    'check.rule_1_desc': 'If a technician shifts to "On Leave", current task assignments unbind automatically.',
    'check.rule_2_title': 'Delegation:',
    'check.rule_2_desc': 'Pending sub-tasks of state "Open" or "In Progress" are decoupled from their owner.',
    'check.rule_3_title': 'Routing:',
    'check.rule_3_desc': 'The tasks partition back into the shared open pool or auto-assign to the next logically available active technician.',
    'check.rule_4_title': 'Broadcast:',
    'check.rule_4_desc': 'Log records and Telegram alerts dispatch to managers George and Ahmed instantly with timestamp markers.',
    'check.rule_5_title': 'Protection:',
    'check.rule_5_desc': 'Critical guest features such as Opera PMS room synchronization are prioritised above standard admin devices.',
    'check.commit_btn': 'Commit Checklist Integrity Sign-off',
    'check.simulate_btn': 'Trigger Missed Daemon',
    'check.empty_msg': 'Checklist schedule type unavailable.',

    // Projects Page
    'proj.title': 'Master Projects Roadmap',
    'proj.subtitle': 'Track milestones boundaries, documentation schedules, and SLA deliverables.',
    'proj.create_btn': 'Formulate Project',
    'proj.roadmap_badge': 'Q2 ROADMAP',
    'proj.delay_alert': 'DELAY ALERT',
    'proj.milestone_prog': 'Milestone Progression',
    'proj.lead': 'Lead:',
    'proj.team_title': 'Assigned Operations Team:',
    'proj.milestones_header': 'Active Milestones Boundaries',
    'proj.milestone_deadline': 'Deadline:',
    'proj.milestone_late': 'SLA LATE',
    'proj.docs_title': 'Schematics & Specs Library',
    'proj.docs_placeholder': 'Drag & drop layout blueprints here or select manually',
    'proj.docs_file_label': 'Filename (e.g. WiFi6_layout_floor2)',
    'proj.docs_upload_btn': 'UPLOAD',
    'proj.docs_empty': 'No docs uploaded yet.',
    'proj.notes_title': 'Lead Engineer Operational notes',
    'proj.notes_empty': 'No logging records registered.',
    'proj.notes_input_placeholder': 'Type logging note...',
    'proj.notes_log_btn': 'Log',
    'proj.empty_selection': 'Select a project roadmap from the left menu index to track SLA boundaries.',
    
    'proj.create.title': 'Formulate Project Roadmap Blueprint',
    'proj.create.desc': 'Design a master hospitality infrastructure project, matching task milestone allocations.',
    'proj.create.name': 'Project Name',
    'proj.create.name_placeholder': 'e.g. Floor 4 Room Lock Zigbee routers installation',
    'proj.create.scope': 'Scope Description',
    'proj.create.coordinators': 'Assign Team Coordinators',
    'proj.create.deadline': 'Master Target Deadline',
    'proj.create.cancel': 'Cancel',
    'proj.create.submit': 'Assemble Blueprint',

    // Staff Leave / Crew Roster Page
    'crew.title': 'IT Attendance & Skill Roster',
    'crew.subtitle': 'Manage crew leaves and track technician skill proficiencies. Redistribution engines fire automatically on status updates.',
    'crew.redistributor': 'REDISTRIBUTOR ENGINE: INTEGRATED',
    'crew.capabilities': 'Focus Capabilities',
    'crew.status_switch': 'STATUS SWITCH',
    'crew.rule_title': 'Roster Sync Delegation Matrix Rules',
    
    // AI Assistant
    'ai.header_title': 'Long Beach AI Ops Coordinator',
    'ai.model_label': 'MODEL: Gemini-2.5-flash-grounded-ops',
    'ai.loading_label': 'Accessing SLA registries & metrics logs...',
    'ai.presets_header': 'Grounded Queries Controller',
    'ai.chat_placeholder': 'Query active tasks, compliance faults, leave redistribute metrics...',
  },
  ar: {
    // Header
    'brand.title': 'لونغ بيتش',
    'brand.subtitle': 'إدارة العمليات',
    'brand.command_center': 'مركز إدارة عمليات منتجع لونغ بيتش',
    'status.active_core': 'النظام الأساسي نشط',
    'header.system_clock': 'ساعة النظام UTC',
    'header.sla_compliance': 'نسبة الامتثال للSLA',
    'header.secure': 'مؤمن',
    'header.bulletins': 'موجز تنبيهات النظام',
    'header.mark_all_read': 'تحديد الكل كمقروء',
    'header.no_alerts': 'لا توجد تنبيهات عملياتية نشطة حالياً.',
    'header.impersonate': 'تقمص هوية مستخدم',
    'header.impersonate_desc': 'تبديل الأدوار لاختبار صلاحيات المهام وسير العمل.',
    'header.credential_switch_title': 'تم تبديل بيانات الاعتماد الفنية',
    'header.credential_switch_desc': 'تم تسجيل الدخول بصفتك {name} ({role}) لاختبار الواجهات وصلاحيات الإجراءات.',
    
    // Sidebar
    'side.active_credentials': 'الحساب النشط',
    'side.permissions': 'صلاحيات',
    'side.operations': 'العمليات',
    'side.command_center': 'مركز التحكم والقيادة',
    'side.operations_board': 'لوحة تذاكر العمليات',
    'side.checklists': 'قوائم الفحص الدورية',
    'side.projects': 'خارطة طريق المشاريع',
    'side.roster': 'المناوبات والإجازات',
    'side.intelligence': 'الذكاء الاصطناعي',
    'side.ai_assistant': 'مساعد العمليات الذكي',
    'side.gemini': 'جيميني AI',
    
    // Global & Roles
    'role.general_manager': 'المدير العام',
    'role.director': 'مدير إدارة',
    'role.manager': 'مدير العمليات',
    'role.assistant': 'مساعد',
    'role.coordinator': 'منسق فني',
    'status.active': 'نشط',
    'status.active_duty': 'في الخدمة النشطة',
    'status.on_leave': 'في إجازة',
    'status.on_leave_option': 'منقطع بإجازة (إعادة توزيع)',
    'status.off_duty': 'خارج الخدمة',
    'status.unassigned': 'غير معين (متاح للجميع)',
    'status.priority': 'مستوى الإنذار والسرعة',
    'status.sla_alert': 'تنبيه SLA!',
    
    // Booting Screen
    'boot.title': 'جاري تشغيل مركز إدارة العمليات والمهام ...',
    'boot.subtitle': 'جاري مزامنة قواعد البيانات والجداول وآجال اتفاقية الخدمة (SLA)...',
    
    // Notifications Categories
    'notif.category.Task': 'مهمة',
    'notif.category.Checklist': 'فحص دوري',
    'notif.category.Project': 'مشروع',
    'notif.category.Alert': 'تنبيه طارئ',
    'notif.category.System': 'النظام',

    // Dashboard
    'dash.alert.overdue_title': 'عاجل: تنبيه تذاكر العمليات المتأخرة المتجاوزة للمدة',
    'dash.alert.overdue_desc': 'تم رصد {count} مهام تشغيلية غير مكتملة تجاوزت حدود الوقت المسموح باتفاقية الخدمة. يتطلب التوزيع الفوري.',
    'dash.alert.delegate_btn': 'إسناد وتعيين الآن',
    'dash.title': 'لوحة تحليلات وامتثال مستويات خدمة الضيافة SLA',
    'dash.subtitle': 'لوحة تحكم فورية لتحليلات الاتصال بالفندق والأعطال وسرعة استجابة المهندسين.',
    'dash.metric.total_tasks': 'إجمالي تذاكر العمليات الفنية',
    'dash.metric.completed': 'المهام والطلبات المكتملة',
    'dash.metric.pending': 'تذاكر معلقة بانتظار الإسناد',
    'dash.metric.sla_critical': 'تذاكر متأخرة بالغة الأهمية',
    'dash.metric.hours_saved': 'الساعات الإجمالية المستغرقة',
    'dash.metric.roster_ratio': 'نسبة توظيف وتواجد الموظفين',
    'dash.metric.active_crew': 'مهندس نشط في الوردية',
    'dash.metric.completion_rate': 'معدل إكمال مهام SLA',
    'dash.chart.title': 'سرعة إنجاز واستيفاء معايير الخدمة SLA (مدخلات الساعات)',
    'dash.chart.desc': 'تحليل مقارن للساعات الفعلية لإنهاء المهام مقابل الساعات المستهدفة.',
    'dash.chart.actual': 'ساعات العمل الفعلية',
    'dash.chart.target': 'ساعات الوقت المستهدف',
    'dash.distribution.title': 'توزيع نسب أهمية الحوادث والتذاكر النشطة',
    'dash.distribution.desc': 'معدلات تذاكر الأعطال الحالية مقسمة حسب الفئات ومستويات الإنذار.',
    'dash.history.title': 'سجل أداء عمليات الفحص والتحقق الدورية (آخر الحفظيات)',
    'dash.history.desc': 'سجلات الفحص المعتمدة عند عمليات تسليم ورديات العمل الفنية.',
    'dash.history.th.date': 'التاريخ',
    'dash.history.th.type': 'دورة الفحص',
    'dash.history.th.signed_by': 'الموقع للتسليم',
    'dash.history.th.integrity': 'نسبة سلامة الشبكات',
    'dash.history.th.status': 'حالة المزامنة',
    'dash.history.empty': 'لا توجد سجلات تفتيش محفوظة بعد في هذه الجلسة التشغيلية.',
    'dash.history.signed_by_user': 'تم التوقيع بواسطة {name}',
    'dash.history.items_count': 'تم فحص {completed} من {attempted}',
    'dash.history.verified': 'تم التحقق والاعتماد ✓',

    // Task Board
    'task.title': 'لوحة إسناد وتوزيع المهام التشغيلية',
    'task.subtitle': 'متابعة مباشرة وإسناد فوري لمهام وتذاكر أعطال الفندق. إدارة التوقيت وتحديث مؤشرات المزامنة.',
    'task.add_ticket': 'إضافة تذكرة صيانة SLA جديدة',
    'task.filter.all_priorities': 'جميع مستويات الأهمية',
    'task.filter.all_staff': 'جميع الموظفين الفنيين',
    'task.filter.label': 'تصفية حسب:',
    'task.col.open': 'التذاكر المفتوحة والمعلقة (المخزن العام)',
    'task.col.progress': 'قيد الفحص والمتابعة النشطة (العدادات تعمل)',
    'task.col.completed': 'طلبات مكتملة ومغلقة (تم التوقيع بالامتثال)',
    'task.empty_state': 'لا توجد تذاكر عمل في هذا القسم حالياً.',
    'task.action.claim': 'استلام ومباشرة العمل',
    'task.action.start_timer': 'بدء تشغيل العداد',
    'task.action.mark_complete': 'إنهاء وإغلاق التذكرة',
    'task.card.deadline': 'أقصى موعد SLA',
    'task.card.overdue': 'متجاوز الوقت',
    'task.card.duration': 'الزمن المستغرق',
    'task.card.notes_count': '{count} ملاحظات فنية',
    'task.card.no_notes': 'بدون ملاحظات',
    
    // Task Modals
    'task.notes.title': 'ملاحظات المهام وسجلات التدقيق التشغيلي',
    'task.notes.close': 'إغلاق [esc]',
    'task.notes.empty_logs': 'لم يتم تدوين أي سجل تشخيصي أو ملاحظات حتى الآن.',
    'task.notes.placeholder': 'دون تفاصيل الفحص وتفاصيل التعديل الفني وسعة الشبكات...',
    'task.notes.add_btn': 'إضافة ملاحظة فنية تشخيصية',
    
    'task.create.title': 'توزيع تذكرة SLA تشغيلية جديدة للشبكات',
    'task.create.subtitle': 'إنشاء وإسناد تذكرة صيانة واتفاقية مستوى صيانة وإرسالها لطواقم الفندق.',
    'task.create.field_title': 'عنوان ووصف التذكرة القصير',
    'task.create.field_title_placeholder': 'مثال: مشكلة تواصل نظام Opera PMS مع بوابات الغرف RFID',
    'task.create.field_desc': 'تفاصيل النطاق والعطل المشخص',
    'task.create.field_assignee': 'الموظف المسؤول (من قائمة النشطين فقط)',
    'task.create.field_deadline': 'الوقت الأقصى للحل (اتفاقية SLA)',
    'task.create.cancel': 'إلغاء الأمر',
    'task.create.submit': 'تسجيل وإسناد صيانة الـ SLA',

    // Checklists Page
    'check.title': 'قوائم التحقق وعمليات الفحص الدوري',
    'check.subtitle': 'جدول التحقق الشامل من ثبات واتصال خوادم البنية التحتية، مع إسناد آلي للمهندسين المتاحين.',
    'check.available_ops': 'الطاقم الفني المتاح: {count} موظفين نشطين',
    'check.staff_leave_bypass': '* تم استبعاد طواقم العمل التي في إجازة من التعيينات الفورية',
    'check.tab_suffix': 'جدول فحص',
    'check.scope_title': 'نطاق المراجعة والتحقق المعتمد',
    'check.signed_stat': 'تم فحص واعتماد {completed} من {total}',
    'check.signed_by': 'تم الاعتماد والتوقيع بواسطة {name}',
    'check.routing_title': 'التوزيع الآلي',
    'check.routing_desc': 'تفاصيل المهندس المكلف بالفحص',
    'check.routing_empty': 'تحذير: لا يوجد أي فني متاح لاستلام الفحص الدوري (الجميع بإجازات)',
    'check.rules_title': 'قواعد مصفوفة التفويض لتبديل المناوبات والإجازات',
    'check.rule_1_title': 'تغيير حالة الدوام:',
    'check.rule_1_desc': 'بمجرد تعديل حالة أحد المهندسين إلى "في إجازة"، يتنحى النظام تلقائياً عن مهامه المعلقة.',
    'check.rule_2_title': 'تفويض فوري:',
    'check.rule_2_desc': 'المهام غير المنجزة وحالات "مفتوح" أو "قيد العمل" تنفصل مباشرة عن الموظف المجاز.',
    'check.rule_3_title': 'مسارات التوجيه:',
    'check.rule_3_desc': 'يتم إعادة توزيع المهام إلى مخزن المتاح المفتوح أو الإسناد الذكي لأول مهندس تشغيل متوفر ونشط.',
    'check.rule_4_title': 'البث والتنبيه:',
    'check.rule_4_desc': 'يتم إرسال إشعارات وسجلات المزامنة الفورية وقناة التليجرام إلى مديري الإدارة سارة وديفيد بمرجع زمني دقيق.',
    'check.rule_5_title': 'تأمين الاتصال:',
    'check.rule_5_desc': 'الأنظمة ذات الأولوية المطلقة كشبكة مزامنة بوابات ومعاملات الغرف Opera PMS تحظى بأسبقية الإسناد والمعالجة دائماً.',
    'check.commit_btn': 'اعتماد وتوقيع سلامة المزامنة الفنية',
    'check.simulate_btn': 'تشغيل برنامج المحاكاة المتأخر اليدوي',
    'check.empty_msg': 'توزيع قائمة التحقق هذه غير متاح حالياً.',

    // Projects Page
    'proj.title': 'خارطة طريق وإنجاز مشاريع الفندق الرئيسية',
    'proj.subtitle': 'متابعة معايير البنية، وجداول التوثيقات الفنية، والتسليمات الضخمة لعقود الـ SLA للربع الثاني.',
    'proj.create_btn': 'تخطيط وتفعيل مشروع جديد',
    'proj.roadmap_badge': 'خطة الربع الثاني Q2',
    'proj.delay_alert': 'إنذار تأخر التسليم',
    'proj.milestone_prog': 'مؤشر تقدم المحطات الأساسية',
    'proj.lead': 'مدير المشروع:',
    'proj.team_title': 'فريق العمليات والمنسقين المعينين:',
    'proj.milestones_header': 'مراحل ومخرجات الإنجاز المعتمدة',
    'proj.milestone_deadline': 'تاريخ التسليم المستهدف:',
    'proj.milestone_late': 'مرحلة متأخرة صيانة SLA',
    'proj.docs_title': 'مكتبة المخططات والمواصفات الفنية المرفوعة',
    'proj.docs_placeholder': 'اسحب وأسقط ملفات المخططات الفنية والشبكات هنا، أو تصفح الملفات يدوياً',
    'proj.docs_file_label': 'اسم الملف المراد رفعه (مثال: WiFi6_layout_floor2)',
    'proj.docs_upload_btn': 'بدء الرفع الفوري',
    'proj.docs_empty': 'لم يتم رفع مراجع أو مستندات حتى الآن لهذا المشروع.',
    'proj.notes_title': 'مذكرات وسجلات رئيس المهندسين المشرفين',
    'proj.notes_empty': 'لا توجد مذكرات هندسية مدونة بعد.',
    'proj.notes_input_placeholder': 'اكتب تفاصيل التحديث لتدوينها برمز الوردية الفني...',
    'proj.notes_log_btn': 'الحفظ بالسجل',
    'proj.empty_selection': 'يرجى اختيار أحد المشاريع المصممة من القائمة الجانبية لعرض مصفوفة التسليم والمخططات ومطابقة معايير الـ SLA.',
    
    'proj.create.title': 'هندسة وصياغة مخطط مشروع جديد',
    'proj.create.desc': 'تخطيط مشروع بنية ضيافة تحتية كامل وسد ثغرات المهام وتعيين مراحل تنفيذ المهندسين.',
    'proj.create.name': 'عنوان واسم المشروع',
    'proj.create.name_placeholder': 'مثال: تركيب موزعات شبكات Zigbee في غرف الطابق الرابع',
    'proj.create.scope': 'تفاصيل النطاق والمواصفات المستهدفة',
    'proj.create.coordinators': 'تعيين منسقي المهام من المهندسين',
    'proj.create.deadline': 'أقصى تاريخ تسليم للمشروع ككل',
    'proj.create.cancel': 'إلغاء وصرف النظر',
    'proj.create.submit': 'صياغة واعتماد هيكل المشروع',

    // Staff Leave
    'crew.title': 'جدول مناوبات وحضور الطواقم الفنية والمهارات',
    'crew.subtitle': 'لوحة متكاملة لمتابعة حضور المهندسين وحجوزات إجازاتهم ومؤهلاتهم، مع تفعيل المحرك التلقائي فور تغيير أي حالة.',
    'crew.redistributor': 'محرك إعادة التوجيه الفوري: متصل ونشط',
    'crew.capabilities': 'أبرز المهارات ونطاق الخبرة الفنية',
    'crew.status_switch': 'تحديث وتعديل الحالة',
    'crew.rule_title': 'قواعد مصفوفة تفويض الفنيين وتوجيه الصيانة الدورية',
    
    // AI Assistant
    'ai.header_title': 'منسق الذكاء الاصطناعي لعمليات منتجع لونغ بيتش',
    'ai.model_label': 'الطراز النشط: Gemini-2.5-flash-grounded-ops',
    'ai.loading_label': 'جاري الوصول إلى سجلات الاتصال، مصفوفات تذاكر الـ SLA ومحركات المزامنة...',
    'ai.presets_header': 'خادم الأوامر والتحليلات الجاهزة المحددة مسبقاً',
    'ai.chat_placeholder': 'اسأل الذكاء الاصطناعي عن إحصائيات الغرف، تذاكر العمل المتأخرة، وإعادة توزيع الإجازات...',
  }
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    // Default to 'en', but allow easy toggling
    return (saved as Language) || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.en;
    // @ts-ignore
    let value = dict[key] || translations.en[key] || key;
    
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        value = value.replace(`{${k}}`, String(v));
      });
    }
    return value;
  };

  const isRtl = language === 'ar';

  useEffect(() => {
    // Dynamic body direction updates
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRtl]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
