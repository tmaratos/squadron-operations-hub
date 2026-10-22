# TN-170 — visual and feature-parity QA

**Status: in progress.** Static source checks and unauthenticated Chromium visual tests have run. Authenticated visual testing and end-to-end modification tests are NOT yet verified or signed off.

## What the automated tests do

- Route/capability guard: run node apps/web/scripts/verify-feature-parity.mjs. It checks 24 screen entrypoints, the canonical navigation map, and critical workflow sources. It cannot prove runtime behavior.
- Chromium: GitHub Actions workflow **UI Visual & Feature Parity** tests the live public sign-in screen at 390, 768, 1280, and 1600px, saving screenshots and detecting overflow and brand inconsistencies.
- Public authorization: the Chromium workflow visits 23 protected destinations as a signed-out visitor and checks for a redirect or access denial. No production mutation, account login, or external message.
- Authenticated staging: apps/web/scripts/browser-visual-regression.cjs can inspect all protected routes at all four widths with an authorized STAGING test session, including client-side search, filters, calendar, and drawer interactions. Credentials are supplied locally and never committed or uploaded.

The screenshot artifact (tn170-public-visual-regression) includes only public login captures and a JSON report. Authenticated screenshots are disabled unless specifically opted in and must never be uploaded when they contain private squadron data.

## Initial finding: deployed login branding differs from merged source

First run's production screenshots show the older squadron patch. The currently merged source in src/components/auth/login-form.tsx renders a neutral TN text mark. This is evidence of deployment/cache divergence, **not** proof the patch is an unapproved Air Force logo. The new test checks for that neutral source-defined mark. Review Cloudflare Workers Builds, active deployment revision, cache and custom domain routing before asserting the latest redesign is deployed.

## Staging prerequisites — nonnegotiable

1. Independent HTTPS staging hostname and Cloudflare Worker; DO NOT modify live Worker just for a test.
2. Separate seeded D1 containing only synthetic users, tasks, audit events, compliance entries and financial transactions; do not clone identifiable live squadron/cadet data.
3. Separate test Drive files with least-privileged permissions. No real CAPWATCH/eServices password, member secrets or cadet data.
4. Disable/mock email sending, CAPWATCH sync, background jobs and external integrations unless an authorized sandbox is specifically being tested.
5. Test identities for READ_ONLY, STAFF_MEMBER, ADMINISTRATOR, ACCOUNT_APPROVER and SYSTEM_OWNER; preserve real server-side authorization checks.
6. Recovery snapshot/reseed before each suite. Fixtures must cover no records, long names, many records, overdue/completed items, API failures and expired sessions.

## Running browser tests

In GitHub Actions, select **UI Visual & Feature Parity**. The job artifact contains public screenshots for manual inspection and a sanitized report.

For authenticated staging: install Playwright 1.56.1 and Chromium in an isolated test environment. After signing into staging with an authorized test account, save the local Playwright storage state OUTSIDE the repository and run with environment variables:

TN170_TEST_BASE_URL=https://tn170-staging.tristanmaratos.com
TN170_AUTH_STATE_PATH=/private/local/staging-admin-state.json
node apps/web/scripts/browser-visual-regression.cjs

Production-host authenticated tests are refused by the script. To capture staging screenshots of SYNTHETIC data locally, additionally use TN170_CAPTURE_PRIVATE_SCREENSHOTS=1. The CI workflow never uploads authenticated screenshots.

For each screenshot manually review touch targets, horizontal overflow, tables/forms, sticky bars, modal placement, navigation, headings, long labels, dark/light contrast, keyboard focus and empty/loading/error states. Automated visual metrics cannot judge overall usability by themselves.

## Full regression matrix

| ID | Area | Staging verification | Required roles |
| --- | --- | --- | --- |
| NAV-01 | Navigation | Desktop sidebar and mobile drawer reach all sections, lists and settings | RO, STAFF, ADMIN |
| NAV-02 | Navigation | Search, notifications, theme, breadcrumbs and back controls | RO, STAFF |
| HOME-01 | Home | Own assignments reconcile with tasks; squadron-wide counts labeled separately | STAFF, ADMIN |
| TASK-01 | Tasks | Create fixture task; verify list, My Work and search persistence | STAFF, ADMIN |
| TASK-02 | Tasks | Edit description, status, priority, assignee, date, custom fields | STAFF, ADMIN |
| TASK-03 | Tasks | Subtasks, checklist, comments, attachments, dependencies work when implemented | STAFF, ADMIN |
| TASK-04 | Tasks | Filtering, saved views, bulk editing and status transitions preserve records | STAFF, ADMIN |
| TASK-05 | Tasks | Read-only identity blocked by UI AND direct API | RO |
| SPACE-01 | Workspaces | Create/rename/move/delete fixture folders and lists; link persistence | ADMIN |
| CAL-01 | Calendar | Open/completed/overdue dated tasks reconcile with agenda and month view | RO, STAFF |
| CAL-02 | Calendar | Month navigation, day drilldown and 390px readability | RO, STAFF |
| GOAL-01 | Goals | Create/update/progress/link fixture goal, including permissions | STAFF, ADMIN |
| DOC-01 | Documents | Browse/search/upload/download/open/create/rename/trash SYNTHETIC Drive items | Drive-authorized STAFF |
| DOC-02 | Documents | Read-only or Google-denied action fails safely, no writes | RO, unauthorized STAFF |
| STAFF-01 | Personnel | Search, duties, positions, leave and committees display correctly | RO, STAFF |
| STAFF-02 | Personnel | Authorized fixture member edits persist and audit | ADMIN |
| CAP-01 | CAPWATCH | Refresh status truthful; password never echoed | RO, ADMIN |
| CAP-02 | CAPWATCH | Simulated sync/test/credential update server-role gated; NO live CAP credential | RO, ADMIN, OWNER |
| DEV-01 | Development | Filter/search members and LV1-LV5 mapping with source information | RO, STAFF |
| DEV-02 | Development | Correct data, add sourced steps and generate fixture task | ADMIN |
| COM-01 | Compliance | Create/pause/resume/retire fixture requirement; scheduled recurrence produces expected task | ADMIN |
| COM-02 | Compliance | Read-only account cannot write; audit entries are accurate | RO, ADMIN |
| READ-01 | Readiness | Demonstration values are labeled and not reported as genuine unit status | RO, ADMIN |
| FIN-01 | Finance | Ledger CRUD/void/categories/receipts reconcile with synthetic balances | Finance-authorized |
| FIN-02 | Finance | Owed, budget, committee and AI-assisted draft actions preserved | Finance-authorized |
| FIN-03 | Finance | Unauthorized account blocked at endpoint as well as UI | RO, unauthorized STAFF |
| AI-01 | AI | Assistant works on desktop/mobile, respects access and explicit approval gates | RO, STAFF |
| AI-02 | AI | Agent management and tool controls preserve permission restrictions | ADMIN |
| INT-01 | Connections | Test-only connect/disconnect/errors/status handling | ADMIN, OWNER |
| SET-01 | Settings | Notification level changes persist only for authorized members | RO, ADMIN |
| SET-02 | Settings | Drive configuration remains reachable; secrets never returned | RO, OWNER |
| USER-01 | Admin | Fixture account approval/suspension, final-owner/approver invariants, role changes | APPROVER, OWNER |
| USER-02 | Admin | Role edit confirmation and privilege escalation denial | RO, STAFF, ADMIN, OWNER |
| AUD-01 | Audit | Newest 200 events immutable, searchable, correctly date-grouped | Permitted roles |
| AUD-02 | Audit | Mutations create appropriate audit records without secret material | ADMIN, OWNER |
| SEC-01 | Security | Signed-out protected screen and API attempts denied | Signed-out |
| SEC-02 | Security | Unauthorized direct writes, CSRF, stale session, bad payload denied | All relevant roles |
| UX-01 | Usability | Untrained senior member can complete basic assigned task unaided | RO, STAFF |
| A11Y-01 | Accessibility | Keyboard, labels, focus, contrast, reduced motion at all widths | RO, STAFF |
| PERF-01 | Performance | Mobile throttling and slower-device usability evaluated | RO, STAFF |

**Status key:** RO = READ_ONLY, STAFF = STAFF_MEMBER, ADMIN = ADMINISTRATOR, APPROVER = ACCOUNT_APPROVER, OWNER = SYSTEM_OWNER. Test only actions that roles are genuinely allowed by the existing backend policy.

## Sign-off checklist

- [x] Source-level route and feature entrypoint checks executed in GitHub.
- [x] First public Chromium browser run executed at four widths with unauthenticated route checks.
- [ ] Deployment/branding discrepancy resolved and verified against production revision.
- [ ] Authenticated staging visual suite executed, screenshots inspected at each width.
- [ ] All CRUD, integration and negative-permission matrix rows executed on isolated fixtures.
- [ ] Accessibility and novice/power-user usability sessions completed.
- [ ] Explicit owner review before further redesign merge.

Do not mark full feature parity complete until the authenticated workflows and API checks pass with recorded evidence.
