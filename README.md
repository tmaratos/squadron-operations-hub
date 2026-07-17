# Squadron Operations Hub

A modular web application for managing the administrative and operational backend of a Civil Air Patrol squadron.

The platform is designed so that one senior member can keep the squadron organized when staffing is limited, while still allowing additional senior members to log in, assume duty assignments, manage their functional areas, and share responsibility as the squadron grows.

> This project is an independent operational management tool. It does not replace eServices, official CAP systems, or any required Wing or National Headquarters reporting platform.

---

## Purpose

Squadron Operations Hub centralizes the work that is normally scattered across email, spreadsheets, paper records, messaging platforms, shared drives, and individual members' personal notes.

The system is intended to answer five questions at any time:

1. What needs to be completed?
2. Who is responsible for it?
3. When is it due?
4. What regulation, policy, or process governs it?
5. What documentation proves that it was completed?

The long-term goal is to help squadrons preserve institutional knowledge, reduce administrative burden, improve accountability, and remain operational even when only one or two senior members are actively available.

---

## Planned Capabilities

### Command Center

- Squadron readiness overview
- Overdue items
- Upcoming deadlines
- Pending approvals
- Unassigned responsibilities
- Open risks and blockers
- Commander action queue
- Recent squadron activity
- Customizable dashboard widgets

### Task and Suspense Management

- Assign tasks to staff members
- Track status, priority, due dates, and blockers
- Create recurring operational requirements
- Escalate overdue items
- Link tasks to meetings, documents, Discord messages, or compliance requirements
- Preserve task history and completion evidence

### Staff Duty Management

- Assign multiple duty positions to one member
- Create workspaces for each functional area
- Redistribute responsibilities when additional senior members join
- Track continuity notes and role handoffs
- Show unstaffed functional areas
- Maintain duty-position permissions

### Functional Areas

The architecture is designed to support independent modules for:

- Command
- Administration
- Personnel
- Finance
- Logistics
- Safety
- Aerospace Education
- Cadet Programs
- Emergency Services
- Communications
- IT and Systems
- Public Affairs
- Recruiting and Retention
- Professional Development
- Transportation
- Testing
- Historian
- Supply
- Additional custom staff sections

### Compliance and Readiness

- Track recurring requirements
- Associate requirements with regulations and policies
- Define required evidence
- Track expiration dates
- Generate corrective actions
- Maintain inspection checklists
- Calculate readiness by functional area
- Preserve an audit trail

### Documents and Process Library

- Store procedures, operating instructions, templates, and continuity documents
- Maintain current and superseded versions
- Track document owners and review dates
- Link documents to tasks and requirements
- Create step-by-step process guides
- Preserve screenshots, examples, and common mistakes
- Reduce dependency on one member's memory

### Meetings

- Build staff meeting agendas
- Record decisions
- Assign action items
- Track unresolved discussion items
- Link decisions to projects, tasks, and documents
- Generate meeting summaries

### Finance and Funding

This module will support the workflow surrounding official finance processes without replacing required CAP financial systems.

Planned features include:

- Budget planning
- Purchase requests
- Approval tracking
- Reimbursement status
- Donor relationship tracking
- Grant opportunities
- Sponsorship pipelines
- Fundraising projects
- Vendor records
- Supporting documentation

### Logistics and Inventory

- Equipment inventory
- Assigned equipment
- Low-stock alerts
- Inspection dates
- Maintenance records
- Supply requests
- Storage locations
- Chain-of-custody history
- Replacement planning

### Discord Integration

Discord will be integrated as a communication source, not embedded as the primary application interface.

Planned functionality includes:

- Link approved Discord channels
- Display authorized recent-message summaries
- Open the native Discord channel through direct links
- Create tasks from Discord messages
- Attach Discord message links as task sources
- Post approved announcements
- Route operational notifications to designated channels
- Maintain authorization and channel-access boundaries

### Notifications and Automation

A separate worker service will handle:

- Recurring task generation
- Due-date reminders
- Overdue escalation
- Expiring-document alerts
- Training renewal notices
- Inventory alerts
- Scheduled reports
- Discord synchronization
- Future email and calendar integrations

---

## Technology Stack

### Web Application

- Next.js
- React
- TypeScript

### Data and Validation

- PostgreSQL
- Prisma ORM
- Zod

### Repository Architecture

- pnpm workspaces
- Turborepo
- Feature-based modules
- Shared internal packages

### Integrations

- Discord API
- Future email integration
- Future calendar integration
- Future notification adapters

### Deployment

The project is intended to support self-hosting through Docker, with the web application, PostgreSQL database, worker service, and supporting infrastructure deployed together.

---

## Repository Structure

```text
squadron-operations-hub/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       └── modules/
│   │           ├── command/
│   │           ├── tasks/
│   │           ├── compliance/
│   │           ├── staff/
│   │           ├── meetings/
│   │           ├── documents/
│   │           ├── process-library/
│   │           ├── finance/
│   │           ├── logistics/
│   │           ├── safety/
│   │           ├── aerospace-education/
│   │           ├── cadet-programs/
│   │           ├── emergency-services/
│   │           ├── communications/
│   │           ├── inspections/
│   │           ├── reports/
│   │           ├── calendar/
│   │           └── notifications/
│   └── worker/
│       └── src/jobs/
├── packages/
│   ├── database/
│   ├── auth/
│   ├── ui/
│   ├── validation/
│   ├── audit/
│   ├── integrations/
│   └── config/
├── docs/
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Architecture Principles

### Modular by Functional Area

Each operational area is implemented as an independent feature module. Modules may contain their own:

- Components
- Domain types
- Business rules
- Services
- Repositories
- Validation schemas
- Server actions
- Tests

This prevents the application from becoming one large, tightly coupled codebase.

### Multi-Squadron Ready

Operational records are scoped by `squadronId`. The system can begin with a single squadron and later expand to support additional units without redesigning the entire database.

### Role-Based Access Control

Users will receive access based on their squadron membership and assigned responsibilities. Sensitive functions will be protected at both the user-interface and service layers.

### Auditability

Privileged actions and significant changes will be logged with:

- Acting user
- Timestamp
- Entity affected
- Action performed
- Supporting metadata

### Integration Isolation

External services such as Discord, email, and calendar platforms are accessed through adapters. Business logic should not depend directly on any one provider.

### Operational Support, Not Official-System Replacement

The application may track workflow around official requirements, but official CAP data and required records must remain in approved systems.

---

## Local Development

### Prerequisites

Install:

- Node.js 22 or newer
- pnpm
- Docker Desktop
- Git

### Clone the Repository

```bash
git clone https://github.com/tmaratos/squadron-operations-hub.git
cd squadron-operations-hub
```

### Install Dependencies

```bash
pnpm install
```

### Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update the values in `.env`.

### Start PostgreSQL and Redis

```bash
docker compose up -d
```

### Generate the Prisma Client

```bash
pnpm --filter @squadron/database generate
```

### Run Database Migrations

```bash
pnpm --filter @squadron/database migrate
```

### Start Development Services

```bash
pnpm dev
```

The web application will normally be available at:

```text
http://localhost:3000
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/squadron_ops

NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
DISCORD_STAFF_CHANNEL_ID=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
```

Never commit real credentials, tokens, private member information, or production environment files.

---

## Development Roadmap

### Phase 1: Operational Core

- [ ] Authentication and initial setup
- [ ] Squadron profile
- [ ] User memberships
- [ ] Duty-position assignments
- [ ] Command dashboard
- [ ] Task and suspense tracking
- [ ] Functional-area registry
- [ ] Audit logging
- [ ] Recurring requirements
- [ ] Discord channel linking

### Phase 2: Continuity and Administration

- [ ] Process library
- [ ] Document management
- [ ] Staff handoff notes
- [ ] Meeting agendas
- [ ] Decision log
- [ ] Approval workflows
- [ ] Notification center
- [ ] Calendar integration
- [ ] Contact directory

### Phase 3: Functional-Area Modules

- [ ] Finance and funding
- [ ] Logistics and inventory
- [ ] Safety
- [ ] Aerospace Education
- [ ] Cadet Programs
- [ ] Emergency Services
- [ ] Communications
- [ ] IT and Systems
- [ ] Public Affairs
- [ ] Recruiting and Retention

### Phase 4: Readiness and Automation

- [ ] Self-inspection checklists
- [ ] Readiness scoring
- [ ] Corrective-action tracking
- [ ] Scheduled reports
- [ ] Escalation rules
- [ ] Automation recipes
- [ ] Custom dashboards

### Phase 5: Platform Expansion

- [ ] Multiple squadrons
- [ ] Group and Wing views
- [ ] Reusable process templates
- [ ] Progressive web app support
- [ ] Mobile optimization
- [ ] Optional operational assistant

---

## Security Boundaries

- Do not store CAP or eServices passwords.
- Do not automate official systems in violation of policy.
- Store only the minimum operational data required.
- Protect sensitive member information.
- Use role-based authorization.
- Log privileged actions.
- Encrypt production secrets.
- Explicitly authorize Discord channel mappings.
- Keep cadet-sensitive data out of Discord summaries.
- Separate data by squadron and user authorization.

---

## Project Status

The repository now contains a functional, responsive MVP interface covering the full planned operational structure.

Implemented in the current MVP:

- Responsive command-center shell and navigation
- Command dashboard with readiness, deadlines, activity, notifications, and quick actions
- Interactive task board with local task creation and status progression
- Readiness and functional-area scoring views
- Staff, meetings, documents, processes, finance, logistics, safety, aerospace education, cadet programs, emergency services, communications, inspections, reports, calendar, notifications, public affairs, recruiting, compliance, and audit modules
- Quick-add workflow launcher
- Discord REST integration adapter
- Health API endpoint and web-app manifest
- Expanded Prisma domain schema
- Docker definitions for the web app, worker, PostgreSQL, and Redis
- Worker foundations for recurring compliance and Discord synchronization

The current screens use seeded demonstration data so the complete workflow can be reviewed before authentication and database actions are connected. See `docs/implementation-status.md` for the next engineering wave.

---

## Maintainer

**Tristan Maratos**

GitHub: `@tmaratos`

---

## License

No license has been selected yet.

Until a license is added, all rights are reserved by the project owner.
