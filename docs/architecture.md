# Architecture

## Production platform

Squadron Operations Hub runs on Cloudflare rather than a privately owned server.

- Next.js is adapted to Cloudflare Workers with OpenNext.
- Cloudflare D1 stores authentication, privileges, audit history, and future operational records.
- A separate scheduled Worker performs maintenance and recurring automation.
- Google Shared Drive stores squadron documents.
- Mailgun sends approval and magic-link email.
- Turnstile can protect public forms.

## Trust boundaries

The browser never receives:

- Mailgun API credentials
- Google service-account credentials
- D1 bindings
- Magic-link hashes
- Session hashes

All privileged operations pass through server-side route handlers and are checked against the authenticated D1 user record.

## Authentication lifecycle

1. Applicant submits an access request.
2. An account approver reviews the request.
3. Approval creates or activates the user record.
4. The user requests a sign-in link.
5. A random token is emailed; only its SHA-256 hash is stored.
6. The token is consumed once and creates a hashed session token.
7. The browser receives an HTTP-only session cookie.
8. Suspension revokes every active session for the user.

## Document lifecycle

1. An approved user performs an action in the Documents module.
2. The app checks the user's global role.
3. The Worker obtains a short-lived Google access token using the service-account key.
4. The app performs the Drive API operation with Shared Drive support enabled.
5. The action is written to D1 audit history.

The Google Drive interface is not embedded in the app.
