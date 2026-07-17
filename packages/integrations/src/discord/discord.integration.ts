export interface DiscordMessageSummary {
  id: string;
  guildId: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  sentAt: Date;
  jumpUrl: string;
}

export interface DiscordChannelSummary {
  guildId: string;
  channelId: string;
  displayName: string;
  jumpUrl: string;
}

export interface PostDiscordMessageInput {
  channelId: string;
  content: string;
}

class DiscordIntegration {
  private get token(): string | undefined {
    return process.env.DISCORD_BOT_TOKEN;
  }

  isConfigured(): boolean {
    return Boolean(this.token && process.env.DISCORD_GUILD_ID);
  }

  async listRecentMessages(channelId: string, limit = 25): Promise<DiscordMessageSummary[]> {
    if (!this.token) {
      throw new Error("Discord integration is not configured");
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=${Math.min(Math.max(limit, 1), 100)}`,
      { headers: { Authorization: `Bot ${this.token}` } }
    );

    if (!response.ok) {
      throw new Error(`Discord message request failed with status ${response.status}`);
    }

    const messages = await response.json() as Array<{
      id: string;
      guild_id?: string;
      channel_id: string;
      content: string;
      timestamp: string;
      author: { id: string; username: string; global_name?: string | null };
    }>;

    return messages.map((message) => ({
      id: message.id,
      guildId: message.guild_id ?? process.env.DISCORD_GUILD_ID ?? "",
      channelId: message.channel_id,
      authorId: message.author.id,
      authorName: message.author.global_name ?? message.author.username,
      content: message.content,
      sentAt: new Date(message.timestamp),
      jumpUrl: this.buildMessageUrl(
        message.guild_id ?? process.env.DISCORD_GUILD_ID ?? "",
        message.channel_id,
        message.id
      )
    }));
  }

  async postMessage(input: PostDiscordMessageInput): Promise<{ id: string; jumpUrl: string }> {
    if (!this.token) {
      throw new Error("Discord integration is not configured");
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${encodeURIComponent(input.channelId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: input.content })
      }
    );

    if (!response.ok) {
      throw new Error(`Discord post failed with status ${response.status}`);
    }

    const message = await response.json() as { id: string; guild_id?: string; channel_id: string };
    const guildId = message.guild_id ?? process.env.DISCORD_GUILD_ID ?? "";
    return {
      id: message.id,
      jumpUrl: this.buildMessageUrl(guildId, message.channel_id, message.id)
    };
  }

  buildChannelUrl(guildId: string, channelId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}`;
  }

  buildMessageUrl(guildId: string, channelId: string, messageId: string): string {
    return `${this.buildChannelUrl(guildId, channelId)}/${messageId}`;
  }
}

export const discordIntegration = new DiscordIntegration();
