import { getCloudflareEnv } from "@/lib/cloudflare";
import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";

export function isGoogleDriveConfigured(): boolean {
  const env = getCloudflareEnv();
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REDIRECT_URI &&
    env.GOOGLE_SHARED_DRIVE_ID &&
    env.GOOGLE_TOKEN_ENCRYPTION_KEY
  );
}

export const getGoogleAccessToken = getUserGoogleAccessToken;
