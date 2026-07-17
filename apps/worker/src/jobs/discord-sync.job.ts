import { discordIntegration } from "@squadron/integrations";

export interface DiscordSyncResult {
  configured: boolean;
  channelCount: number;
  messageCount: number;
}

export async function runDiscordSyncJob(): Promise<DiscordSyncResult> {
  if (!discordIntegration.isConfigured()) {
    console.log("Discord integration is not configured");
    return { configured: false, channelCount: 0, messageCount: 0 };
  }

  // Channel mappings will be loaded from the database when persistence is connected.
  console.log("Discord synchronization job completed");
  return { configured: true, channelCount: 0, messageCount: 0 };
}
