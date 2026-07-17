# Security boundaries

1. Do not store CAP or eServices passwords.
2. Do not scrape or automate eServices without an officially approved interface.
3. Do not store Google account passwords.
4. Keep Google service-account keys and email-provider API keys in Cloudflare secrets.
5. Require manual account approval.
6. Use single-use, expiring magic links.
7. Hash magic-link and session tokens before database storage.
8. Use secure, HTTP-only, SameSite cookies in production.
9. Audit approvals, role changes, suspensions, sign-ins, and document modifications.
10. Prevent removal of the final system owner and final account approver.
11. Store only the minimum local operational data required.
12. Keep sensitive cadet data out of Discord summaries and public notifications.
13. Direct Google Drive changes remain governed by Google because existing senior members also have direct Shared Drive access.
