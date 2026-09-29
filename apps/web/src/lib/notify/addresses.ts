import { getDatabase } from "@/lib/cloudflare";
import { sendMail } from "./mail";

// Where a member is reached, decided by the member.
//
// The old rule was that CAPID@tncap.us always received everything and staff added anything else. This one is
// simply the member's list: their CAP address, a personal one, a work one, as many as they want, each
// switched on or off for notifications on its own.
//
// Two rules are enforced here rather than in the page, because a page is only one of the ways in:
//
//   Nothing is sent to an address until a code mailed to it comes back. An unconfirmed address is not a
//   half-finished setting, it is somebody else's inbox - the likeliest mistake is a member mistyping their own
//   address, and the person who receives the squadron's mail as a result has no way to stop it.
//
//   The last address switched on cannot be switched off. The Hub records that a member was notified, and
//   staff read that record as "they know"; an empty address list would make that record a lie while leaving
//   it looking exactly the same.

export interface MemberAddress {
  email: string;
  kind: string;
  label: string | null;
  notify: boolean;
  verified: boolean;
  /** The CAP address is listed and can be switched off, but is not something a member may delete. */
  removable: boolean;
  addedByMember: boolean;
}

const CODE_LIFETIME_MINUTES = 30;
const MOST_ATTEMPTS = 5;
/** One member, a sane number of addresses. High enough never to be met honestly, low enough to bound the table. */
const MOST_ADDRESSES = 10;

export function capAddress(capid: string): string {
  return capid + "@tncap.us";
}

function tidy(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately plain: an address is either shaped like one or it is refused with the reason. */
function looksLikeAnAddress(email: string): boolean {
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email) && email.length <= 254;
}

async function hash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Six digits, from the platform's own randomness rather than Math.random. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0] % 1000000).padStart(6, "0");
}

/**
 * The member's addresses, with the CAP one always present.
 *
 * It is seeded rather than assumed, so that from here on there is exactly one place that decides where mail
 * goes - this table - and no address is special-cased at sending time.
 */
export async function listAddresses(capid: string): Promise<MemberAddress[]> {
  const db = getDatabase();
  const cap = capAddress(capid);
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO member_email_links (email, capid, linked_by, created_at, kind, source, notify, label, verified_at) " +
      "VALUES (?, ?, NULL, ?, 'CAP', 'ESERVICES', 1, 'CAP address', ?) ON CONFLICT(email) DO NOTHING"
    )
    .bind(cap, capid, now, now)
    .run();

  const rows = await db
    .prepare(
      "SELECT email, kind, label, notify, verified_at, added_by_member FROM member_email_links " +
      "WHERE capid = ? ORDER BY CASE kind WHEN 'CAP' THEN 0 ELSE 1 END, email"
    )
    .bind(capid)
    .all<{ email: string; kind: string; label: string | null; notify: number; verified_at: string | null; added_by_member: number }>();

  return rows.results.map((row) => ({
    email: row.email,
    kind: row.kind,
    label: row.label,
    notify: Boolean(row.notify),
    verified: Boolean(row.verified_at),
    removable: row.kind !== "CAP",
    addedByMember: Boolean(row.added_by_member)
  }));
}

export interface AddressResult {
  ok: boolean;
  message: string;
  /** Set when a code has been sent and the page should ask for it. */
  awaitingCode?: string;
}

export async function startAdding(capid: string, email: string, label: string | null, memberName: string): Promise<AddressResult> {
  const db = getDatabase();
  const address = tidy(email);

  if (!looksLikeAnAddress(address)) {
    return { ok: false, message: "That does not look like an email address." };
  }

  const existing = await db
    .prepare("SELECT capid, verified_at FROM member_email_links WHERE email = ?")
    .bind(address)
    .first<{ capid: string; verified_at: string | null }>();

  if (existing && existing.capid === capid && existing.verified_at) {
    return { ok: false, message: "That address is already on your list." };
  }
  if (existing && existing.capid !== capid) {
    // Said plainly, because the member cannot fix this themselves and guessing wastes their afternoon.
    return { ok: false, message: "That address belongs to another member's account. Staff can move it." };
  }

  const mine = await db
    .prepare("SELECT COUNT(*) AS n FROM member_email_links WHERE capid = ?")
    .bind(capid)
    .first<{ n: number }>();
  if ((mine?.n ?? 0) >= MOST_ADDRESSES) {
    return { ok: false, message: "That is as many addresses as one member can hold. Remove one first." };
  }

  const code = newCode();
  const now = new Date();
  const expires = new Date(now.getTime() + CODE_LIFETIME_MINUTES * 60_000);

  const sent = await sendMail({
    to: [address],
    subject: "Confirm this address for the TN-170 Operations Hub",
    name: memberName,
    notices: [
      {
        title: "Your confirmation code is " + code,
        body:
          "Someone added this address to " + memberName + "'s notifications in the TN-170 Oak Ridge Operations Hub. " +
          "Enter the code within " + CODE_LIFETIME_MINUTES + " minutes to confirm it. " +
          "If that was not you, ignore this message - nothing will be sent here.",
        url: null
      }
    ]
  });

  // The code is only written once it has actually gone out. A row left behind by a failed send would let a
  // member sit typing a code that was never mailed.
  if (!sent.ok) {
    return { ok: false, message: sent.error ?? "That code could not be sent." };
  }

  await db
    .prepare(
      "INSERT INTO email_confirmations (email, capid, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?) " +
      "ON CONFLICT(email) DO UPDATE SET capid = excluded.capid, code_hash = excluded.code_hash, " +
      "expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at"
    )
    .bind(address, capid, await hash(code), expires.toISOString(), now.toISOString())
    .run();

  await db
    .prepare(
      "INSERT INTO member_email_links (email, capid, linked_by, created_at, kind, source, notify, label, added_by_member) " +
      "VALUES (?, ?, NULL, ?, 'OTHER', 'MANUAL', 0, ?, 1) " +
      "ON CONFLICT(email) DO UPDATE SET label = excluded.label"
    )
    .bind(address, capid, now.toISOString(), label?.slice(0, 40) || null)
    .run();

  return { ok: true, awaitingCode: address, message: "A six-digit code is on its way to " + address + "." };
}

export async function confirmAddress(capid: string, email: string, code: string): Promise<AddressResult> {
  const db = getDatabase();
  const address = tidy(email);

  const pending = await db
    .prepare("SELECT code_hash, expires_at, attempts FROM email_confirmations WHERE email = ? AND capid = ?")
    .bind(address, capid)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();

  if (!pending) return { ok: false, message: "There is no code waiting for that address. Send a new one." };

  if (pending.expires_at < new Date().toISOString()) {
    await db.prepare("DELETE FROM email_confirmations WHERE email = ?").bind(address).run();
    return { ok: false, message: "That code has expired. Send a new one." };
  }

  if (pending.attempts >= MOST_ATTEMPTS) {
    await db.prepare("DELETE FROM email_confirmations WHERE email = ?").bind(address).run();
    return { ok: false, message: "Too many wrong codes. Send a new one." };
  }

  if ((await hash(code.trim())) !== pending.code_hash) {
    await db.prepare("UPDATE email_confirmations SET attempts = attempts + 1 WHERE email = ?").bind(address).run();
    return { ok: false, message: "That code is not right." };
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE member_email_links SET verified_at = ?, notify = 1 WHERE email = ? AND capid = ?").bind(now, address, capid),
    db.prepare("DELETE FROM email_confirmations WHERE email = ?").bind(address)
  ]);

  return { ok: true, message: address + " is confirmed, and will receive notifications." };
}

export async function setNotify(capid: string, email: string, notify: boolean): Promise<AddressResult> {
  const db = getDatabase();
  const address = tidy(email);

  const row = await db
    .prepare("SELECT verified_at FROM member_email_links WHERE email = ? AND capid = ?")
    .bind(address, capid)
    .first<{ verified_at: string | null }>();
  if (!row) return { ok: false, message: "That address is not on your list." };
  if (notify && !row.verified_at) {
    return { ok: false, message: "Confirm that address first." };
  }

  if (!notify) {
    const others = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM member_email_links WHERE capid = ? AND notify = 1 AND verified_at IS NOT NULL AND email <> ?"
      )
      .bind(capid, address)
      .first<{ n: number }>();
    if ((others?.n ?? 0) === 0) {
      return {
        ok: false,
        message:
          "That is your last address. Add another one first, or turn email off altogether in the settings " +
          "above - that way the Hub knows you are not being emailed, instead of believing that you were."
      };
    }
  }

  await db
    .prepare("UPDATE member_email_links SET notify = ? WHERE email = ? AND capid = ?")
    .bind(notify ? 1 : 0, address, capid)
    .run();

  return { ok: true, message: notify ? "Notifications will go to " + address + "." : "Notifications will no longer go to " + address + "." };
}

export async function removeAddress(capid: string, email: string): Promise<AddressResult> {
  const db = getDatabase();
  const address = tidy(email);

  const row = await db
    .prepare("SELECT kind, notify, verified_at FROM member_email_links WHERE email = ? AND capid = ?")
    .bind(address, capid)
    .first<{ kind: string; notify: number; verified_at: string | null }>();
  if (!row) return { ok: false, message: "That address is not on your list." };

  // The CAP address can be switched off, but it is CAP's record of the member rather than the Hub's, and it is
  // how staff reach somebody whose personal address has gone stale. Removing it is not the member's to do.
  if (row.kind === "CAP") {
    return { ok: false, message: "Your CAP address cannot be removed, only switched off." };
  }

  if (row.notify && row.verified_at) {
    const others = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM member_email_links WHERE capid = ? AND notify = 1 AND verified_at IS NOT NULL AND email <> ?"
      )
      .bind(capid, address)
      .first<{ n: number }>();
    if ((others?.n ?? 0) === 0) {
      return { ok: false, message: "That is the only address you are being notified at. Switch another one on first." };
    }
  }

  await db.batch([
    db.prepare("DELETE FROM member_email_links WHERE email = ? AND capid = ?").bind(address, capid),
    db.prepare("DELETE FROM email_confirmations WHERE email = ?").bind(address)
  ]);

  return { ok: true, message: address + " has been removed." };
}
