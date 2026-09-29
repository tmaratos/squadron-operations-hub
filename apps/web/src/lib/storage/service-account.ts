import { getDatabase } from "@/lib/cloudflare";
import { decryptToken, encryptToken } from "@/lib/auth/token-encryption";

// Authenticating to Google as the Hub itself, rather than as whoever happens to be signed in.
//
// Until now every Drive call borrowed a member's own Google authorisation. That made the squadron's
// documents reachable only while that member's account still worked, put a Drive API call in the path of
// every single page load, and meant the whole thing would stop the day the person who set it up left. A
// service account has none of those properties: it is the application's own identity, it belongs to no one,
// and it keeps working when people come and go.
//
// Google's flow for this is a signed assertion rather than a redirect. The Hub builds a short-lived JWT,
// signs it with the service account's private key, and exchanges it for an access token. There is no user,
// no consent screen and no refresh token - which is exactly why it survives turnover.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Enough to read and write the squadron's shared drive, and nothing outside Drive. */
const SCOPE = "https://www.googleapis.com/auth/drive";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  private_key_id?: string;
  type?: string;
}

export class ServiceAccountProblem extends Error {}

/**
 * Checks a pasted key is what it claims to be before it is stored.
 *
 * A service account key arrives as a JSON file somebody downloaded, so the failure to expect is the wrong
 * file entirely - an OAuth client secret, a different project's key, or a truncated copy and paste. Each of
 * those should be refused with a sentence that says which mistake was made, not a parse error.
 */
export function readServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ServiceAccountProblem("That is not valid JSON. Paste the whole file, including the braces.");
  }

  if (parsed.type && parsed.type !== "service_account") {
    throw new ServiceAccountProblem(
      "That is a " + String(parsed.type) + " key, not a service account key. Download the JSON key from the " +
      "service account's Keys tab."
    );
  }
  if (typeof parsed.client_email !== "string" || !parsed.client_email.includes("@")) {
    throw new ServiceAccountProblem("That file has no client_email, so it is not a service account key.");
  }
  if (typeof parsed.private_key !== "string" || !parsed.private_key.includes("PRIVATE KEY")) {
    throw new ServiceAccountProblem("That file has no private_key. It may have been truncated when copied.");
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
    private_key_id: typeof parsed.private_key_id === "string" ? parsed.private_key_id : undefined,
    type: "service_account"
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Turns the PEM out of the JSON file into a key WebCrypto can sign with. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    // The JSON file carries the newlines escaped; whichever form arrives, whitespace is not part of the key.
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");

  let der: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(body);
    der = new Uint8Array(new ArrayBuffer(binary.length));
    for (let at = 0; at < binary.length; at += 1) der[at] = binary.charCodeAt(at);
  } catch {
    throw new ServiceAccountProblem("The private key in that file could not be decoded.");
  }

  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch {
    throw new ServiceAccountProblem("The private key in that file is not in the expected format.");
  }
}

/**
 * An access token for the service account.
 *
 * Not cached here on purpose: Workers isolates are short-lived and shared unpredictably, so a token cached
 * in module scope would sometimes be reused across requests and sometimes not, which is the kind of
 * behaviour that works in testing and fails at the worst moment. Google's assertion exchange is a single
 * round trip; correctness is worth more than saving it.
 */
export async function accessTokenFor(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: key.private_key_id };
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    // Google allows up to an hour. Short anyway, because the token is fetched per operation.
    exp: now + 3600
  };

  const encoder = new TextEncoder();
  const unsigned =
    base64Url(encoder.encode(JSON.stringify(header))) + "." +
    base64Url(encoder.encode(JSON.stringify(claims)));

  const signingKey = await importPrivateKey(key.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    encoder.encode(unsigned)
  );
  const assertion = unsigned + "." + base64Url(new Uint8Array(signature));

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const said = await response.text().catch(() => "");
    // Google's own words, which distinguish a disabled account from a revoked key from a clock problem.
    throw new ServiceAccountProblem(
      "Google refused the service account. " + said.slice(0, 200)
    );
  }

  const granted = await response.json<{ access_token?: string }>();
  if (!granted.access_token) throw new ServiceAccountProblem("Google returned no access token.");
  return granted.access_token;
}

// ---------------------------------------------------------------- storage
//
// Kept in the same shape as the CAPWATCH credential: ciphertext in the database, key in Cloudflare's secret
// store, nothing returned to a browser, and one row because the squadron has one of these.

export async function storeServiceAccountKey(input: {
  key: ServiceAccountKey;
  raw: string;
  actorId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO storage_credentials (id, provider, client_email, project_id, key_encrypted, " +
      "updated_by, created_at, updated_at) VALUES (1, 'GOOGLE_DRIVE', ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET client_email = excluded.client_email, project_id = excluded.project_id, " +
      "key_encrypted = excluded.key_encrypted, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
    )
    .bind(input.key.client_email, input.key.project_id ?? null, await encryptToken(input.raw), input.actorId, now, now)
    .run();
}

/** The stored key, decrypted. Only the storage provider calls this. */
export async function storedServiceAccountKey(): Promise<ServiceAccountKey | null> {
  try {
    const row = await getDatabase()
      .prepare("SELECT key_encrypted FROM storage_credentials WHERE id = 1")
      .first<{ key_encrypted: string }>();
    if (!row?.key_encrypted) return null;
    return readServiceAccountKey(await decryptToken(row.key_encrypted));
  } catch {
    return null;
  }
}

/** What the settings page may know: that one exists, and who it is. Never the key. */
export async function serviceAccountStatus(): Promise<{
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  updatedAt: string | null;
}> {
  try {
    const row = await getDatabase()
      .prepare("SELECT client_email, project_id, updated_at FROM storage_credentials WHERE id = 1")
      .first<{ client_email: string | null; project_id: string | null; updated_at: string }>();
    return {
      configured: Boolean(row?.client_email),
      clientEmail: row?.client_email ?? null,
      projectId: row?.project_id ?? null,
      updatedAt: row?.updated_at ?? null
    };
  } catch {
    return { configured: false, clientEmail: null, projectId: null, updatedAt: null };
  }
}
