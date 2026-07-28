interface CloudflareEnv {
  DB: D1Database;
  APP_NAME: string;
  APP_URL: string;
  SESSION_TTL_HOURS?: string;
  BOOTSTRAP_OWNER_EMAILS?: string;
  BOOTSTRAP_OWNER_PROFILES_JSON?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_SHARED_DRIVE_ID?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_ROOT_FOLDER_ID?: string;
  GOOGLE_DRIVE_MAX_UPLOAD_MB?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_ALLOWED_CHANNEL_IDS?: string;
}
