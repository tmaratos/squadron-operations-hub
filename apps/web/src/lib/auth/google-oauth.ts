import { cookies } from "next/headers";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { createRandomToken, sha256 } from "@/lib/security/crypto";
import { decryptToken, encryptToken } from "./token-encryption";
import { getDatabase } from "@/lib/cloudflare";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const OAUTH_COOKIE_MAX_AGE = 10 * 60;
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/drive"];

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
  hostedDomain?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
}

interface OAuthRow {
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string;
}

export async function createGoogleAuthorizationUrl(): Promise<string> {
  const env = requiredOAuthEnv();
  const state = createRandomToken(32);
  const verifier = createRandomToken(64);
  const challenge = base64UrlFromHex(await sha256(verifier));
  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE
  };
  store.set(oauthCookieName("state"), state, cookieOptions);
  store.set(oauthCookieName("verifier"), verifier, cookieOptions);

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    hd: "tncap.us",
    include_granted_scopes: "true"
  });
  return `${AUTHORIZATION_ENDPOINT}?${params}`;
}

export async function exchangeGoogleCode(code: string, state: string): Promise<TokenResponse> {
  const store = await cookies();
  const expectedState = store.get(oauthCookieName("state"))?.value;
  const verifier = store.get(oauthCookieName("verifier"))?.value;
  store.delete(oauthCookieName("state"));
  store.delete(oauthCookieName("verifier"));
  if (!expectedState || !verifier || !constantTimeEqual(state, expectedState)) {
    throw new Error("Invalid OAuth state.");
  }
  const env = requiredOAuthEnv();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier
    })
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
  return response.json<TokenResponse>();
}

export async function getGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Google profile lookup failed (${response.status}).`);
  const profile = await response.json<{
    sub: string;
    email: string;
    name: string;
    picture?: string;
    email_verified?: boolean;
    hd?: string;
  }>();
  return {
    sub: profile.sub,
    email: profile.email.trim().toLowerCase(),
    name: profile.name,
    picture: profile.picture,
    emailVerified: profile.email_verified === true,
    hostedDomain: profile.hd
  };
}

export function isAuthorizedCapProfile(profile: GoogleProfile): boolean {
  return profile.emailVerified && profile.email.endsWith("@tncap.us") &&
    (!profile.hostedDomain || profile.hostedDomain === "tncap.us");
}

export async function canAccessSharedDrive(accessToken: string): Promise<boolean> {
  const driveId = getCloudflareEnv().GOOGLE_SHARED_DRIVE_ID;
  if (!driveId) throw new Error("GOOGLE_SHARED_DRIVE_ID is not configured.");
  const response = await fetch(`${DRIVE_API}/drives/${encodeURIComponent(driveId)}?fields=id`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.ok;
}

export async function storeGoogleTokens(input: {
  userId: string;
  googleSubject: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes?: string;
}): Promise<void> {
  const existing = await getDatabase()
    .prepare("SELECT refresh_token_encrypted FROM user_google_oauth WHERE user_id = ?")
    .bind(input.userId)
    .first<{ refresh_token_encrypted: string | null }>();
  const encryptedAccess = await encryptToken(input.accessToken);
  const encryptedRefresh = input.refreshToken
    ? await encryptToken(input.refreshToken)
    : existing?.refresh_token_encrypted ?? null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresIn * 1000).toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO user_google_oauth (
        user_id, google_subject, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, scopes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        google_subject = excluded.google_subject,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        scopes = excluded.scopes,
        updated_at = excluded.updated_at`
    )
    .bind(input.userId, input.googleSubject, encryptedAccess, encryptedRefresh, expiresAt, input.scopes ?? SCOPES.join(" "), now.toISOString(), now.toISOString())
    .run();
}

export async function getUserGoogleAccessToken(userId: string): Promise<string> {
  const row = await getDatabase()
    .prepare(
      `SELECT access_token_encrypted, refresh_token_encrypted, token_expires_at
       FROM user_google_oauth WHERE user_id = ?`
    )
    .bind(userId)
    .first<OAuthRow>();
  if (!row) throw new Error("No Google OAuth credentials are stored for this user.");
  if (new Date(row.token_expires_at).getTime() > Date.now() + 60_000) {
    return decryptToken(row.access_token_encrypted);
  }
  if (!row.refresh_token_encrypted) throw new Error("Google authorization has expired. Sign in again.");

  const env = requiredOAuthEnv();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: await decryptToken(row.refresh_token_encrypted),
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) throw new Error("Google authorization could not be refreshed. Sign in again.");
  const refreshed = await response.json<TokenResponse>();
  await storeGoogleTokens({
    userId,
    googleSubject: await googleSubjectForUser(userId),
    accessToken: refreshed.access_token,
    expiresIn: refreshed.expires_in,
    scopes: refreshed.scope
  });
  return refreshed.access_token;
}

function requiredOAuthEnv() {
  const env = getCloudflareEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth environment bindings are not configured.");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI };
}

function oauthCookieName(kind: "state" | "verifier"): string {
  return process.env.NODE_ENV === "production" ? `__Host-google_oauth_${kind}` : `google_oauth_${kind}`;
}

async function googleSubjectForUser(userId: string): Promise<string> {
  const row = await getDatabase()
    .prepare("SELECT google_subject FROM user_google_oauth WHERE user_id = ?")
    .bind(userId)
    .first<{ google_subject: string }>();
  if (!row) throw new Error("Google OAuth profile is missing.");
  return row.google_subject;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function base64UrlFromHex(hex: string): string {
  return btoa(String.fromCharCode(...hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
