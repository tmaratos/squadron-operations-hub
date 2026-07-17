# Cloudflare operational core release

This release replaces the original traditional-server architecture with a Cloudflare-native foundation and implements the first persistent operational workflows.

## New production foundation

- OpenNext deployment to Cloudflare Workers
- Cloudflare D1 database and migrations
- Separate scheduled Worker
- Mailgun passwordless magic-link delivery
- Cloudflare Turnstile support
- Google Shared Drive service-account integration

## New security and account workflows

- Manual access requests
- Approval by a system owner or account approver
- One-time, expiring magic links
- Revocable sessions
- System-owner promotion and succession safeguards
- Account suspension, reactivation, archival, and permanent audit history

## New data-backed operations

- Persistent task and suspense board
- Task ownership, due dates, priorities, blocked state, approval state, and completion
- Live command-dashboard task metrics and deadlines
- Functional-area readiness derived from task risk
- Recurring compliance requirements
- Scheduled generation of D1 task records from due requirements
- Senior-member duty assignments
- Primary and supporting functional-area ownership
- Member workload and unstaffed-area visibility

## Document integration

- App-native Shared Drive browser
- Folder creation
- File upload, rename, move, download, and trash
- Server-side Google credentials only
- Audit events for document changes

## Still demonstration-only

- Meetings and calendar
- Inspections and corrective actions
- Reports and exports
- Finance and funding
- Logistics and inventory
- Safety incident workflow
- Aerospace Education planning
- Cadet Programs planning
- Emergency Services readiness
- Discord workflows
- Public Affairs
- Recruiting and retention
