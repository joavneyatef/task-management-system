# Task & Notification Workflow Updates

- Preserved `createdBy` as the immutable original creator.
- Added `lastTransferredById` to identify the most recent person who switched/delegated a task.
- `assignedBy` now represents the latest dispatcher while the original creator remains unchanged.
- New assignment/switch creates one private "New task from: [sender]" notification for the new assignee.
- Completion notifies only the latest sender.
- Overdue task/complaint reminders go only to the assignee and their direct parent in the reporting hierarchy (or the department's direct management route when unassigned).
- Added per-account active task counters and per-department pending complaint counters to the account switcher and sidebar.
- No Team Performance section is rendered in the command center; accountability remains in Audit Log data/history.
