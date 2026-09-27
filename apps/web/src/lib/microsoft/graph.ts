import { getCloudflareEnv } from "@/lib/cloudflare";
import type { MailMessage } from "@/lib/google/gmail";
import type { ScanMode } from "@/lib/google/gmail";

// Reading a Microsoft mailbox: Outlook, Hotmail, Live, Office 365, and CAP's own @cap.gov mail.
//
// Gmail was the only mailbox the Hub could read, which left out the one most likely to hold CAP business.
// Everything here mirrors the Google side deliberately - the same three scan modes, the same message shape,
// the same rule that the Hub only ever reads - so the rest of the app does not need to know or care which
// provider a member's mailbox is on.
//
// Read-only by construction: the only permission asked for is Mail.Read. Nothing here can send, delete,
// move or mark anything, and a member can withdraw it from their own Microsoft account at any time.

const AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";

/** offline_access is what allows the mailbox to keep being read after the first hour. */
const SCOPES = ["offline_access", "openid", "email", "profile", "Mail.Read"];

export function isMicrosoftConfigured(): boolean {
  const env = getCloudflareEnv();
  return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
}

function credentials() {
  const env = getCloudflareEnv();
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft mail is not set up for this Hub yet.");
  }
  return {
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    redirectUri: env.MICROSOFT_REDIRECT_URI
      ?? (env.APP_URL ?? "").replace(/\/$/, "") + "/api/auth/microsoft/callback"
  };
}

export function microsoftAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    // Always offer the account chooser: somebody adding a second mailbox is, by definition, not adding the
    // one they are already signed in to.
    prompt: "select_account"
  });
  return AUTHORIZE + "?" + params.toString();
}

interface TokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  /** Present because openid is among the scopes. It carries who signed in, so Graph need not be asked. */
  id_token?: string;
}

export async function exchangeMicrosoftCode(code: string): Promise<TokenReply> {
  const { clientId, clientSecret, redirectUri } = credentials();
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!response.ok) {
    // Said plainly rather than swallowed.
    //
    // Microsoft returns a precise reason here - the wrong secret, a registration that does not allow this
    // kind of account, a redirect URI registered as something other than Web - and each one needs a
    // different fix. Turning all of them into "that did not work" meant the only way to tell them apart was
    // to guess, which cost an afternoon.
    throw new Error(microsoftSaid(await response.text().catch(() => "")));
  }
  return response.json<TokenReply>();
}

/**
 * The useful sentence out of Microsoft's error body.
 *
 * Their description runs to several lines and repeats the trace and correlation ids, which help nobody
 * reading a web page. The AADSTS code is the part worth keeping: it names the problem exactly and is what
 * their own documentation is indexed by.
 */
export function microsoftSaid(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string };
    const described = (parsed.error_description ?? "").split(/\r?\n/)[0].trim();
    const code = described.match(/AADSTS\d+/)?.[0];
    if (described) return (code && !described.startsWith(code) ? code + ": " : "") + described.slice(0, 300);
    if (parsed.error) return parsed.error;
  } catch {
    // Not JSON, which itself is worth seeing.
  }
  return body.slice(0, 300) || "Microsoft gave no reason.";
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<TokenReply | null> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" ")
    })
  });
  // A mailbox whose permission has been withdrawn is not an error worth stopping everything for.
  if (!response.ok) return null;
  return response.json<TokenReply>();
}

/**
 * Whose mailbox this is, taken from the identity token rather than from Graph.
 *
 * Asking Graph's /me for it needs the User.Read permission, which is a permission to read a person's
 * directory profile - their job title, their manager, their photo. The Hub wants none of that and asking for
 * it to learn an address the sign-in already stated would be the wrong trade. Without it, /me answers with a
 * refusal, which is exactly what it did: a perfectly good mailbox token, and no way to say who it belonged
 * to.
 *
 * The identity token comes back from the token endpoint in the same reply as the access token, over TLS,
 * straight from Microsoft. Its claims are read without verifying the signature, which is safe only because
 * of where it came from - this is never read from anything a browser handed us.
 */
function claimsOf(idToken: string): { sub?: string; email?: string; preferred_username?: string; oid?: string } {
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function microsoftProfile(accessToken: string, idToken?: string): Promise<{ id: string; email: string }> {
  if (idToken) {
    try {
      const claims = claimsOf(idToken);
      // preferred_username is what a personal account carries; work accounts put the address in email too.
      const email = (claims.email || claims.preferred_username || "").toLowerCase();
      const id = claims.oid || claims.sub || "";
      if (email && id) return { id, email };
    } catch {
      // Fall through and ask Graph, which may still be allowed.
    }
  }

  const response = await fetch(GRAPH + "/me?$select=id,mail,userPrincipalName", {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 401
        ? "Microsoft would not say who that mailbox belongs to, and the sign-in did not state it either."
        : "Microsoft would not say who that mailbox belongs to."
    );
  }
  const data = await response.json<{ id: string; mail?: string; userPrincipalName?: string }>();
  return { id: data.id, email: (data.mail || data.userPrincipalName || "").toLowerCase() };
}

/** Folders never read, whatever the setting: deleted mail and junk. */
async function excludedFolderIds(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch(GRAPH + "/me/mailFolders?$select=id,displayName&$top=60", {
      headers: { Authorization: "Bearer " + accessToken }
    });
    if (!response.ok) return [];
    const data = await response.json<{ value?: Array<{ id: string; displayName?: string }> }>();
    return (data.value ?? [])
      .filter((folder) => /deleted items|junk e-?mail|trash|spam/i.test(folder.displayName ?? ""))
      .map((folder) => folder.id);
  } catch {
    return [];
  }
}

function plainText(body: { contentType?: string; content?: string } | undefined): string {
  const content = body?.content ?? "";
  if ((body?.contentType ?? "").toLowerCase() === "html") {
    return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return content.trim();
}

/**
 * The member's mail, in the same shape the Gmail side returns.
 *
 * The three settings mean the same thing on both providers: what has not been read, the inbox, or every
 * folder. Deleted and junk mail are left out of all three - somebody who deleted a message has already said
 * what they think of it.
 */
export async function listMicrosoftMail(accessToken: string, mode: ScanMode, limit: number): Promise<MailMessage[]> {
  const headers = { Authorization: "Bearer " + accessToken };
  const select = "$select=id,subject,from,receivedDateTime,bodyPreview,body,isRead,parentFolderId";
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  let url: string;
  if (mode === "INBOX") {
    url = GRAPH + "/me/mailFolders/inbox/messages?" + select + "&$top=" + limit + "&$orderby=receivedDateTime desc";
  } else if (mode === "UNREAD") {
    url = GRAPH + "/me/messages?" + select + "&$top=" + limit + "&$filter=isRead eq false&$orderby=receivedDateTime desc";
  } else {
    url = GRAPH + "/me/messages?" + select + "&$top=" + limit +
      "&$filter=receivedDateTime ge " + ninetyDaysAgo + "&$orderby=receivedDateTime desc";
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return [];
    throw new Error("That Microsoft mailbox could not be read.");
  }

  const data = await response.json<{
    value?: Array<{
      id: string;
      subject?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
      receivedDateTime?: string;
      bodyPreview?: string;
      body?: { contentType?: string; content?: string };
      parentFolderId?: string;
    }>;
  }>();

  const excluded = new Set(await excludedFolderIds(accessToken));

  return (data.value ?? [])
    .filter((message) => !message.parentFolderId || !excluded.has(message.parentFolderId))
    .map((message) => {
      const address = message.from?.emailAddress;
      return {
        id: message.id,
        from: address?.name ? address.name + " <" + (address.address ?? "") + ">" : address?.address ?? "",
        subject: message.subject ?? "",
        body: plainText(message.body) || (message.bodyPreview ?? ""),
        date: message.receivedDateTime ?? new Date().toISOString()
      } satisfies MailMessage;
    });
}
