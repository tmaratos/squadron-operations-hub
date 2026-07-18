# Production backend setup

The public interface remains on GitHub Pages. Cloudflare runs the secure API only on:

`https://tn170adminhub.tristanmaratos.com/api/*`

This is a Worker Route because the existing origin is GitHub Pages.

## One-time Cloudflare resources

1. Create a D1 database named `tn170-squadron-ops`.
2. Copy its database UUID.
3. Create a Cloudflare API token with:
   - Account: Workers Scripts — Edit
   - Account: D1 — Edit
   - Zone: Workers Routes — Edit
   - Limit the account and zone resources to the account and `tristanmaratos.com`.
4. Copy the Cloudflare account ID.
5. Keep the `tn170adminhub` DNS record proxied through Cloudflare.

## GitHub production environment

In the repository, open:

`Settings → Environments → New environment → production`

Add these environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `OWNER_TRISTAN_EMAIL`
- `OWNER_MELLARD_EMAIL`

Do not put any of these values in source files.

## First deployment

Open:

`Actions → Bootstrap Production Backend → Run workflow`

That workflow:

1. Installs and validates the Worker.
2. Applies every D1 migration.
3. Activates Tristan and Steven as initial System Owners.
4. Uploads Mailgun secrets.
5. Deploys the Worker and `/api/*` route.
6. Installs the daily transient-auth cleanup schedule.

After it succeeds, open:

`https://tn170adminhub.tristanmaratos.com/api/health`

Expected response:

```json
{
  "ok": true,
  "service": "tn170-squadron-ops-api",
  "database": "connected"
}
```

## Normal deployments

Every change under `cloudflare/worker/` merged to `main` runs:

`Deploy Backend`

The deployment validates TypeScript, applies only unapplied migrations, uploads the Worker secrets, and deploys the Worker.

## User activation

Only Tristan and Steven need GitHub secrets for initial activation.

After either owner signs in, open `Users & Access`. Add each approved senior member email to the matching CAPID. The account becomes active without storing member addresses in the public repository.

## Production safeguards included

- Single-use magic links
- Hashed magic-link and session tokens
- Secure, HTTP-only, SameSite cookies
- Account allowlist and suspension
- Owner-only user elevation and task approval
- Origin checking for authenticated writes
- Per-IP and per-email request limits
- D1 migrations
- Audit logging
- Workers observability
- Daily cleanup of expired authentication records
- Automated CI and deployment
