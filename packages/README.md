# Shared packages

This directory is reserved for framework-independent packages that need to be reused by the web application, scheduled worker, or future clients.

Current Cloudflare bindings and authentication code live inside `apps/web` because they are tightly coupled to the Next.js and Workers runtimes. Move code here only when it is genuinely shared and does not import framework-specific APIs.
