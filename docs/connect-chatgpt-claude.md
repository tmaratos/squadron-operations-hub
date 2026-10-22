# TN-170 Operations Hub: create and connect real ChatGPT/Claude plugins

**Owner deployment guide and member account setup guide. Initial MCP version is strictly read-only.**

## Part A — owner: finalize the new domain and deploy the server

1. Finish migrating the Hub to its final HTTPS hostname. Update Cloudflare routing, APP_URL, Google OAuth callback settings, and Cloudflare Access policies. Confirm normal member sign-in and Shared Drive permission on the new URL.
2. Review and merge the MCP feature branch only when authorized. The migration 0061_mcp_access_tokens.sql creates revocable per-member credentials; check migrations before allowing a remote database update.
3. The MCP connection endpoint is at the final Hub origin with the path /api/mcp. A website home page, GitHub URL, or raw Cloudflare dashboard address is NOT an MCP endpoint.
4. Log into the Hub and open Settings → Connect ChatGPT or Claude. Create a personal test key. Keys are shown once and expire after 90 days. Never put them in email, screenshots, repositories or conversations.
5. Verify the endpoint with an approved test client. It must authenticate using a per-user Bearer key and expose only the six READ-ONLY tools listed below. Unauthorized requests must be denied.
6. Verify suspended accounts, revoked keys and loss of Google Shared Drive access disable their connected AI access immediately. Revoke the test key.

**Authentication limitation:** This phase supports Bearer/API-key clients. It is not an OAuth authorization server. If a specific ChatGPT or Claude client requires OAuth instead of personal keys, full connection is pending implementation of OAuth; do not work around that by sharing credentials.

## Part B — owner: create the reusable plugin for your squadron

1. In ChatGPT on the web, visit Plugins → Add (+) / Plugin Creator where your account supports plugin creation.
2. Configure a PRIVATE plugin called TN-170 Operations Hub, with a Streamable HTTP MCP connection pointing to the verified final HTTPS endpoint ending in /api/mcp.
3. Configure supported individual API-key/Bearer authentication. **Never embed any member's private key in plugin files or share one token across users.**
4. Add member-facing instructions describing tools, sign-in, privacy, expiration and revocation. Do not use the prohibited U.S. Air Force logo.
5. Test tool discovery and member-specific identity on a test Hub user.
6. To distribute inside a managed ChatGPT workspace, use its Plugin sharing or admin-approved custom MCP connection flow if available. A privately owned plugin is not automatically shareable to unrelated personal accounts. Business/Enterprise/Edu admins can publish connections subject to workspace rules.
7. For members who have custom MCP connection permission, they can independently create a private connection from Plugins → + → Add custom MCP server, providing the final URL and their own key. This interface is not universally available, especially on mobile or across all plans.

The repository's generator script can assemble a package once the final URL is verified. It must never insert an unverified placeholder or an actual member credential into the published manifest.

## Part C — member: connect their own ChatGPT or Claude account

1. Sign into the final TN-170 Hub with your individually approved account.
2. Open Settings → Connect ChatGPT or Claude. Read the access explanation.
3. Generate and copy your own personal connection key. The Hub will not show the key again.
4. Open ChatGPT on the web. If your approved squadron plugin is installed, open Plugins and connect the plugin to your own Hub account when prompted. If your account has custom MCP creation access, use Plugins → + → Add custom MCP server and enter the final Hub URL and personal key through secure connection setup.
5. In Claude, use its supported remote/custom MCP connector configuration (if your plan supports it), the same endpoint and your own private key where secure Bearer/API-key auth is available.
6. Test with: Which TN-170 Hub member am I connected as? Then: Show my open tasks.
7. To disconnect, return to Hub Settings and revoke the personal key. Remove the AI client connection separately if you no longer want the plugin listed.
8. To renew after 90 days, create a fresh key and update your account's connection. Do not share your key with other members or paste it in an AI conversation.

**If the ChatGPT plugin or custom-server menu is missing**, the user's plan, organization policy or device may not support it. Ask an administrator to approve or share the official plugin. Never borrow the owner's credentials.

## Current tool inventory (read only)

- hub_identity: Hub identity and role represented by the connection
- hub_workspaces: spaces, folders and lists
- hub_tasks: bounded operational-task search with optional owner/status filter
- hub_task: read operational-task details
- hub_list_items: bounded view of work items in a specified list
- hub_item: details, checklists and comments for a work item

These tools CANNOT create/edit/delete/approve tasks, modify duty positions, access CAPWATCH credentials, update finance, upload to Drive, send email or trigger automation.

## Security and completion checklist

- [ ] Final HTTPS domain, Worker route, APP_URL and OAuth callbacks verified.
- [ ] Migration applied only to the intended database, and no old data lost.
- [ ] No bearer key, token hash, session cookie or user OAuth token exposed in tools.
- [ ] Member creates token (one-time reveal); only their own tokens list and revoke.
- [ ] No unauthenticated or cookie-only MCP access; 401 on unauthorized request.
- [ ] Read-only MCP initialize, tools/list and each tool call tested.
- [ ] Revocation, 90-day expiration, suspension, and Google Shared Drive loss tested.
- [ ] Member A cannot use B's identity or revoke B's connection.
- [ ] Production access/write policies, CAP data privacy and unit insignia reviewed.
- [ ] Actual ChatGPT client and Claude connector connection tested on supported accounts.
- [ ] Member-facing instructions tested by a nontechnical senior member.
- [ ] Owner explicitly approves merge, deployment, and member distribution.

## Official help

ChatGPT custom MCP setup: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

ChatGPT Plugins: https://help.openai.com/en/articles/20001256-plugins-in-chatgpt

App connection help: https://help.openai.com/en/articles/20001494-connecting-and-managing-app-accounts-in-chatgpt
