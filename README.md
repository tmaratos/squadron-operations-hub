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

### CAP Google authentication

- Members sign in with a verified `@tncap.us` Google account
- Google must confirm that the member can access the configured squadron Shared Drive
- Squadron command staff grant access through Google Drive; there is no in-app access-request process
- D1 profiles are created or refreshed automatically after successful Google authorization
- Google access and refresh tokens are encrypted before D1 storage
- Sessions are revocable and expire automatically

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

Drive requests use the signed-in member's encrypted OAuth credentials, so Google applies that member's existing Drive permissions.

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

Configure a local Google OAuth client callback at `http://localhost:3000/api/auth/google/callback`.

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
SESSION_TTL_HOURS
BOOTSTRAP_OWNER_EMAILS
BOOTSTRAP_OWNER_PROFILES_JSON
GOOGLE_CLIENT_ID
GOOGLE_REDIRECT_URI
GOOGLE_SHARED_DRIVE_ID
GOOGLE_ROOT_FOLDER_ID
GOOGLE_DRIVE_MAX_UPLOAD_MB
```

Set these as encrypted Cloudflare secrets:

```text
GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
```

Existing D1 user records preserve Hub-specific roles. New Drive-authorized members default to `STAFF_MEMBER`.

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
3. Configure a Web OAuth client and its authorized callback URI.
4. Store the client ID, client secret, redirect URI, and token-encryption key in Cloudflare.
5. Set `GOOGLE_SHARED_DRIVE_ID` to `0ALYSj1KARR19Uk9PVA`.
6. Grant each authorized member access through Google Drive.
7. Optionally set `GOOGLE_ROOT_FOLDER_ID` to restrict the app to one folder inside the Shared Drive.

All Drive operations are performed server-side with the signed-in member's OAuth token. OAuth secrets and token-encryption keys must never be placed in public variables or frontend files.

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
- OAuth state and PKCE protect the Google callback.
- Session cookies are HTTP-only, secure in production, and SameSite=Lax.
- Privileged changes are written to an audit log.
- The final owner and final approver are protected from removal.
- Real cadet or sensitive squadron information should not be entered until the remaining operational modules are connected to D1 and reviewed for their specific data-handling requirements.

## Next engineering wave

1. Deploy the authentication and D1 foundation to Cloudflare.
2. Configure Google OAuth and the D1 token-encryption secret.
3. Grant authorized members access to `TN 170 Command` through Google Drive.
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
