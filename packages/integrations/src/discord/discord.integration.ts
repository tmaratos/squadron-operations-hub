export interface DiscordMessageSummary {
  id: string;
  channelId: string;
  authorName: string;
  content: string;
  sentAt: Date;
  jumpUrl: string;
}

class DiscordIntegration {
  isConfigured(): boolean {
    return Boolean(
      process.env.DISCORD_BOT_TOKEN &&
        process.env.DISCORD_GUILD_ID
    );
  }

  async listRecentMessages(channelId: string): Promise<DiscordMessageSummary[]> {
    if (!this.isConfigured()) {
      throw new Error("Discord integration is not configured");
    }

    // Implement through the Discord REST API or discord.js.
    // Do not expose private channels unless the bot and authenticated app user are authorized.
    return [];
  }

  buildChannelUrl(guildId: string, channelId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}`;
  }
}

export const discordIntegration = new DiscordIntegration();
