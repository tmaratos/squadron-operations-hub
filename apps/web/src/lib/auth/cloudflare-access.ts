import { getCloudflareEnv } from "@/lib/cloudflare";

// Who Cloudflare Access says somebody is.
//
// Access puts a signed token in a header on every request it lets through. That token is the only thing
// worth trusting about identity: the header itself is trivially forgeable by anyone who can reach the
// origin, so it is verified against Cloudflare's published keys before a word of it is believed. An
// application that reads the email out of the header without checking the signature has not added
// authentication, it has added a login box anybody can walk around.
//
// Nothing here decides whether somebody may use the Hub. It answers "who is this?" and stops. The answer to
// "are they allowed?" lives in member_access and is asked separately, so that a member an administrator has
// restricted is refused even while Cloudflare is still happy to let them to the door.

const HEADER = "cf-access-jwt-assertion";

export interface AccessIdentity {
  email: string;
  /** Cloudflare's own subject for the person, stable across email changes. */
  subject: string | null;
  /** Which Access application issued this, checked against the one we expect. */
  audience: string[];
  expiresAt: Date;
}

export class AccessNotVerified extends Error {}

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
}

/**
 * Cloudflare's signing keys.
 *
 * Cached for an hour because they rotate slowly and a fetch on every request would put Cloudflare in the
 * path of its own auth check. An unknown key id refetches immediately rather than failing, which is what
 * makes a rotation invisible instead of an outage.
 */
let keyCache: { fetchedAt: number; keys: Jwk[] } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000;

function teamDomain(): string {
  const env = getCloudflareEnv();
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  if (!team) throw new AccessNotVerified("Cloudflare Access is not configured for this Hub.");
  return team.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function signingKeys(force = false): Promise<Jwk[]> {
  if (!force && keyCache && Date.now() - keyCache.fetchedAt < KEY_TTL_MS) return keyCache.keys;
  const response = await fetch("https://" + teamDomain() + "/cdn-cgi/access/certs");
  if (!response.ok) throw new AccessNotVerified("Cloudflare's signing keys could not be fetched.");
  const body = await response.json<{ keys?: Jwk[] }>();
  const keys = body.keys ?? [];
  keyCache = { fetchedAt: Date.now(), keys };
  return keys;
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  // Backed by a plain ArrayBuffer so the result can be handed straight to WebCrypto.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(segment))) as T;
}

/**
 * Verifies the Access token on a request and returns who it says is here.
 *
 * Returns null when there is no token at all, which is the ordinary case today: Access is not yet in front
 * of the Hub, so almost every request arrives without one. Throws only when a token is present and cannot be
 * trusted, because that is the case that must never be quietly ignored.
 */
export async function identityFromRequest(request: Request): Promise<AccessIdentity | null> {
  const token = request.headers.get(HEADER);
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessNotVerified("The Access token is malformed.");

  const header = decodeSegment<{ kid?: string; alg?: string }>(parts[0]);
  if (header.alg !== "RS256") {
    // Refusing anything else on purpose. "alg: none" and algorithm confusion are the classic ways a token
    // check is turned into no check at all.
    throw new AccessNotVerified("The Access token is signed with an unexpected algorithm.");
  }
  if (!header.kid) throw new AccessNotVerified("The Access token names no signing key.");

  let keys = await signingKeys();
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // A key we have not seen usually means Cloudflare rotated; fetch once more before disbelieving it.
    keys = await signingKeys(true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) throw new AccessNotVerified("The Access token was signed with an unknown key.");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signature = fromBase64Url(parts[2]);
  const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  if (!good) throw new AccessNotVerified("The Access token's signature is not valid.");

  const claims = decodeSegment<{
    email?: string; sub?: string; aud?: string | string[]; exp?: number; iss?: string; nbf?: number;
  }>(parts[1]);

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new AccessNotVerified("The Access token has expired.");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) {
    throw new AccessNotVerified("The Access token is not valid yet.");
  }

  // The issuer must be our own team, or a token minted for somebody else's Cloudflare tenant would pass.
  const expectedIssuer = "https://" + teamDomain();
  if (claims.iss !== expectedIssuer) {
    throw new AccessNotVerified("The Access token was issued for a different organisation.");
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  const expected = getCloudflareEnv().CF_ACCESS_AUD;
  // Checked when configured: a token for a different application of ours is still not a token for this one.
  if (expected && !audience.includes(expected)) {
    throw new AccessNotVerified("The Access token was issued for a different application.");
  }

  const email = (claims.email ?? "").trim().toLowerCase();
  if (!email) throw new AccessNotVerified("The Access token carries no email address.");

  return {
    email,
    subject: claims.sub ?? null,
    audience,
    expiresAt: new Date(claims.exp * 1000)
  };
}

/** True when Access has been configured for this Hub at all. */
export function accessConfigured(): boolean {
  return Boolean(getCloudflareEnv().CF_ACCESS_TEAM_DOMAIN);
}
