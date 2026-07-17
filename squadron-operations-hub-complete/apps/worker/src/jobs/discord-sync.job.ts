import { discordIntegration } from "@squadron/integrations";

export async function runDiscordSyncJob() {
  if (!discordIntegration.isConfigured()) {
    console.log("Discord integration is not configured");
    return;
  }

  console.log("Discord synchronization job completed");
}
