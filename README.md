<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0ceb8bc3-6b17-45a4-aab2-4b9a530b0c9a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## تحديثات هذه النسخة (Phase 1)

تمت إضافة الأساسيات التالية من قائمة المهام المطلوبة:

### ✅ تم تنفيذه بالكامل
1. **نظام الأقسام (Departments)** — من لوحة الإدارة (Admin → الأقسام والإدارات):
   - إنشاء/حذف قسم، تفعيل/تعطيل
   - تحديد المديرين المسؤولين عن كل قسم
   - ربط كل موظف بقسم من فورم إضافة/تعديل الموظف
2. **شكاوى Exclusivi (Complaints)** — تبويب جديد في القائمة الجانبية:
   - تسجيل شكوى جديدة (العنوان، التفاصيل، القسم المختص، الأولوية)
   - إحالة تلقائية للقسم المختص
   - إسناد الشكوى لموظف داخل القسم
   - تتبع الحالة: جديدة → قيد التنفيذ → محلولة → مغلقة
   - سجل تاريخي كامل لكل إجراء (من عمله ومتى)
   - فلاتر حسب القسم والحالة
   - Mr. Hany / المديرون المسؤولون عن القسم يشوفون كل الشكاوى المتعلقة بأقسامهم
3. **صلاحيات إسناد المهام (جزئي)**:
   - المدير العادي لا يقدر يسند مهمة إلا لمنسقين تابعين له (نفس القسم أو `managerId`)
   - "جورج هاني" (Sector Director) يقدر يسند لأي حد بما فيهم المديرين الآخرين

### ⏳ لسه محتاج شغل (المرحلة الجاية)
- ربط الـ Checklists الحالية بواجهة إدارة كاملة لكل قسم (حاليًا فيه 3 تشيك ليست ثابتة يومي/أسبوعي/شهري بدون واجهة لإنشاء تشيك ليست جديد لكل قسم)
- شاشة مخصصة لـ "Mr. Hany" لإسناد مهام للمديرين مباشرة (البنية جاهزة في types.ts وTaskBoard لكن محتاجة واجهة مخصصة أوضح)
- تحديثات الداشبورد (AnalyticsReports) لعرض إحصائيات الشكاوى والأقسام
- فلاتر إضافية (حسب الموظف المسؤول، التاريخ) في شاشة المهام والمشاريع

### ملاحظة أمان مهمة
الـ PIN الخاص بتسجيل الدخول لسه Hardcoded في `LoginPage.tsx` (أرقام تسلسلية بسيطة). لو المشروع هيتنزل فعليًا، لازم:
1. تتغير الأرقام دي لأرقام صعبة التخمين
2. الأفضل يتحول النظام لـ authentication حقيقي (hashing + سيرفر تحقق) بدل الاعتماد على كود الفرونت إند

---

## تحديث إضافي: قائمة الفحص اليومية الثابتة لكل قسم (Static Daily Checklist per Department)

تم تنفيذ هذا الجزء بالكامل الآن:

1. **كل قسم له قوائم فحص ثابتة خاصة به** (يومي/أسبوعي/شهري) — مش قائمة واحدة مشتركة للكل زي الأول.
2. **عند إنشاء قسم جديد من لوحة الإدارة**، بيتعمله تلقائياً 3 قوائم فحص فاضية (يومي، أسبوعي، شهري) جاهزة إن المدير يضيفلها بنودها الخاصة.
3. **الموظف العادي/المدير** بيشوف بس قائمة الفحص الخاصة بقسمه هو (مقفولة عليه، متقدرش تشوف قسم تاني).
4. **جورج هاني (Sector Director)** بس هو اللي عنده Dropdown فوق يقدر يتنقل بيه بين كل الأقسام ويشوف قائمة فحص أي قسم.
5. لو حساب موظف مش مربوط بقسم، هيظهر له تنبيه واضح يطلب منه يراجع الإدارة لتحديد قسمه.
6. البيانات القديمة (قسم IT والـ 3 قوائم فحص الأصلية) اتربطت تلقائياً بقسم "IT Department" فمفيش حاجة هتتكسر.

---

## تحديث إضافي: الداشبورد والفلاتر (Phase 7 من قائمة المهام)

1. **كارت إحصائيات شكاوى Exclusivi في الداشبورد الرئيسي**: عدد الشكاوى المفتوحة، عدد المتأخرة (+24 ساعة)، ونسبة الحل الإجمالية.
2. **كارت التزام كل قسم بقوائم الفحص**: بار تقدم لكل قسم يوضح نسبة إنجاز البنود المطلوبة منه.
3. **فلتر الموعد النهائي (Deadline)** في شاشة المهام: متأخرة / اليوم / هذا الأسبوع، بالإضافة للفلاتر الموجودة أصلاً (الأولوية والموظف المسؤول).
4. **فلاتر في شاشة المشاريع**: فلترة حسب المدير المسؤول، وحسب الحالة (متأخر / على المسار / مكتمل).

بكده كل بنود Phase 7 (الداشبورد والتتبع) في قائمة المهام الأصلية بقت متغطية.

## Organizational hierarchy update
The application now uses a reporting-line model (`parentId`) for GM, Director, Manager and Assistant access. Task recipients are generated from the actual hierarchy, private notifications use `recipientUserId`, and Executive Complaints route by configured reason to the responsible department Director.

## Backend / Production Handoff (August 2026)

The application now uses a server-authoritative authentication/session layer:

- Login and signup are handled by Node.js/Express.
- Passwords are stored as salted `scrypt` hashes and are never returned to React.
- Authentication uses an `HttpOnly` session cookie (`hotel_session`).
- Protected `/api/*` routes require an authenticated session.
- The frontend no longer trusts a localStorage user id as proof of identity.
- Account impersonation/quick switching is disabled; a different account must authenticate normally.
- Task switching is persisted through `POST /api/tasks/:id/switch`, preserving the original `createdBy` and recording the actual person who transferred the task in history.
- Notification acknowledgement is persisted through `POST /api/notifications/:id/acknowledge` and therefore survives refresh.
- State data remains persisted in `data.json` / `data-test.json` so the current project can run without introducing a native database dependency. For a multi-server deployment, migrate this persistence layer to PostgreSQL/MySQL before scaling horizontally.

### First run

1. `npm install`
2. Copy `.env.example` to `.env`.
3. Set a strong random `SESSION_SECRET`.
4. `npm run dev`
5. Open `http://localhost:3000`.

### Demo accounts

The bundled demo accounts retain the existing password `123456` for local testing. The password is stored as a salted hash in the shipped JSON data.

### Exclusivi

The backend contains a server-side proxy at:

`GET /api/exclusivi/feedback?from=<unix>&to=<unix>`

Configure the approved vendor authentication on the server only:

- `EXCLUSIVI_BASE_URL=https://api.okgini.com`
- `EXCLUSIVI_SESSION_TOKEN=<approved token or official credential>`

Do not put the Exclusivi token in React/Vite environment variables. The available Exclusivi endpoints are undocumented and the captured session token was observed to expire, so production automation should use an official API key/token-refresh mechanism from the vendor.
