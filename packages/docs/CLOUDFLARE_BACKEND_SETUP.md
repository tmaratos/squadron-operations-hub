# Cloudflare backend setup

The static interface stays on GitHub Pages. Only `/api/*` is handled by a Cloudflare Worker.

## The supplied member list

Twenty-one CAPIDs and names are seeded. No email addresses were present in the list, so every account starts as `PENDING_EMAIL`. Tristan Maratos and Steven Mellard are seeded as `OWNER`; everyone else is `MEMBER`.

## Deployment sequence

1. Extract the V6 patch into the repository root.
2. Commit and push the static changes.
3. Open Git Bash in `cloudflare/worker`.
4. Run `npm install`.
5. Run `npx wrangler login`.
6. Run `npx wrangler d1 create tn170-squadron-ops`.
7. Paste the returned database ID into `wrangler.jsonc`.
8. Run `npx wrangler d1 migrations apply DB --remote`.
9. Copy `seed/bootstrap-owners.sql.example` to `seed/bootstrap-owners.sql`.
10. Replace the two owner email placeholders.
11. Run `npx wrangler d1 execute DB --remote --file seed/bootstrap-owners.sql`.
12. Run `npx wrangler secret put MAILGUN_API_KEY`.
13. Run `npx wrangler secret put MAILGUN_DOMAIN`.
14. Run `npm run deploy`.
15. Open `/api/health` on the production domain.

Once the Worker route is deployed, the static JavaScript automatically switches from preview behavior to the live API.
