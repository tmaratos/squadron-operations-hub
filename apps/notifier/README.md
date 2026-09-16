# Notifier

Sends the Hub's notifications by email, and raises the deadline notices in the first place.

It runs on a schedule and never invents anything: every email is a delivery of rows that already exist in
the `notifications` table, so a member can open the Hub and see exactly what they were told.

## What it does

| When | What |
|---|---|
| Every hour at :15 | Sends anything waiting for members who chose **as things happen** |
| 11:00 UTC (06:00 Central) | Checks every open dated task and raises "due soon" / "overdue" notices, then sends the once-a-day emails |

A member hears about a given deadline once per day at most, however often the worker runs: the
`dedupe_key` (`OVERDUE:item:2026-09-20`) makes a second insert a no-op.

## Setting up sending

Cloudflare Email Routing can only *receive* mail, so sending needs an account somewhere. The worker
supports two, and uses whichever key is present:

- **Resend** — free tier is 3,000 emails a month / 100 a day. `wrangler secret put RESEND_API_KEY`
- **Brevo** — free tier is 300 a day. `wrangler secret put BREVO_API_KEY`

Either one needs the sending domain verified with DNS records (SPF/DKIM TXT). That does **not** conflict
with Email Routing on the same domain: routing owns MX (incoming), sending uses TXT (outgoing).

Then set the from address in `wrangler.jsonc` (`NOTIFY_FROM`) to a mailbox on the verified domain.

With no key set, nothing is sent and notices stay `PENDING` — so when a provider is switched on later,
the backlog goes out rather than being silently lost.

## Checking it without waiting for the clock

```
wrangler secret put NOTIFIER_TRIGGER_SECRET
curl -H "x-trigger: <that secret>" https://squadron-notifier.<subdomain>.workers.dev/run?cron=0+11
```

It returns how many notices it raised and how many emails it sent.

## Deploy

```
pnpm --filter @squadron/notifier deploy
```
