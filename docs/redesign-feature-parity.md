# TN-170 Operations Hub — UI/UX Redesign Feature-Parity Checklist

**Status:** Draft acceptance checklist. Checked boxes below are requirements, not claims of successful verification.  
**Scope:** Both desktop and mobile. Preserve existing functionality, API behavior, Cloudflare D1 records, Google Drive access, CAPWATCH, role permissions, automations, and audit history.

## Design rules

- **Simple first, advanced always accessible.** Use plain language, obvious actions, and familiar navigation; retain power-user functions.
- **No Air Force identity.** The application must not use the U.S. Air Force logo or an imitative insignia. Official CAP imagery needs separate authorization. A neutral TN mark is used in the new app shell.
- **Data and permissions stay authoritative.** No UI-only access checks may replace server-side authorization.
- **No silent feature retirement.** An existing route/action must map to a new destination, remain accessible, and pass verification before the replacement ships.
- **Accurate implementation claims.** Preserve the distinction between actual D1-backed modules and demonstration/proposed modules.

## Canonical navigation and feature audit

| Area | Routes / functionality to verify |
| --- | --- |
| Home | `/`, assigned task summary, personal vs squadron totals, deadlines, links, announcements |
| Tasks and workspaces | `/tasks`, `/spaces`, `/lists/[listId]`, scope filters, nested spaces/folders/lists, saved views, task details, subtasks, priorities, assignees, custom fields, statuses, bulk updates |
| Calendar | `/calendar`, date browsing, scheduling and existing event actions |
| Goals | `/goals`, create/view/update goals |
| AI | `/agents`, existing AI assistant, agents, conversation history, confirmation modes |
| Documents | `/documents`, Google Shared Drive browse/search/upload/download/rename/trash and permissions |
| Command and readiness | `/dashboards`, `/readiness`, `/compliance`, `/communications`, dashboard editing, inspection and evidence workflows |
| Squadron | `/staff`, `/duties`, `/development`, `/assets`, roster, duties, member records, assets |
| Finance | `/finance`, ledger/owed/budget/committee views |
| Connections | `/connections`, `/integrations`, connection management and settings |
| Administration | `/settings`, `/admin/users`, `/settings/security`, `/audit`, access restrictions and recorded administrative actions |

Additional routes and hidden modals must be inventoried from the actual page and component tree before merging.

## Desktop and mobile release gates

- [ ] Build and TypeScript check pass on the pull request.
- [ ] App renders correctly on 390px mobile, 768px tablet, 1280px laptop, and 1600px desktop.
- [ ] Screen reader / keyboard / touch navigation verified; meaningful active-state feedback and labels.
- [ ] Main navigation, department drilldown, all nested lists, and account menu are reachable at each viewport.
- [ ] Search and shortcuts retain original behavior; logout and notifications work.
- [ ] Both light and dark modes retain legible contrast and saved preference.
- [ ] Task search, scope tabs, selection, bulk assignment, inline priority/assignee, filters, and details persist correctly.
- [ ] READ_ONLY users cannot trigger write controls; backend still enforces all privileges.
- [ ] Home counts reconcile with task lists including overdue/unassigned and filtered links.
- [ ] Google Drive file operations, CAPWATCH data refresh, recurring automation, and AI assistant remain functional.
- [ ] Sensitive member/cadet data and authentication secrets are not leaked.
- [ ] No Air Force graphic/logo remains in any view, print view, metadata, or static marketing/preview asset used by the app.
- [ ] Error, empty, loading, and success states are understandable without training.
- [ ] A nontechnical senior member can locate assigned work, read a document, find a meeting, and complete a task unaided.
- [ ] A power user can still manage custom fields, list structure, advanced workflows, saved views, and administrative actions.
- [ ] Review all changes with an independent regression pass before merging into production.

## Implementation log

### Redesign v1 / phase one
- Dedicated responsive experience stylesheet; neutral TN monogram in authenticated shell.
- Single visible main drawer with common destinations plus the full canonical section map.
- Simplified mobile bottom navigation to Home / My work / Calendar / Squadron / More.
- Rebuilt personal Home layout with existing database-backed task data and existing inline task pickers.
- Responsive task grouping, search, selection, bulk assignment, and inline editors.
- Honor read-only roles in redesigned Home and task list.
- No backend, data-model, or API migrations are included.

### Still to redesign
Task detail screens; full Calendar; document browser; staff and CAPWATCH pages; dashboards and analytics; finance; command/admin settings; accessible onboarding; comprehensive branding audit; MCP/ChatGPT/Claude integration (separate, permission-scoped workstream).

**Do not merge this PR until every release gate is satisfied and end-to-end behavior has been verified.**


### Redesign v1 / phase three
- Finance: move existing real financial summary cards ahead of data-entry and AI-assisted draft forms. Preserve fiscal-year, ledger, owed, budget, committee, status-transition and reconciliation tools.
- Compliance: add searchable and filterable recurring-requirements register, labeled pause/activate actions; preserve database-backed recurrence and permission controls.
- Account administration: add account search and status filters; confirm permission changes before sending existing role-update calls; improve network-failure notices.
- Readiness: explicitly distinguish hardcoded demonstration figures from verified operational status. Do not represent sample readiness, finding counts or evidence coverage as factual unit data.
- Integrations/CAPWATCH: introduce clear connection-health cards, a neutral data icon, and safe Refresh status via existing authenticated GET endpoint; retain credential protection and original sync/test controls.
- Keep desktop and mobile layouts consistent with the rest of the new design system.

### Phase three QA checks
- [ ] Finance values reconcile with original ledger and the fiscal-year selector, and all entry/void/clearing actions work with their original permissions.
- [ ] Compliance search, all status filters, pause/activate/retire/delete and creation forms work without losing current records.
- [ ] Admin role-change confirmation, suspend/reactivate, filters, role restrictions and error feedback pass account-by-account testing.
- [ ] Readiness reports never mistake placeholder sample figures for verified operational scores.
- [ ] CAPWATCH refresh, test and manual sync work with and without management permissions, never returning credential material to unauthorized users.
