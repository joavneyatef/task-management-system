# User Acceptance Test Script

Manual scenarios to run against a **staging build** before release. Each mirrors
an automated E2E journey — this pass is the human confirmation that the deployed
artefact behaves in a real browser with real seed data.

**Environment**

- Staging URL: `________________`
- Build / commit under test: `________________`
- Test accounts (staging seed): a General Manager, a Director, a Manager, and an
  Assistant. Record the usernames used: GM `____` · DIR `____` · MGR `____` ·
  ASST `____`.
- Browser: latest Chrome + one of Firefox/Safari.

Mark each step **PASS** / **FAIL** and note anything unexpected.

---

## UAT-1 — Sign in / sign out

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Open the staging URL signed out | Login screen: "name or work email" + password fields, **Sign In** button | |
| 2 | Enter the GM username + a **wrong** password, submit | Inline error "Invalid name/email or password."; still on the login screen | |
| 3 | Correct the password, submit | Lands in the app; sidebar visible; URL ends `#dashboard` | |
| 4 | Reload the page | Still signed in (no login screen flash beyond initial load) | |
| 5 | Open the user menu → **Log Out (Secure)** | Returns to the login screen | |
| 6 | Reload | Still signed out | |
| 7 | Sign in again using the GM's **email address** instead of username | Succeeds | |

## UAT-2 — Role-gated navigation

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Sign in as the **Assistant** | Lands on `#tasks` (Operations Board). Sidebar shows **no** Command Center, Crew Roster, Control Crew & PINs, or Audit Log | |
| 2 | Sign in as the **Manager** | Sidebar shows Command Center + **Control Crew & PINs** + Audit Log; **no** Crew Roster | |
| 3 | Sign in as the **Director** | Sidebar shows Command Center + Audit Log; **no** Crew Roster, **no** Control Crew & PINs | |
| 4 | Sign in as the **GM** | Sidebar shows Command Center + Crew Roster + Audit Log; **no** Control Crew & PINs (Manager-only by design) | |

## UAT-3 — Moving around the workspace (GM)

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Click **Operations Board** | Board view; URL ends `#tasks` | |
| 2 | Click **Inspection Checklists** | Checklist view; URL ends `#checklists` | |
| 3 | Click **Crew Roster & Leaves** | Roster view; URL ends `#roster` | |
| 4 | Click **Command Center** | Dashboard; URL ends `#dashboard` | |
| 5 | While on Checklists, reload | Returns to `#dashboard` (privileged users land on their home tab on every full load) | |

## UAT-4 — Task board

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | As the **Assistant**, view the board | At least one task assigned to this account is visible | |
| 2 | As the **GM**, open the Operations Board | Tasks belonging to several different assistants are all listed | |
| 3 | In the overview search box, type part of one task's title | The table narrows to matching rows; non-matching tasks disappear | |
| 4 | Clear the search | Full list returns | |

## UAT-5 — Backups are management-only

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | As the **Manager**, open Control Crew & PINs → Backup/Restore panel | Panel loads; existing backups list (may be empty) | |
| 2 | Create a live backup | Success message with a `backup-…json` filename; it appears in the list | |
| 3 | In a separate signed-in **Assistant** session, in the browser console run `fetch('/api/backups').then(r=>r.status)` | Resolves to **403** | |
| 4 | Same session: `fetch('/api/env',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"env":"test"}'}).then(r=>r.status)` | Resolves to **403** | |

## UAT-6 — Accessibility spot check

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | On the login screen, Tab to the password show/hide toggle | It is focusable and a screen reader announces "Show password" / "Hide password" | |
| 2 | On the Operations Board, Tab through the filter dropdowns | Each announces a name ("Filter by priority", "Filter by status", …) | |
| 3 | Run an axe / Lighthouse scan on the login page and the board | **No `critical` violations** (serious color-contrast items are a known, tracked gap) | |

## UAT-7 — Data isolation sanity (tester + ops)

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | After the full UAT pass, on the machine that ran any local suite: `git status` | `prisma/dev.db` and `data.json` are **unmodified** | |

---

## Result

```
Scenarios run:   1  2  3  4  5  6  7
Result:         __ __ __ __ __ __ __     (P / F)

Overall:  PASS / FAIL
Tester:   ______________   Date: __________
Notes:
```
