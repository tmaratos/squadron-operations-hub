# TN-170 Cloudflare backend

This Worker supplies the secure, live portion of the static GitHub Pages interface.

## What is implemented

- Passwordless, single-use magic-link sign-in
- Approved-user allowlist
- Tristan and Steven seeded as initial System Owners
- Cloudflare D1 storage
- Secure HTTP-only session cookies
- Task CRUD and controlled task state transitions
- Approval workflow
- Explainable readiness-rule engine
- Live command-dashboard metrics
- User account management and access requests
- Audit records

The GitHub Pages files remain the public interface. The Worker runs only on:

`tn170adminhub.tristanmaratos.com/api/*`

Cloudflare forwards non-API requests to the existing GitHub Pages origin.

## Initial deployment

1. Install dependencies:

   `npm install`

2. Log in to Cloudflare:

   `npx wrangler login`

3. Create the D1 database:

   `npx wrangler d1 create tn170-squadron-ops`

4. Copy the returned database ID into `wrangler.jsonc`.

5. Apply migrations:

   `npx wrangler d1 migrations apply DB --remote`

6. Add the two owner email addresses to a copy of:

   `seed/bootstrap-owners.sql.example`

7. Run the completed owner bootstrap file:

   `npx wrangler d1 execute DB --remote --file seed/bootstrap-owners.sql`

8. Configure email secrets:

   `npx wrangler secret put MAILGUN_API_KEY`

   `npx wrangler secret put MAILGUN_DOMAIN`

9. Deploy:

   `npm run deploy`

10. Confirm:

    `https://tn170adminhub.tristanmaratos.com/api/health`

## Adding all member emails

The member names and CAPIDs are already in `seed/members.json`. Their email fields are blank because no email addresses were supplied yet.

After filling the email fields:

1. `npm run seed:emails`
2. `npx wrangler d1 execute DB --remote --file seed/member-emails.sql`

The account becomes active when its email is populated.

## Rule behavior

Actionable task statuses are `OPEN`, `IN_PROGRESS`, and `BLOCKED`.

- Overdue and due-this-week totals exclude items already submitted for approval.
- `AWAITING_APPROVAL` remains part of Open Tasks.
- Submission gives a small provisional readiness credit.
- Owner approval changes the task to `COMPLETED` and gives the full readiness credit.
- Overdue, blocked, and near-due work lowers the affected functional area's score.
- Scores are deterministic and return a contribution breakdown through `/api/dashboard`.

This is a rules engine, not a generative model. It is intentionally predictable, inexpensive, and auditable.


## Production automation

The repository includes three GitHub Actions workflows:

- `Backend CI` validates TypeScript and all D1 migrations.
- `Bootstrap Production Backend` performs the one-time owner activation and first deployment.
- `Deploy Backend` applies migrations and deploys every merged backend change.

See `../../docs/PRODUCTION_BACKEND_SETUP.md` for the exact Cloudflare and GitHub secret configuration.
