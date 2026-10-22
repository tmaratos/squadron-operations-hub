# Squadron Operations Hub: capability inventory and no-regressions checklist

All paths are under `apps/web/src/`. Written 22 October 2026, before the page-by-page redesign, as the list each redesigned page is checked against: tick an item once it has been confirmed working on the new page, desktop and phone. Every endpoint is a `fetch` to `/api/...` unless it says otherwise.

**Shared conventions**
- **`ConfirmButton`** (`components/confirm-button.tsx`) is the in-page "Sure? Yes / No" step on destructive actions. It closes itself after 6 seconds.
- **`canEdit`** almost always means `globalRole !== "READ_ONLY"`.
- **Roles:** SYSTEM_OWNER, ACCOUNT_APPROVER, ADMINISTRATOR, STAFF_MEMBER, READ_ONLY.
- **APIs re-check roles.** Almost every mutating route under `app/api/**` checks the role again server-side (for example `work/structure` returns an error for READ_ONLY). So a control the UI forgot to hide still fails safely.

**Global CSS stack**
- `app/layout.tsx` imports, in this order: `globals.css`, `dashboard-overrides.css`, `clickup-theme.css`, `redesign-public.css`, `operations-modules.css`, `experience-v2.css`.
- `AppShell` then injects four `<style>` strings: `shellCss` (inline in app-shell), `operationsExperienceCss` (`components/operations-experience.ts`), `hubDesignCss` (`components/hub-design.ts`) and `hubPagesCss` (`components/hub-pages.ts`).
- Most components also inject their own inline `<style>{xxCss}</style>`.

---

## GLOBAL (every page): `app/(app)/layout.tsx` → `components/app-shell.tsx`

The layout calls `requireUser()` and loads the workspaces, `getWorkspaceTree()` (spaces/folders/lists) and `listAgents(user.id)`. Sidebar data comes from `lib/navigation.ts` (`sidebar`, `sidebarFooter`, `breadcrumbFor`). CSS: `shellCss` (`.cu-*`), `operationsExperienceCss`, `hubDesignCss` (`.hub-v3`, `.hub-*`), `hubPagesCss`.

### Sidebar (`aside.cu-sidebar`)
- [ ] Logo links to `/`. The close (X) button is for mobile.
- [ ] Plain links: Home `/`, My Work `/tasks`, Members `/staff`, Documents `/documents`, Reports `/dashboards`, Help & Support `/start-here`.
- [ ] Groups expand/collapse in place. A group opens by itself if it contains the current page. The open/closed state is saved to localStorage `hub-collapsed` under the key `nav-<key>`.
  - [ ] **Calendar:** `/calendar`, `/tasks?due=next14&from=planner`, `/tasks?due=overdue&from=planner`.
  - [ ] **Squadron:** `/duties`, `/staff#committees` (the anchor target does not exist, see the bugs list), `/development`, `/goals`.
  - [ ] **Departments:** `/tasks?scope=all&from=spaces`, `/spaces`, plus the live department tree (below).
  - [ ] **Compliance:** `/compliance`, `/readiness`, `/documents?folder=references` (the query param is ignored, see the bugs list).
  - [ ] **Operations:** `/communications`, `/assets`, `/finance?view=ledger|owed|budget|committee`.
  - [ ] **AI Assistant:** an "Ask the assistant" button that dispatches the `hub:ask` window event; `/agents`; and one link per agent to `/?agent=<id>`, with a "you" tag on agents that are not shared.
  - [ ] **Settings (footer):** `/settings`, `/admin/users`, `/connections`, `/integrations`, `/audit`, `/settings/security`.
- **Department tree**
  - [ ] "Collapse/expand every department" toggle (client-side only).
  - [ ] "+ New department" opens an inline form → POST `/api/work/structure` `{action:"create",kind:"space",name}`.
  - [ ] Clicking a department toggles it open/closed. Folders toggle too. Each list links to `/lists/<id>` and shows its open-item count.
  - [ ] **Drag a department onto another department** to reorder (the drop line shows above or below) → POST `/api/work/structure` `{action:"reorder",kind:"space",ids}`.
  - [ ] **Drag a list onto a department** to move it → `{action:"move",kind:"list",id,spaceId}`.
  - [ ] **Drop a task (MIME `application/x-hub-item`) onto a list** to move it → PATCH `/api/work/items/<id>` `{listId}`.
  - [ ] **Right-click a department or list** opens a menu:
    - Open (`/lists/<id>` or `/spaces`)
    - Rename → `{action:"rename",kind,id,name}`
    - Add a list (departments only) → `{action:"create",kind:"list",spaceId,name}`, then the browser goes to the new list
    - Delete → ConfirmButton → `{action:"archive",kind,id}`
    - Escape or a click outside closes it.
  - **Gating:** none in the UI. Read-only users see all of these, and the API refuses them.

### Top bar (`header.cu-topbar`)
- [ ] Mobile hamburger opens the sidebar. Brand link goes to `/`.
- [ ] Command palette trigger (see "Command palette" below).
- [ ] **New ▾ menu:** "Add a task to" the first 6 lists (`/lists/<id>`), "Every list…" (`/spaces`), then Department or list `/spaces`, Document `/documents`, Person `/staff`, Goal `/goals`.
- [ ] Theme toggle switches light/dark. It is saved to localStorage `hub-theme` and sets `html[data-theme]`.
- [ ] `NotificationBell` (see "Notification bell" below).
- [ ] **Account menu (`.cu-me`):** shows name and email, then links to My connections `/connections`, Notifications `/notifications` and Settings `/settings`. **Sign out** is a real `<form method=post action="/api/auth/logout">`.

### Page-wide behaviours
- [ ] **Custom right-click menu everywhere.** Inputs and selected text keep the browser menu.
  - On a link: Open, Open in a new tab, Copy link.
  - Elsewhere: Copy link to this page.
  - Always: New department (opens the sidebar form) and Refresh (`router.refresh`).
- [ ] Scroll position of `.cu-main` is remembered per path (sessionStorage `hub-scroll:<path>`).
- [ ] Read-only banner (`.cu-readonly`) when `globalRole === "READ_ONLY"`.
- [ ] Breadcrumb (`.cu-crumbs`) via `breadcrumbFor(pathname, search)`, hidden on `/`. It honours `?from=` (spaces / planner / command and so on) to choose the section.
- [ ] Toast `cu-move-note` (about 4 seconds).
- [ ] Mobile bottom nav: Home `/`, My Work `/tasks`, Calendar `/calendar`, Squadron `/staff`, More (opens the sidebar).

### Command palette: `components/command-palette.tsx` (CSS `cpCss`)
- [ ] Open with Ctrl/Cmd+K (toggles) or `/` when not typing. Clicking the trigger also opens it.
- [ ] Search is debounced by 140 ms → GET `/api/work/search?q=`. With an empty query it shows "Up next" tasks.
- [ ] Results are grouped as Tasks (go to `/lists/<listId>?item=<id>`), Lists (first 6 matches) and Go to (11 static pages, first 4 matches).
- [ ] Keyboard: ↑/↓ moves, Enter opens, Esc closes. Hovering sets the active row. Clicking outside closes.

### Assistant panel: `components/ai/assistant-panel.tsx` (CSS `apCss`; mounted in AppShell with `hideLauncher`)
- [ ] Opens on the `hub:ask` window event. The event's `detail {agentId, agentName}` switches to that agent and starts a fresh conversation.
- [ ] Opens on mount if the URL has `?agent=<id>`.
- [ ] Loading: GET `/api/ai/assistant[?conversation=][&agent=]` returns available, retentionDays, autonomy and the conversation list.
- [ ] "Ask the Hub instead" clears the agent. Close button ✕. A mousedown on the overlay closes it.
- [ ] "+ New conversation".
- [ ] Autonomy select (SUGGEST / CONFIRM / BUILD) → POST `/api/ai/assistant` `{action:"autonomy",level}`.
- [ ] Conversation list: open one (loads its messages); delete with ConfirmButton → DELETE `/api/ai/assistant?conversation=<id>`.
- [ ] Example prompt buttons fill the box.
- [ ] Composer textarea: Enter sends, Shift+Enter adds a newline. Dictate button. "Ask" → POST `{action:"plan",prompt,conversationId,agentId}`. The reply may say it built the result automatically.
- [ ] Plan review: tick or untick steps, then "Do it" → POST `{action:"apply",steps,conversationId}` (then `router.refresh`), or "Cancel".
- [ ] Links to the applied results (`href`).

### Pulse widget: `components/assist/pulse-widget.tsx` (CSS `pwCss`)
- [ ] Polls GET `/api/assist/pulse?deep=1` on mount and every 6 minutes while the tab is visible. It renders nothing if there is nothing to show.
- [ ] The floating ball is draggable; its position is saved to localStorage `hub-pulse-spot`. Clicking without dragging toggles the panel.
- [ ] The panel can be resized from the corner grip (saved to `hub-pulse-size`). "Reset size" clears it. Close with ×.
- [ ] Each item (kinds offer / mail / agent / drive):
  - The row opens `href` (an external link opens a new tab).
  - Actionable items have "Do it" → POST `/api/offers` `{action:"accept",...accept}`. On success it goes to `/lists/<listId>?item=<id>`.
  - "Not now" → POST `/api/offers` `{action:"dismiss",id,suggestionId?}`.
  - Items that are not actionable show "Open" (external) or "Look" (internal).
- [ ] Shows at most 5 items, then "and N more".
- [ ] "Ask the Hub to do something" dispatches `hub:ask`.

### Notification bell: `components/notifications/notification-bell.tsx`
- [ ] Polls GET `/api/notifications` (the `unread` count) on every path change and every 60 seconds. The badge caps at 99+. The bell links to `/notifications`.

### Shared task widgets (used on many pages)
- **`InlineAssignee` / `InlinePriority`** (`components/work/inline-pickers.tsx`, CSS `inlinePickerCss`)
  - The popover is portaled to the body and closes on Escape or an outside click.
  - Assignee: remove a person (chip ×) or add one through `PeoplePicker` → PATCH `/api/work/items/<id>` `{assigneeIds}`.
  - Priority: URGENT / HIGH / NORMAL / LOW / No priority → PATCH `{priority}`.
  - Both are disabled when `!canEdit`.
- **`PeoplePicker`** (`components/work/people-picker.tsx`): searches GET `/api/directory?q=`. Enter picks the first result, Escape closes. Choosing a Drive person who has no Hub account first calls POST `/api/directory` `{email,fullName}` to create the account.
- **`Dictate`** (`components/dictate.tsx`): records audio and POSTs it to `/api/dictate` (header `X-Clip-Seconds`). It hides itself where the browser is unsupported.
- **`MentionBox`** (`components/work/mention-box.tsx`): typing `@` lists names from GET `/api/directory`. ↑/↓ moves, Enter or Tab picks, Esc closes, Ctrl/Cmd+Enter sends.

---

## `/`: Home
**Renders:** `app/(app)/page.tsx` → `modules/command/components/command-dashboard.tsx` (server component). **CSS:** `dashboardExperienceCss` (`modules/command/components/dashboard-experience.ts`, `.hub-home`, `.hub-*`) and `inlinePickerCss`.

**Shows**
- A hero with a greeting, today's open and overdue counts, the date and a hand-drawn SVG scene.
- Four stat tiles, three cards (My priorities, Upcoming, Quick actions), then Needs attention and Squadron snapshot (with a cadet/senior donut), then the Offers card.

**Actions**
- [ ] Stat tiles: My assigned tasks `/tasks`; Due in 7 days `/tasks?due=next7&from=planner`; Squadron members `/staff`; Items need attention `/tasks?due=overdue&from=planner`.
- [ ] My priorities: up to 5 of the user's tasks, each linking to `/lists/<l>?item=<id>`, with inline Priority/Assignee pickers (PATCH `/api/work/items/<id>`). The "View all" link goes to `/tasks`. When empty it links to `/tasks?scope=all&from=spaces`.
- [ ] Upcoming: 4 dated tasks linking to `/lists/<l>?item=`. "View calendar" goes to `/calendar`.
- [ ] Quick actions:
  - Create task → first list with open work, else `/spaces`
  - Calendar → `/calendar`
  - Upload document → `/documents`
  - Find a member → `/staff`
  - Run report → `/dashboards`
  - Ask AI assistant → dispatches `hub:ask` (`AskAssistantButton`)
- [ ] Needs attention: 4 overdue rows with inline pickers. "Command view" goes to `/dashboards`. The footer link "N items have no owner" goes to `/tasks?owner=none&from=command`.
- [ ] Squadron snapshot links to `/staff`.
- [ ] **OffersCard** (`components/work/offers-card.tsx`)
  - Loads with GET `/api/offers`.
  - "Yes, do it" → POST `/api/offers` `{id,action:"accept",listId,title,dueOn,suggestionId?}`, or "Open the list" (`/lists/<id>`).
  - "Not now" → POST `{action:"dismiss"}`.
  - The result note has an "Open it →" link.

**Gating:** pickers need `canEdit`. **Query params:** `?agent=<id>` is read by the AssistantPanel, not by this page.

---

## `/tasks`: My tasks / All tasks / filtered tasks
**Renders:** `app/(app)/tasks/page.tsx` → `components/work/my-tasks.tsx`. **CSS:** `mtCss` (includes `inlinePickerCss`) and `taskExperienceCss` (`components/work/task-experience.ts`).

**Query params (server-side filtering)**
- `due` = `overdue` | `today` | `next7` | `next14` | `none`
- `date=YYYY-MM-DD`
- `tag`, `status` (status name), `priority`
- `owner=none` (dated tasks with no owner)
- `scope=all` (title "All tasks")
- `from=` (breadcrumb section only)

The title and description change to describe the filter. Any filter defaults the tab to "Everyone's".

**Actions**
- [ ] Tabs: Mine / Nobody's / Everyone's, each with a count.
- [ ] Search box filters on title and list name.
- [ ] Results are grouped into Late / This week / Later / No date.
- [ ] Each row's checkbox selects it (disabled when `!canEdit`). The row links to `/lists/<listId>?item=<id>` and has inline Priority/Assignee pickers.
- [ ] Bulk bar (when `canEdit`): "Give these to…" (people from GET `/api/directory`), Assign → POST `/api/work/assign` `{itemIds,userId}`, and Clear.
- [ ] Filter banner with a "Back to my tasks" link to `/tasks`.

---

## `/lists/[listId]`: List workspace (the largest component)
**Renders:** `app/(app)/lists/[listId]/page.tsx` loads `getListDetail`, `listItems` and `listAssignableUsers`, and calls `notFound()` if the list is missing. It renders a breadcrumb (`/spaces`, folder, list name) and `components/work/list-workspace.tsx` (`ListWorkspace`, `TableView`, `CalendarView`, `StatusEditor`, `FieldEditor`, `AutomationEditor`, `QuickAdd`, `AssistBox`, `ItemPanel`) together with `RemindersPanel`, `LinkPanel`, `MentionBox`, `PeoplePicker`, `Dictate` and the inline pickers.

**CSS:** inline `lwCss` (`.lw-*`, includes `inlinePickerCss`), `tpCss` (task panel `.tp-*`), the `.lw-*` overrides in `operations-experience.ts`, and `.work-tag--*` tag colours from the global CSS.

**Query params**
- `?item=<id>` opens the task panel on load, if that id is in the list.

**Gating:** `canEdit = role !== READ_ONLY`.
- Hidden when read-only: pick checkboxes, "+ View", Make default, Delete view, Automations, Fields, Sections, "+ Task", every "+ Add Task", "+ Add section", the section "⋯" button, the right-click on section headers, the row-menu edit items, panel delete, and all panel edit controls.
- **Disabled** when read-only: the Group, Sort and Show selects (because they save to the view), and the complete-circle button.

### Header and views
- [ ] Header: space badge, list name, open count.
- [ ] Saved view tabs (list / board / table / calendar types):
  - Click a tab to switch view.
  - **Double-click a tab to rename it** (canEdit) → POST `/api/work/lists/<id>/views` `{action:"update",id,name}`.
  - A dot marks the default view.
- [ ] "+ View": name and type form → `{action:"create",name,type,config:{groupBy:"status",sortBy:"due"}}`.
- [ ] "Make default" → `{action:"setDefault",id}`.
- [ ] "Delete view" (ConfirmButton, only when more than one view exists) → `{action:"delete",id}`.
- [ ] A first-time "why this view" explainer with "Got it" (localStorage `lw-why-seen`).

### Toolbar
- [ ] **Group:** by section / priority / owner / when / not at all. Saved to the view → `{action:"update",id,config}`.
- [ ] **Sort:** soonest / most urgent / name / recently changed / as arranged. Saved to the view.
- [ ] **Show (date filter):** everything / overdue / today / next 7 / next 14 / no date. Saved to the view as `config.filters.due`.
- [ ] "⑂ Expanded/Collapsed": expand all subtasks (client-side).
- [ ] "✓ Closed": show done/closed tasks (client-side). It is switched on automatically after a new done-type section is created (sessionStorage `lw-reveal-closed`).
- [ ] Search icon opens an input that filters on title and tags.
- [ ] "⚡ Automations", "⊞ Fields N", "⚙ Sections" and "+ Task" (switches to list view and opens QuickAdd in the first section).

### Bulk bar (when tasks are selected)
- [ ] "Move to…" any other list (lists from GET `/api/work/lists`) → POST `/api/work/items/bulk` `{action:"move",itemIds,listId}`.
- [ ] Delete (ConfirmButton) → `{action:"delete",itemIds}`.
- [ ] Clear.

### List view, grouped by section
- [ ] Section header:
  - Collapse caret; coloured status pill with count.
  - "N finished — show them" (turns on Closed).
  - "+ Add Task".
  - "⋯" opens the section editor; right-clicking the header does the same.
- [ ] **Drag a row onto another section** → PATCH `/api/work/items/<id>` `{statusId}`.
- [ ] Rows:
  - Select checkbox.
  - Subtask caret (expand).
  - **Complete circle** toggles done/reopen → PATCH `{statusId}`, with an Undo toast for 8 seconds that PATCHes the old status back.
  - Title, subtask/checklist counts, up to 2 tags.
  - Inline Assignee, due date (late / today styling), inline Priority.
  - Clicking the row opens the task panel.
  - Rows are draggable to sidebar lists or sections.
  - **Right-click a row** opens a menu: Open, Mark done/Reopen, Select/Deselect, Delete (ConfirmButton → DELETE `/api/work/items/<id>`).
- [ ] QuickAdd: an input with Esc to cancel, Dictate, Cancel and Save → POST `/api/work/lists/<id>/items` `{title,statusId,parentId}`, then GET the same URL to reload.
- [ ] A "no status" group for orphaned tasks.
- [ ] "+ Add section" opens the section editor with a blank row.
- [ ] Other groupings (priority / owner / due / none) are read-only groups and cannot be dragged into.

### Board view
- [ ] One column per section. **Drag a card to a column** → PATCH `{statusId}` (reads `text/plain`).
- [ ] Card: title, 3 tags, avatar, due date, subtask count, inline Priority/Assignee. Click opens the panel.
- [ ] QuickAdd per column.

### Table view
- [ ] Sortable headers (Name / Status / Due / Priority) with ↑/↓ indicators.
- [ ] Name button opens the panel, and shows "in <parent>" for subtasks.
- [ ] Inline status select → PATCH `{statusId}`; inline assignee; Start and Due date inputs → PATCH `{startOn}` / `{dueOn}`; priority select; tags are shown.

### Calendar view
- [ ] Previous / Today / Next month. A 6-week grid with up to 4 tasks per day ("+N more"). Clicking a task opens the panel. Shows a count of undated tasks.

### Section editor (StatusEditor modal)
- [ ] Per row: colour, name, type (Not started / Active / Done / Closed), ↑ ↓ to reorder, ✕ to delete. "+ Add status".
- [ ] "Also add these sections to other lists" (the lists come from GET `/api/work/structure`), with checkboxes and "Every list/None".
- [ ] Save → PUT `/api/work/lists/<id>/statuses` `{statuses}`. For each extra list it also GETs and PUTs that list's statuses, adding only the missing ones. Then `window.location.reload()`.

### Fields editor (FieldEditor modal)
- [ ] Rename a field on blur → POST `/api/work/lists/<id>/fields` `{action:"update",fieldId,name}`.
- [ ] Delete (ConfirmButton) → `{action:"delete",fieldId}`.
- [ ] Add a field: name, type (14 types: text, long_text, number, currency, date, checkbox, dropdown, labels, person, url, email, phone, rating, progress), and options for dropdown/labels → `{action:"create",...}`. Then reload.

### Automations editor (modal)
- [ ] Loads with GET `/api/work/lists/<id>/automations` (rules and recent runs).
- [ ] Toggle switch → POST `{action:"toggle",automationId,enabled}`. Delete (ConfirmButton) → `{action:"delete"}`.
- [ ] Builder:
  - **When:** status changed (to any or a chosen status), task created, priority changed, tag added, someone assigned.
  - **If:** always, has tag, priority is, status is, no assignee.
  - **Then:** post a comment, change status, change priority, add tag, remove tag, assign someone, set due in N days.
  - A preview sentence, an optional name, and "Create rule" → `{action:"create",name,trigger,conditions,actions}`.
- [ ] Recent runs list (Ran / Failed / Skipped).

### Task panel (ItemPanel)
**Opening, closing and loading**
- [ ] Loads with GET `/api/work/items/<id>`, which returns the item and `watching`.
- [ ] Escape closes it when focus is not in a field. Clicking the overlay closes it.

**Header**
- [ ] **Move to another list:** select in the breadcrumb (lists from GET `/api/work/lists`) → PATCH `{listId}`.
- [ ] Ancestor breadcrumb buttons open the parent task.
- [ ] Shows "Saving… / All changes saved".
- [ ] **Follow/Following** → PATCH `{watching}`.
- [ ] Delete 🗑 (ConfirmButton) → DELETE `/api/work/items/<id>`. Close ✕.

**Main fields**
- [ ] Title textarea: Enter blurs, and saving on blur PATCHes `{title}`. Dictate "Say the name".
- [ ] Status select → `{statusId}`. The ✓ "Mark complete" quick button.
- [ ] Assignees: remove × or "+ Add" through PeoplePicker → `{assigneeIds}`.
- [ ] Start and Due dates → `{startOn}` / `{dueOn}`. Due shows "Overdue" when late.
- [ ] Priority select → `{priority}`.
- [ ] Tags: remove ×; add with Enter, a comma, or on blur → `{tags}`.

**AssistBox (✨ Assistant)**
- [ ] GET `/api/work/items/<id>/assist` returns `available` and `source`. If no assistant is set up, it links to `/connections#ai`.
- [ ] Summarize; Suggest tags (canEdit); Suggest next steps (canEdit) → POST `/api/work/items/<id>/assist` `{action}`.
- [ ] Post summary as a comment → `{comment}`.
- [ ] Click a suggested tag to add it.
- [ ] Tick suggested steps, then "Add as subtasks" (QuickAdd POST for each).
- [ ] Dismiss buttons.

**Lower sections**
- [ ] Custom fields: `FieldInput` for each type → PATCH `{fieldValues:{id:value}}`. **The Description editor is nested inside this block** (see the bugs list).
- [ ] Description textarea saves on blur → `{description}`. Dictate.
- [ ] **RemindersPanel** (`components/work/reminders-panel.tsx`), all via GET/POST `/api/work/items/<id>/reminders`:
  - Suggest with AI → `{action:"suggest"}`. The proposal can be edited (dates and notes, drop rows, a proposed due date), then "Keep these" → `{action:"apply",reminders,dueOn?}`, or "Throw away".
  - Change a reminder's date → `{action:"update",id,remindOn}`. Delete × → `{action:"delete",id}`.
  - "+ Add one" (date capped at the due date) → `{action:"add",remindOn}`.
  - "Remove all" → `{action:"clear"}`.
  - All of these need canEdit.
- [ ] Subtasks:
  - Progress bar.
  - **Tick a subtask** without opening it → PATCH the child's `{statusId}`.
  - Open a subtask.
  - "+ Add subtask" → POST the list's items with `parentId`.
- [ ] "What this depends on": **LinkPanel** (`components/work/link-panel.tsx`)
  - GET `/api/work/links?checks=1&item=` returns the links and their problems.
  - Groups: blockedBy / blocking / related. Clicking one opens that task. Unlink → POST `/api/work/links` `{action:"remove",linkId}`.
  - "+ Link another task": choose a direction, search with GET `/api/work/search?q=`, then link → POST `{action:"add",fromItemId,toItemId,kind:"BLOCKS"|"RELATES"}`.
- [ ] Checklists:
  - Tick an entry → `{entryDone:{entryId,done}}`.
  - "+ Add item" → `{checklistEntry}`.
  - "+ New checklist" → `{checklist:{name}}`.
- [ ] Attachments: external links, read-only.

**Activity sidebar**
- [ ] Created and updated events; comments with mentions rendered.
- [ ] Comment composer (canEdit): MentionBox (Ctrl+Enter sends), Dictate, Comment → PATCH `{comment}` (stored with mention ids).

---

## `/spaces`: Departments and lists
**Renders:** `app/(app)/spaces/page.tsx` → `components/work/space-manager.tsx`. **CSS:** an inline `spacesCss` string in `page.tsx` (`.spaces-*`) and `smCss` (`.sm-*`).

**Actions (all POST `/api/work/structure`, then `router.refresh`)**
- [ ] "New department" form → `{action:"create",kind:"space",name}`.
- [ ] Department Rename → `{action:"rename",kind:"space"}`. Remove (ConfirmButton) → `{action:"archive",kind:"space"}`.
- [ ] Each list links to `/lists/<id>` with its open count. "Move to…" another department → `{action:"move",kind:"list",id,spaceId}`. Rename. Remove (ConfirmButton) → `{action:"archive",kind:"list"}`.
- [ ] Folder lists are links only (no edit controls).
- [ ] "+ Add a list" → `{action:"create",kind:"list",spaceId,name}`.

**Gating:** every edit control needs `canEdit`.

---

## `/calendar`: Task calendar
**Renders:** `app/(app)/calendar/page.tsx` → `modules/calendar/components/calendar-page.tsx` (server component, reads `loadDashboardItems`). **CSS:** inline `calendarCss` (`.cx-*`, `.calendar-experience`).

**Query param:** `?m=<offset>`, clamped to −24…24 months.

**Actions**
- [ ] Previous / Next month links (`/calendar?m=`). "Today" (`/calendar`) appears when the offset is not 0.
- [ ] Day cells that have tasks are anchors to `#agenda-<date>`.
- [ ] Each agenda task links to `/lists/<l>?item=<id>`. "My work" goes to `/tasks`.
- [ ] Summary chips: open this month, dates with work, overdue.

No create or edit actions.

---

## `/dashboards`: Command dashboard ("Reports")
**Renders:** `app/(app)/dashboards/page.tsx` (server component) plus `components/work/dashboard-editor.tsx`. **CSS:** inline `cdCss` (`.cd-*`), the `command-experience` styles in `experience-v2.css`, and `deCss`.

**Query param:** `?id=<dashboardId>` selects a dashboard (default is the first).

**Shows**
- A hero with squadron totals and health links, KPI number tiles (count widgets) and open goals (up to 4).
- A next-14-days strip and item-list widgets.
- A status breakdown stack, open work by list, duties by role, a next-five-years duty outlook, and note (text) widgets.

**Actions**
- [ ] Health links: "N dated tasks have no owner" → `/tasks?owner=none&from=command`; "N positions vacant" → `/staff`; "N on leave" → `/staff`.
- [ ] Dashboard switcher (shown when there is more than one) → `/dashboards?id=`.
- [ ] Quick links:
  - All tasks → `/tasks?scope=all&from=command`
  - Compliance → `/compliance`
  - Personnel → `/staff`
  - Task calendar → `/calendar`
  - Documents → `/documents`
  - Finance → `/finance`
- [ ] KPI tiles link to `/tasks?due=&status=&tag=&priority=&from=command`, built from the widget's filters.
- [ ] Goals → `/goals`. Strip day → `/tasks?date=YYYY-MM-DD&from=command`. Item rows → `/lists/<l>?item=`. List bars → `/lists/<id>`. Role bars and "Manage duties" → `/duties`.
- [ ] **"✎ Customize"** (needs `canEdit` and an existing dashboard) opens the DashboardEditor drawer. Every change is POST `/api/work/dashboards/<id>/widgets`, then `router.refresh`:
  - Move ↑/↓ → `{action:"reorder",widgetIds}`.
  - Edit ✎, then "Save card" → `{action:"update",widgetId,widget}`.
  - Remove (ConfirmButton) → `{action:"delete",widgetId}`.
  - "+ Add card" → `{action:"create",widget}`.
  - Card form: type (Number tile, Task list, Work by status, Workload by person, Work by tag, Note), title, list, due, status, tag, include finished, colour (count cards), limit 5/10/15/25 (task lists), note text (5000 characters).
- **Rendering gap:** the page only renders count, item_list, status_breakdown and text widgets. `assignee_workload` and `tag_breakdown` cards can be created but are never displayed.

---

## `/goals`: Goals
**Renders:** `app/(app)/goals/page.tsx` → `components/goals/goals-board.tsx`. **CSS:** `glCss`.

**Gating:** `canEdit` (not READ_ONLY) shows the composer and every mutating control. Everything goes to POST `/api/goals`.

**Actions**
- [ ] "Set up a goal by describing it": textarea and Dictate, then "Work it out" → `{action:"draft",prompt}`.
  - The draft can be edited (name, detail, horizon, date, steps with list and due date, remove or add steps).
  - "Throw it away", or create → `{action:"createFromDraft",...}`.
- [ ] Department filter select (areas). Client-side.
- [ ] Two sections, "This year" (SHORT) and "Beyond this year" (LONG). Each has:
  - "New goal" → form with name, detail, by when, owner, area → `{action:"create"}`.
  - Suggestion buttons that pre-fill the form when the section is empty.
- [ ] Goal card:
  - Progress percentage and bar. Step links go to `/lists/<l>?item=`. Remove a step × → `{action:"removeStep",stepId}`.
  - "+ Add a step" (title, list, due) → `{action:"addStep"}`.
  - **"Fill from the regs"** → `{action:"fillFromRegs",goalId}`, which shows "Where these came from" sources with Drive links.
  - "Measures (N)" / "+ Measure a number":
    - Target form (label, kind, source list, target value, unit) → `{action:"addTarget"}`.
    - Set the current value or toggle it → `{action:"setTarget",targetId,current}`.
    - Remove × → `{action:"removeTarget"}`.
  - "Mark met" / "Reopen" → `{action:"update",id,status}`.
  - Remove (ConfirmButton) → `{action:"delete",id}`.

---

## `/agents`: Agents
**Renders:** `app/(app)/agents/page.tsx`. It calls `listAgents(user.id, isAdmin)`, where admin means SYSTEM_OWNER or ADMINISTRATOR, then renders `components/ai/agents-board.tsx`. **CSS:** `agCss`.

**Gating:** `canEdit` (not READ_ONLY) shows "New agent" and the templates. Per-agent Edit and Remove depend on `agent.canEdit`, which comes from the server.

**Actions**
- [ ] Unread badges from GET `/api/ai/agents/run`.
- [ ] "New agent", or start from a template: Filing Clerk, Deadline Watch, Meeting Prep.
- [ ] Form: icon emoji, name, purpose, standing instructions, what it watches (a list or everything), the daily-look checkbox (`schedule DAILY`), and the share checkbox. "Create"/"Save" → POST `/api/ai/agents` `{action:"create"|"update",...}`, then `router.refresh` (the sidebar updates).
- [ ] Card "Ask" dispatches `hub:ask` with `{agentId,agentName}`.
- [ ] Edit; Remove (ConfirmButton) → `{action:"delete",id}`.
- [ ] Two sections: Shared with the squadron, and Yours.

---

## `/documents`: Documents (Shared Drive)
**Renders:** `app/(app)/documents/page.tsx` → `modules/documents/components/documents-page.tsx` → `components/drive/drive-browser.tsx`. **CSS:** `documentExperienceCss` (`components/drive/document-experience.ts`, `.dx`) plus `.drive-*` in `globals.css` / `clickup-theme.css`.

**Gating:** `readOnly = role === READ_ONLY` hides New folder, Upload, Rename and Trash.

**Query params:** none read. The sidebar's `/documents?folder=references` is ignored (see the bugs list).

**Actions**
- [ ] Loads with GET `/api/drive/files?parentId=&search=`. If Drive is not configured, a "not configured" panel is shown instead.
- [ ] Folder breadcrumb buttons; search ("Search this folder", reloads on every keystroke); Refresh.
- [ ] "New folder" form → POST `/api/drive/files` `{kind:"folder",name,parentId}`.
- [ ] Upload (hidden file input) → POST `/api/drive/files` as multipart `file` and `parentId`.
- [ ] Clicking a row opens a folder (pushed onto the breadcrumb) or opens the file's `webViewLink` in a new tab.
- [ ] Download → `<a href="/api/drive/download/<fileId>">`.
- [ ] Open in Google Drive (external link).
- [ ] Rename (inline form) → PATCH `/api/drive/files/<id>` `{name}`.
- [ ] Trash → **`window.confirm`**, then DELETE `/api/drive/files/<id>`.

---

## `/staff`: People and positions ("Members")
**Renders:** `app/(app)/staff/page.tsx` → `modules/staff/components/staff-page.tsx`. **CSS:** `staffExperienceCss` (`modules/staff/components/staff-experience.ts`, `.staff-experience`) plus `globals.css` (`.staff-area-row`, `.staff-assignment-form`, `.org-*`).

**Gating:**
- `canManage` = SYSTEM_OWNER or ADMINISTRATOR.
- `canDelete` = SYSTEM_OWNER only.

**Shows**
- Four metric cards: Personnel, Filled, Vacancies, On Leave.
- The organisation chart, the personnel directory, Committees (read-only), Functional area ownership, and Hub-linked workload.

**Actions**
- [ ] "Assign duty" in the header (canManage) opens a form: member (Hub users, plus roster members without an account), functional area, duty title, start date, primary → POST `/api/staff/assignments` `{userId|personnelMemberId,functionalAreaKey,dutyTitle,isPrimary,startsOn}`.
- [ ] Organisation chart (canManage):
  - "Change" opens the editor.
  - Incumbent select (vacant, or an active senior member) → POST `/api/staff/positions` `{action:"assign",positionId,incumbentId,assignmentStatus}`.
  - "Mark acting / Not acting" → the same action.
  - Assistant title input plus "+ Add an assistant" select (grouped Senior members / Cadets) → `{action:"addAssistant",positionId,memberId,roleTitle}`.
  - Remove assistant × → `{action:"removeAssistant",assistantId}`.
  - Close.
- [ ] Directory: search on name, rank and note. "Change" (canManage) opens a status select (Active / On leave / Inactive) and a note field, with Save → `{action:"member",memberId,status,statusNote}`. Close.
- [ ] Functional area chips:
  - "End" (canManage) → **`window.prompt`** for an end date, then PATCH `/api/staff/assignments/<id>` `{endsOn}`.
  - Delete 🗑 (canDelete, ConfirmButton) → DELETE `/api/staff/assignments/<id>`.

---

## `/duties`: Who does what
**Renders:** `app/(app)/duties/page.tsx` → `components/work/reg-reader.tsx`, which is hidden for READ_ONLY, and `components/work/duties-board.tsx`. **CSS:** `rrCss`, `dtCss`.

**RegReader actions**
- [ ] Polls GET `/api/regs` every 8 seconds.
- [ ] "Check the Drive" → POST `/api/regs` `{action:"refresh"}`.
- [ ] "Read all N" → POST `{action:"read-pending"}`, looping up to 60 rounds.
- [ ] Per document: "Open" (Drive link), and "Read it / Read again" → `{action:"read",id}`.
- [ ] At most 25 documents are shown.

**DutiesBoard actions (canEdit; all POST `/api/work/duties`, then refresh)**
- [ ] "+ Add a duty" form: role, title, cadence (monthly / quarterly / twice a year / annual / every N years / once), interval, month, day, source, notes → `{action:"create",duty}`.
- [ ] Waiting-for-confirmation list: Confirm → `{action:"confirm",dutyId}`; Reject → `{action:"reject"}`.
- [ ] Confirmed duties, grouped by role: Delete (ConfirmButton) → `{action:"delete"}`.
- [ ] A next-five-years outlook as `<details>` per year.

---

## `/development`: Professional development
**Renders:** `app/(app)/development/page.tsx` → `components/work/development-board.tsx`. **CSS:** `dvCss`, plus `.development-page-experience` in `experience-v2.css`.

**Gating:** `canEdit` comes from the API (GET `/api/development`), not from the page.

**Actions (all POST `/api/development`)**
- [ ] "Paste duty positions" (an eServices table) → `{action:"positions",text}`.
- [ ] "Use the staff records where nothing is set here" toggle → `{action:"chart",use}`.
- [ ] Ladder: Remove a step → `{action:"removeStep",stepId}`. Add a step (from level, to level, title, citation) → `{action:"step"}`.
- [ ] Member list: search by name, CAPID, duty or specialty; level filter (All / None / LV1–LV5).
  - "Correct" the position (saves on blur) → `{action:"member",capid,dutyPosition,clearPosition}`.
  - "Ignore it" → `{ignoreSource:true,clearPosition:true}`. "Use it again" → `{ignoreSource:false}`.
  - Level select → `{action:"member",capid,pdLevel}`.
  - "Put it on their list" → `{action:"prompt",capid}`.

---

## `/assets`: Vehicles and equipment
**Renders:** `app/(app)/assets/page.tsx` → `modules/assets/components/assets-page.tsx` → `components/assets/asset-board.tsx`. **CSS:** an inline `.ap-miles` string in assets-page, and `abCss`.

**Gating:** `canManage` = SYSTEM_OWNER, ADMINISTRATOR or STAFF_MEMBER covers Add, Edit, Unserviceable and Remove. Sign out and Book in are open to everyone, including READ_ONLY in the UI.

**Shows:** the miles-this-month banner.

**Actions (all POST `/api/assets`)**
- [ ] "Add something" opens the editor sheet: kind, name, CAP number, custodian, assigned date, then for vehicles odometer, inspection due and registration expiry, plus notes. Save → `{action:"save",...}`. Remove has **no confirmation** → `{action:"delete",id}`.
- [ ] "Sign out" (driver defaults to the current user, destination, purpose, odometer out) → `{action:"out",id,memberId,purpose,destination,odometerOut}`.
- [ ] "Book back in" (odometer in) → `{action:"in",id,odometerIn}`.
- [ ] "Mark unserviceable" / "Back in service" → `{action:"status",id,status:"GROUNDED"|"AVAILABLE"}`.
- [ ] A "returned to wing" `<details>` list.

---

## `/finance`: Finance tracker
**Renders:** `app/(app)/finance/page.tsx` → `components/finance/finance-tracker.tsx` (`FinanceTracker`, `EditEntry`, `OwedList`, `BudgetTable`, `CommitteeLog`). **CSS:** `finCss`, plus `.fin-experience` in `operations-modules.css`.

**Query param:** `?view=ledger|owed|budget|committee` sets the starting tab. Switching tabs calls `history.replaceState` to `/finance?view=…`.

**Gating:** `canEdit` (not READ_ONLY) for every mutation. Everything is POST `/api/finance`, then `router.refresh`.

**Shows and does**
- [ ] Tabs: Ledger / Owed / Budget / Committee.
- [ ] Fiscal year select → GET `/api/finance?fy=<year>`.
- [ ] Seven tiles: On hand, In, Out, Net, Donated goods, Outstanding, Budgeted out.
- [ ] Opening balance form (shown when the balance is unknown): amount and source → `{action:"opening",fiscalYear,cents,source}`.
- [ ] "Tell it where you are": textarea and Dictate, then "Work it out" → `{action:"describe",said,fiscalYear}`.
  - The draft rows can be edited (Moved/Owed, direction, amount, date, category, purpose, drop a row).
  - "Throw away", or "Record them" → `{action:"applyDraft",fiscalYear,openingCents,entries}`.
- [ ] "What the ledger says" findings: "Make it a task" → `{action:"task",listId,title,detail}`, filed in the first list whose space name matches /finance/, else the first list.
- **Ledger tab**
  - [ ] "Show void" checkbox. "Record money" form (direction, amount, date, category, counterparty, purpose, in-kind, item detail, value basis) → `{action:"record",...}`.
  - [ ] Filters: text, category, state, quarter, Clear.
  - [ ] Expanding a row shows details. The Task link goes to `/tasks?item=<id>`, which does not work (see the bugs list).
  - [ ] Edit (EditEntry form: amount, date, category, counterparty, wing reference, purpose, item and value basis, notes) → `{action:"update",id,...}`.
  - [ ] Next-state button (Check requested / Deposit advice sent / Check received / Wing has it) → `{action:"update",id,status}`.
  - [ ] "Approved by" select → `{action:"update",id,approvedBy}`.
  - [ ] Void → **`window.prompt`** for a reason, then `{action:"void",id,reason}`.
- **Owed tab**
  - [ ] "Record something owed" (direction, amount, due, counterparty, category, purpose) → `{action:"owe",...}`.
  - [ ] Received/Paid → `{action:"settle",id,occurredOn}`.
  - [ ] Write off → **`window.prompt`**, then `{action:"writeOff",id,reason}`.
- **Budget tab**
  - [ ] Planned amount input per category (saves on blur) → `{action:"budget",fiscalYear,category,plannedCents}`.
  - [ ] Add a budget line (category and amount).
- **Committee tab**
  - [ ] Meeting log. "Record the meeting" (date, attendees, decisions) → `{action:"meeting",metOn,attendees,decisions}`.
  - [ ] Link to the finance list `/lists/<id>`.

---

## `/compliance`: Compliance requirements
**Renders:** `app/(app)/compliance/page.tsx` → `modules/compliance/components/compliance-page.tsx`. **CSS:** `.compliance-*` in `globals.css` and `.compliance-experience` in `operations-modules.css`.

**Gating:**
- `canEdit` (not READ_ONLY): New requirement, Pause, Activate, Retire.
- `canDelete` (SYSTEM_OWNER or ADMINISTRATOR): Delete.

**Shows:** metric cards for Active, Overdue, Due This Month and Paused.

**Actions**
- [ ] "New requirement" form: name, area, responsible member, recurrence (daily / weekly / monthly / quarterly / annually), next due, source, description, evidence lines → POST `/api/compliance`.
- [ ] Search; filter tabs All / Active / Overdue / Paused / Retired (client-side).
- [ ] Pause / Activate / Retire → PATCH `/api/compliance/<id>` `{status}`.
- [ ] Delete (ConfirmButton) → DELETE `/api/compliance/<id>`.

---

## `/readiness`: Readiness preview (DEMO DATA)
**Renders:** `app/(app)/readiness/page.tsx` (server component, no client component). **CSS:** `.readiness-experience` (`operations-modules.css`), `.readiness-list` (`globals.css`), `.demo-disclosure` (`hub-pages.ts`).

**Shows:** a demo banner, four sample metrics (sample findings is hard-coded to 7, sample evidence to "91%") and illustrative per-area scores.
- **All of it comes from `lib/mock-data.ts` (`functionalAreaStatus`).**

**Actions**
- [ ] Links to `/compliance`, `/staff` and `/tasks` from the disclaimer.
- [ ] "View real compliance requirements" → `/compliance`. "View personnel" → `/staff`.

---

## `/communications`: Communications Center (static placeholder)
**Renders:** `app/(app)/communications/page.tsx` → `modules/communications/components/communications-page.tsx`. **CSS:** `.communications-center` (no specific rules found), `.record-*`, `.action-*`.

- [ ] There are no actions. The "Announcement workflow", "Record a decision" and "Create follow-up work" cards are display-only text ("Publishing integrations are not currently enabled").
- The sidebar calls this page "Announcements", but real alerts are sent from `/notifications`.

---

## `/notifications`: Notifications
**Renders:** `app/(app)/notifications/page.tsx` → `modules/notifications/components/notifications-page.tsx`, which contains `AlertComposer` (hidden for READ_ONLY), `NotificationCenter` and `AddressBook`. **CSS:** `acCss`, `ncCss`, `nabCss`.

**AlertComposer**
- [ ] "Write an alert" toggle. People come from GET `/api/directory`.
- [ ] Choose people individually or with "Everyone (N)" / "Clear all".
- [ ] Subject; message with Dictate; "Send the email now" urgent checkbox.
- [ ] Send → POST `/api/announcements` `{userIds,subject,body,urgent}`.

**NotificationCenter**
- [ ] Email choice radios (Follow squadron / Always / Never) → POST `/api/notifications` `{action:"emailChoice",choice}`.
- [ ] "Send me one now" → `{action:"test"}`.
- [ ] Mark all read → `{action:"read"}`. Clear all → `{action:"clear"}`. Clear one × → `{action:"clear",ids}`.
- [ ] Each notice links to `/lists/<l>?item=<i>` when it has a task.
- A `setEmail` / `{action:"prefs"}` handler exists but nothing calls it.

**AddressBook**
- [ ] Shown only if the user has a CAPID; otherwise an explanatory message appears.
- [ ] Toggle notify per address → POST `/api/notifications/addresses` `{action:"notify",email,notify}`.
- [ ] "Enter code" for unverified addresses, then a 6-digit code and Confirm → `{action:"confirm",email,code}`. "Not now".
- [ ] Remove × → `{action:"remove",email}`.
- [ ] Add address (email and label) → `{action:"add",email,label}`, which moves to the code step.

---

## `/connections`: My connections
**Renders:** `app/(app)/connections/page.tsx`, which contains `MailSuggestions`, `MailboxesCard`, `AiChoiceCard` and `ConnectionsBoard` (`components/connections/*`). **CSS:** `msCss`, `mbx`, `ac`, `cxCss`.

**Query params:** `?mail=<outcome>&why=<text>` are read by MailboxesCard to show the OAuth result, then removed with replaceState. `#mail` is the anchor on MailSuggestions.

**MailSuggestions (`#mail`)**
- [ ] "What it reads by default" radios (Unread / Inbox / All) → POST `/api/google/gmail/suggestions` `{action:"scan",mode}`.
- [ ] Settings load from GET `?settings=1`.
- [ ] Autopilot switch → `{action:"autopilot",on}`.
- [ ] Suggestions come from GET `/api/google/gmail/suggestions`. "Add it" → POST `{title,dueOn,from,subject,internetId}`.

**MailboxesCard**
- [ ] Mailbox picker select. For the sign-in account, a scope select → the gmail suggestions `{action:"scan",mode}`.
- [ ] Per added account:
  - Scope select → POST `/api/google/mailboxes` `{action:"scan",id,mode}`.
  - "Check it works" → `{action:"check",id}`.
  - Remove (ConfirmButton) → `{action:"remove",id}`.
- [ ] Links that leave the app: "Connect a Gmail mailbox" → `/api/auth/google/start?add=mailbox`; personal Microsoft → `/api/auth/microsoft/start?kind=personal`.
- [ ] Work Microsoft form (address) → `window.location` to `/api/auth/microsoft/start?kind=work...`.

**AiChoiceCard**
- [ ] Radio for which AI to use: the squadron server, or connected vendors → POST `/api/ai/provider` `{choice}`.

**ConnectionsBoard** (sections Files / Email / AI; all POST `/api/connections` `{provider,...}`)
- [ ] Gmail: "Connect Gmail" → `/api/auth/google/connect?scope=gmail`; "Also let it read your mail" → `?scope=gmail-read`.
- [ ] API-key providers: "Connect X" opens a key form (base URL when needed, key with show/hide, "Open the key page" external link) → `{action:"save",apiKey,baseUrl}`.
  - "Test again" → `{action:"test"}`. "Replace key".
  - Disconnect (ConfirmButton) → `{action:"disconnect"}`.

**Gating:** none beyond being signed in. Everything is per-user.

---

## `/integrations`: Integrations
**Renders:** `app/(app)/integrations/page.tsx` → `components/integrations/capwatch-card.tsx` and `integrations-board.tsx`. **CSS:** `.integrations-experience` (`operations-modules.css`), `.integrations` (`clickup-theme.css`), `cw-*`.

**Gating:**
- `mayManageCapwatch` / `isAdmin` = SYSTEM_OWNER or ADMINISTRATOR. For non-admins the CAPID and credential date are blanked server-side.
- `canRequest` = not READ_ONLY.

**CapwatchCard**
- [ ] "Refresh status" → GET `/api/integrations/capwatch`.
- [ ] Admin only:
  - Test → POST `/api/integrations/capwatch` `{action:"test"}`.
  - Sync now → POST `/api/capwatch/sync`, then polls the status.
  - "Replace credentials" form (CAPID, password with show/hide) → `{action:"save",capid,password}`. Cancel.

**IntegrationsBoard**
- [ ] Category tabs: All / Sign-in & files / Calendar & email / Work management / Chat / Developer.
- [ ] Search.
- [ ] Admin: Mark connected / Disable / Reset → POST `/api/integrations` `{provider,status}`.
- [ ] Non-admin: "Request setup" → `{status:"REQUESTED"}`.

---

## `/settings`: Settings
**Renders:** `app/(app)/settings/page.tsx` (server), which contains `components/settings/squadron-email.tsx` and `components/settings/drive-service-account.tsx`. **CSS:** `.settings-experience`, `.settings-jump*`, `.settings-advanced` (`experience-v2.css`), `.settings-form`.

**Anchors:** `#email`, `#access`, `#connections`, `#configuration`.

**Gating:**
- `canAdministerAccounts` (SYSTEM_OWNER or ACCOUNT_APPROVER) shows the "Manage users" link.
- `canEditNotifications` (SYSTEM_OWNER or ADMINISTRATOR) enables the email-level radios.
- Drive key management needs `mayManage` from the API.

**Actions**
- [ ] Jump links to the four anchors.
- [ ] Squadron email level radios → POST `/api/settings/notifications`.
- [ ] Shows "Your Hub role". "Manage users and succession" → `/admin/users` (gated). "Activity history" → `/audit`.
- [ ] Operational connections: status display, plus "All integrations" `/integrations` and "My connections" `/connections`.
- [ ] **Squadron profile form is read-only and hard-coded:** "Oak Ridge Composite Squadron", "TN-170", America/New_York.
- [ ] The system hosting card is static text.
- [ ] Advanced `<details>` holds DriveServiceAccount:
  - Status from GET `/api/integrations/drive`.
  - Paste the JSON key (textarea) → POST `{action:"save",key}`.
  - Check → `{action:"check"}`.

---

## `/settings/security`: Security controls
**Renders:** `app/(app)/settings/security/page.tsx` → `components/security/security-controls.tsx`.

**Gating:** visible only to SYSTEM_OWNER or ADMINISTRATOR. Others see "Only a system owner or administrator may see this."

**Actions**
- [ ] "Check now" → GET `/api/security` (no-store), which re-runs the attestation controls.

---

## `/audit`: Activity history
**Renders:** `app/(app)/audit/page.tsx` → `modules/audit/components/audit-page.tsx` → `audit-explorer.tsx`. **CSS:** `.audit-*` (`experience-v2.css`, `globals.css`).

**Gating:** none beyond the layout's `requireUser`. Every role can see the latest 200 events.

**Actions (client-side only)**
- [ ] Search; record-type select; "Clear filters".
- [ ] Events are grouped by day. Read-only.

---

## `/admin/users`: User administration
**Renders:** `app/(app)/admin/users/page.tsx` calls `requireRole(["SYSTEM_OWNER","ACCOUNT_APPROVER"])` and renders `CapabilityRequests`, `RosterManager`, `AddMember` and `UserAdministration` (`components/admin/*`). **CSS:** `.admin-experience`, `.user-table`, `.admin-user-finder` (`operations-modules.css`, `globals.css`) and each component's inline CSS.

**CapabilityRequests**
- [ ] Loads with GET `/api/admin/capability-requests[?all=1]`. "Show everything / open only".
- [ ] "Going to build" / "Built" / "Not doing" → POST `{id,status:"PLANNED"|"BUILT"|"DECLINED"}`.

**RosterManager**
- [ ] Loads with GET `/api/admin/roster`.
- [ ] "Load/Update from eServices" (paste a table) → POST `{action:"import",text}`.
- [ ] "Who are these?": pick a roster member for each unmatched email, then Link → `{action:"link",email,capid}`.

**AddMember**
- [ ] "+ Add member" form: name, email, duty title, role (Staff / Administrator / Read only) → POST `/api/admin/users/invite`.

**UserAdministration**
- [ ] Duplicate pairs: "Merge" (SYSTEM_OWNER only, ConfirmButton) → POST `/api/admin/users/action` `{action:"MERGE",targetId,mergeFromId}`.
- [ ] A role glossary.
- [ ] Search; status filter (All / Approved / Pending / Suspended / Restricted / Closed).
- [ ] Role select (enabled for SYSTEM_OWNER only) → **`window.confirm`**, then `{action:"SET_ROLE",targetId,role}`.
- [ ] Suspend (disabled on your own account) → `{action:"SUSPEND"}`. Reactivate → `{action:"REACTIVATE"}`.

---

## `/admin/members`: Member access (no link anywhere in the UI)
**Renders:** `app/(app)/admin/members/page.tsx`. It redirects to `/` unless `canManageAccess` (SYSTEM_OWNER or ACCOUNT_APPROVER), then renders `components/admin/member-access-table.tsx`.

**Actions**
- [ ] Search; filter buttons: Everyone / Authorized / Restricted / Not configured / No login address / No longer active in CAP.
- [ ] Edit the login address (inline form) → POST `/api/members/access` `{action:"login_email",capid,email}`.
- [ ] Restrict (ConfirmButton) → `{action:"restrict",capid}`.
- [ ] Grant access (needs a login email) → `{action:"grant",capid}`.

---

## `/start-here`: Start here (help)
**Renders:** `app/(app)/start-here/page.tsx` (server). **CSS:** an inline `shCss` string plus `.action-card`, `.record-row`.

- [ ] "First five minutes" links: `/`, `/spaces`, `/staff`.
- [ ] "Where things live": 10 section links (`/`, `/spaces`, `/calendar`, `/goals`, `/agents`, `/documents`, `/dashboards`, `/staff`, `/connections`, `/settings`).
- [ ] Everything else is static explanatory cards. They still say "Down the left edge… Press one and its menu opens beside it" and describe "Spaces / Planner / Command / Connect", which is the older navigation model.

---

## API endpoints no page calls
- **No caller:** `/api/tasks`, `/api/tasks/[taskId]`, `/api/schedules/draft`, `/api/work/items/[id]/draft-email`, `/api/discord`, `/api/regs/catch-up`, `/api/health`.
- **Only called by an unused component:** `/api/email-intake` (from `components/connections/email-intake-card.tsx`, which nothing imports).

---

## Things the redesign should know about (existing bugs and gaps)
1. **The task description is only visible on lists that have custom fields.** In `list-workspace.tsx` around lines 2018–2059, the Description `<section>` sits inside the `{fields.length ? (...) : null}` "Custom fields" block. On a list with no custom fields, the task panel shows no description editor at all.
2. **Clicking a sidebar agent usually does nothing.** Sidebar agent links go to `/?agent=<id>`, but AssistantPanel reads `?agent` only once, when it first mounts, and AppShell stays mounted across client-side navigation.
3. **`/staff#committees` is a dead anchor.** `SectionCard` renders no `id`.
4. **`/documents?folder=references` is ignored.** DocumentsPage and DriveBrowser read no search params.
5. **`/connections#ai` is a dead anchor.** It is linked from the task-panel AssistBox. The only real ids are `cx-ai` and `ac-title`.
6. **Two literal strings render on screen in `mailboxes-card.tsx`:** the option label shows `" ' + EMDASH + ' the one you sign in with"`, and the busy button shows `"Checking' + ELLIPSIS + '"`.
7. **The finance ledger "Task" link goes to `/tasks?item=<id>`.** The `/tasks` page does not understand `?item`.
8. **Browser `window.confirm` / `window.prompt` are still used** (they can be silently suppressed): Drive Trash, staff "End" assignment, finance Void and Write off, and the admin role change.
9. **Asset "Remove" and many delete or unlink actions have no confirmation:** link removal, ladder step removal, goal step and target removal, reminder delete, and notification clear.
10. **Sidebar department and list rename, delete and drag are shown to READ_ONLY users.** Only the API refuses them.
11. **Two dashboard card types never render.** `assignee_workload` and `tag_breakdown` can be created in Customize, but the dashboards page has no renderer for them.
12. **Demo, static and orphaned items:**
    - `/readiness` is entirely mock data.
    - `/communications` is static.
    - The squadron profile in Settings is hard-coded and disabled.
    - `EmailIntakeCard` and NotificationCenter's `setEmail` are unused.
    - `/admin/members` is not linked from anywhere in the UI.
