# Squadron Operations Hub

A modular web application for managing the administrative and operational backend of a Civil Air Patrol squadron.

The platform is designed so one senior member can keep the unit organized when staffing is limited, while additional senior members can sign in, take ownership of functional areas, and share responsibility as the squadron grows.

> Squadron Operations Hub is an independent operational support tool. It does not replace eServices, official CAP systems, or required Wing or National Headquarters records.

## Current architecture

The production design is intentionally free-tier friendly and does not depend on a privately owned home server.

```text
GitHub
└── Source control and automatic builds

Cloudflare Workers
├── Next.js web application
├── Server-side API routes
├── Passwordless authentication
└── Scheduled maintenance worker

Cloudflare D1
├── Approved users and access requests
├── Magic-link tokens and sessions
├── Privileges and functional permissions
└── Security audit records

Google Shared Drive
└── TN 170 Command documents and folders
```

## Implemented in this release

### Passwordless, manually approved accounts

- No public automatic account creation
- New members submit an access request
- Tristan Maratos, Steven Mellard, or another authorized approver verifies the request
- Approved users sign in through a single-use email link
- No passwords are stored
- Sign-in tokens expire after a configurable period
- Sessions are revocable and expire automatically
- Neutral login responses do not reveal whether an email has an account
- Optional Cloudflare Turnstile protection

### Administrative succession

- Initial owners are bootstrapped through a protected environment variable
- System owners can promote another approved member to `SYSTEM_OWNER`
- The final active system owner cannot be removed
- At least one active account approver must remain
- Users cannot suspend, archive, or demote their own owner account
- Suspended users lose active sessions immediately
- Promotions, demotions, approvals, suspensions, and sign-ins are audited

### Google Shared Drive document interface

The frontend does not embed Google Drive. Users work through the application's own Documents page while server-side code performs Drive API operations against the `TN 170 Command` Shared Drive.

Approved users can:

- Browse folders
- Search the current folder
- Create folders
- Upload files
- Rename files and folders
- Download files
- Open items in Google Drive when needed
- Move items to Drive trash

The Google service account key is stored as a Cloudflare secret and is never sent to the browser or committed to GitHub.

### Existing operations modules

The current interface also includes the first visual and workflow foundation for:

- Live command dashboard backed by D1 task and audit data
- Persistent tasks and suspenses with assignment, due dates, status changes, and audit history
- Recurring compliance requirements that generate tasks through the scheduled Worker
- Senior-member duty assignments and functional-area ownership
- Calendar and meetings
- Readiness and inspections
- Reports
- Staff management
- Compliance
- Process library
- Finance and funding
- Logistics
- Safety
- Aerospace Education
- Cadet Programs
- Emergency Services
- Communications and Discord
- Public Affairs
- Recruiting and retention
- Notifications
- Audit history

The command dashboard, tasks, recurring compliance, staff assignments, account administration, audit history, and document integration are now backed by Cloudflare D1 or Google Drive. The remaining specialist modules still use demonstration records and will move to D1 one functional area at a time.

## Repository structure

```text
squadron-operations-hub/
├── apps/
│   ├── web/
│   │   ├── migrations/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── modules/
│   │   ├── open-next.config.ts
│   │   └── wrangler.jsonc
│   └── worker/
│       ├── src/
│       └── wrangler.jsonc
├── docs/
├── packages/
├── package.json
└── pnpm-workspace.yaml
```

## Technology stack

- Next.js 15
- React 19
- TypeScript
- OpenNext for Cloudflare
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Turnstile
- Google Drive API
- Mailgun transactional email
- pnpm workspaces

## Local development

### Prerequisites

- Node.js 22 or newer
- pnpm
- Git
- A Cloudflare account

### Install

```bash
git clone https://github.com/tmaratos/squadron-operations-hub.git
cd squadron-operations-hub
corepack enable
pnpm install
```

### Create local configuration

Copy the example secrets file:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Update the local values. Never commit `.dev.vars`.

### Configure the local D1 database

Replace `REPLACE_WITH_D1_DATABASE_ID` in both Wrangler configuration files after creating the production D1 database. Local emulation will still use a local database when running through Wrangler.

Apply migrations locally:

```bash
pnpm db:migrate:local
```

### Run the Next.js development server

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

When Mailgun is not configured and the app is not running in production, the login form returns a development-only sign-in link so the authentication flow can be tested locally.

### Preview in the Cloudflare Workers runtime

```bash
pnpm preview
```

## Cloudflare deployment

### 1. Create D1

Create a D1 database named:

```text
squadron-operations-hub
```

Place its database ID in:

- `apps/web/wrangler.jsonc`
- `apps/worker/wrangler.jsonc`

Apply the migration remotely:

```bash
pnpm db:migrate:remote
```

### 2. Configure production variables

Set these as normal Worker variables:

```text
APP_URL
APP_NAME
MAGIC_LINK_TTL_MINUTES
SESSION_TTL_HOURS
BOOTSTRAP_OWNER_EMAILS
BOOTSTRAP_OWNER_PROFILES_JSON
APPROVER_NOTIFICATION_EMAILS
MAILGUN_DOMAIN
EMAIL_FROM
NEXT_PUBLIC_TURNSTILE_SITE_KEY
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SHARED_DRIVE_ID
GOOGLE_ROOT_FOLDER_ID
GOOGLE_DRIVE_MAX_UPLOAD_MB
```

Set these as encrypted Cloudflare secrets:

```text
MAILGUN_API_KEY
TURNSTILE_SECRET_KEY
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

`BOOTSTRAP_OWNER_EMAILS` contains the initial owner addresses. `BOOTSTRAP_OWNER_PROFILES_JSON` can provide their names and duty titles. The first time either address requests a sign-in link, the app creates the approved owner record automatically.

### 3. Deploy the web application

```bash
pnpm deploy
```

### 4. Deploy the scheduled worker

```bash
pnpm deploy:worker
```

The scheduled worker removes expired authentication tokens and sessions each day and generates task records from active recurring compliance requirements.

### 5. Connect the domain

After the Worker is verified at its `workers.dev` address, connect:

```text
tn170adminhub.tristanmaratos.com
```

The existing GitHub Pages deployment is only a temporary README landing page and should be removed after the Worker custom domain is active.

## Google Shared Drive setup

1. Create a Google Cloud project.
2. Enable the Google Drive API.
3. Create a service account.
4. Generate a JSON key.
5. Add the service account email to `TN 170 Command` as **Content manager**.
6. Store the service account email and private key in Cloudflare.
7. Add the Shared Drive ID to `GOOGLE_SHARED_DRIVE_ID`.
8. Optionally set `GOOGLE_ROOT_FOLDER_ID` to restrict the app to one folder inside the Shared Drive.

All Drive operations are performed server-side. The private key must never be placed in a public variable or frontend file.

## Roles

| Role | Purpose |
|---|---|
| `SYSTEM_OWNER` | Full control, succession, integrations, account approval |
| `ACCOUNT_APPROVER` | Approve, reject, suspend, and reactivate accounts |
| `ADMINISTRATOR` | Broad operational administration without owner succession powers |
| `STAFF_MEMBER` | Normal senior-member operational access |
| `READ_ONLY` | View access without document modification |

Functional-area permissions are stored separately so future releases can restrict finance, logistics, safety, and other modules without changing a user's global role.

## Security boundaries

- No CAP or eServices passwords are stored.
- No Google password is stored.
- Google Drive credentials stay server-side.
- Login links are single-use and short-lived.
- Session cookies are HTTP-only, secure in production, and SameSite=Lax.
- Privileged changes are written to an audit log.
- The final owner and final approver are protected from removal.
- Real cadet or sensitive squadron information should not be entered until the remaining operational modules are connected to D1 and reviewed for their specific data-handling requirements.

## Next engineering wave

1. Deploy the authentication and D1 foundation to Cloudflare.
2. Connect Mailgun and Turnstile.
3. Add the Google service account to `TN 170 Command`.
4. Verify document CRUD through the app.
5. Replace mock Tasks and Suspenses with D1-backed CRUD.
6. Connect Discord channels and create tasks from Discord messages.
7. Move meetings, compliance, readiness, finance, and logistics into D1.
8. Revisit an official eServices integration only after CAP responds to ticket `#110898`.

## Maintainer

**Tristan Maratos**  
GitHub: `@tmaratos`

## License

No license has been selected. All rights are reserved by the project owner until a license is added.
