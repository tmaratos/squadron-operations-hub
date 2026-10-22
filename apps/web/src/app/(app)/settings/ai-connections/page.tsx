import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { AiConnectionsPanel } from "@/components/settings/ai-connections-panel";

export const dynamic = "force-dynamic";

export default async function ConnectAiPage() {
  await requireUser();
  return (
    <div className="page-stack ai-connect-page">
      <PageHeader eyebrow="Personal connections" title="Connect ChatGPT or Claude"
        description="Use your own approved TN-170 account to read Hub tasks and workspaces in supported AI clients." />
      <section className="ai-connect-info">
        <strong>Start safely: read-only access</strong>
        <p>This connection cannot create, change, send, delete, or approve squadron records. Your key is personal. Never share a key or create one for somebody else.</p>
      </section>
      <AiConnectionsPanel />
      <section className="ai-connect-panel">
        <h2>How to connect your ChatGPT or Claude account</h2>
        <ol className="ai-connect-steps">
          <li><strong>First, sign in to the Hub.</strong> Confirm your account is approved and can open its Google Shared Drive.</li>
          <li><strong>Create your personal key above.</strong> Copy it once and enter it only in the secure connection/authentication settings for your AI client.</li>
          <li><strong>In ChatGPT on the web,</strong> use Plugins → Add (+) → Add custom MCP server if available to your plan/workspace. Enter the connection URL above, choose its supported API-key/Bearer authentication method, and review the read-only tools.</li>
          <li><strong>If your account uses a squadron-shared plugin,</strong> install the approved TN-170 plugin in Plugins and connect your own Hub account when prompted. Installing the plugin alone does not grant Hub access.</li>
          <li><strong>In Claude,</strong> use its connector/custom MCP settings if available. Supply the same HTTPS server URL and your personal key using the client's supported secure authentication flow.</li>
          <li><strong>Verify and revoke.</strong> Ask for your Hub identity or open tasks. Return here any time to revoke a key. The connection expires after 90 days unless renewed.</li>
        </ol>
        <p><strong>Not seeing the custom-server option?</strong> Your ChatGPT or Claude plan, device, or workspace administrator may restrict custom connections. Use the approved workspace plugin when offered; otherwise request access from your workspace admin.</p>
        <p><Link href="/settings">Back to Settings</Link></p>
      </section>
    </div>
  );
}
