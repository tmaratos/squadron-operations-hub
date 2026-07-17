export interface LinkedDiscordChannel {
  id: string;
  squadronId: string;
  guildId: string;
  channelId: string;
  displayName: string;
  purpose:
    | "STAFF"
    | "ANNOUNCEMENTS"
    | "CADET_STAFF"
    | "PARENTS"
    | "LOGISTICS"
    | "OTHER";
  isActive: boolean;
}
