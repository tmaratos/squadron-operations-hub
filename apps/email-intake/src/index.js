// Squadron Operations Hub - email intake.
// Cloudflare Email Routing hands mail to this Worker, which files it as a task in Command Intake.
//
// Two ways in, and they are not equally trusted:
//
//   A personal intake code in the address. The code is ten random characters, it is not in any header a
//   sender controls, and knowing it is what proves who sent the mail. Attribution comes from the code.
//
//   The sender's own address, matched against the membership. This is the one that needed fixing. A From
//   header is written by whoever sends the message and nothing about it is checked by the internet, so
//   trusting it meant anybody who knew a member's address could file a task in the Hub as that member -
//   attributed to them, assigned to them, and indistinguishable in the record from something they wrote.
//   Cloudflare tells us whether the message actually passed DMARC, and that is now required for this path.
//
// The distinction matters more than it used to. As long as the worst case was a spurious task, a forged
// From was a nuisance. Once a reply can change a task, the same forged header becomes a way to act as
// somebody else, so the check belongs here before any of that is built on top of it.

const INTAKE_LIST_ID = "ls-901421012792"; // Command Intake
const MAX_BODY = 6000;

/**
 * Whether the message really came from the domain it claims.
 *
 * Cloudflare adds an Authentication-Results header before handing the message over. DMARC passing is the
 * single check worth making: it means SPF or DKIM passed *and* aligned with the From domain, which is exactly
 * the question being asked. SPF or DKIM passing on their own do not, because either can pass for a domain
 * that has nothing to do with the one in From.
 *
 * Fails closed. A missing or unreadable header means unverified, because an attacker who can strip a header
 * should not thereby be treated as trusted.
 */
function passedDmarc(message) {
  let results = "";
  try {
    results = String(message.headers.get("authentication-results") || "").toLowerCase();
  } catch {
    return false;
  }
  if (!results) return false;
  // Matched with a boundary so that "dmarc=passe" or a domain containing the text cannot satisfy it.
  return /\bdmarc=pass\b/.test(results);
}

export default {
  async email(message, env) {
    const to = String(message.to || "").toLowerCase();
    const fromHeader = message.headers.get("from") || String(message.from || "");
    const senderEmail = (extractEmail(fromHeader) || String(message.from || "")).toLowerCase();
    const subject = decodeHeader(message.headers.get("subject") || "").trim() || "(no subject)";

    const codeMatch = to.match(/\+([a-z0-9]{4,32})@/);
    const code = codeMatch ? codeMatch[1] : null;

    let member = null;
    if (code) {
      member = await env.DB
        .prepare("SELECT u.id AS id, u.full_name AS full_name FROM user_settings s JOIN users u ON u.id = s.user_id WHERE s.key = 'email_code' AND lower(s.value) = ? AND u.suspended_at IS NULL")
        .bind(code)
        .first();
    }
    // Recorded so the task can say how the sender was established, rather than leaving a reader of the
    // description to assume the strongest possibility.
    let basis = member ? "intake code" : null;

    if (!member && senderEmail) {
      if (!passedDmarc(message)) {
        // Deliberately the same wording as an unknown sender. Telling a forger that the address is real and
        // only the signature was wrong tells them which half to work on.
        message.setReject("This address only accepts mail from squadron members.");
        return;
      }

      // Any address the member has confirmed, not only the one on their account. Members now hold several
      // addresses and reply from whichever their phone happens to be signed in to; matching the account
      // address alone would reject genuine mail from members who did everything right.
      member = await env.DB
        .prepare(
          "SELECT u.id AS id, u.full_name AS full_name FROM users u WHERE lower(u.email) = ? AND u.suspended_at IS NULL " +
          "UNION SELECT u.id, u.full_name FROM member_email_links e " +
          "JOIN users u ON u.capid = e.capid " +
          "WHERE lower(e.email) = ? AND e.verified_at IS NOT NULL AND u.suspended_at IS NULL LIMIT 1"
        )
        .bind(senderEmail, senderEmail)
        .first();
      if (member) basis = "verified sender address";
    }
    if (!member) {
      message.setReject("This address only accepts mail from squadron members.");
      return;
    }

    const raw = await new Response(message.raw).text();
    const body = extractText(raw).slice(0, MAX_BODY);
    const now = new Date().toISOString();
    const status = await env.DB.prepare("SELECT id FROM list_statuses WHERE list_id = ? ORDER BY display_order LIMIT 1").bind(INTAKE_LIST_ID).first();
    const id = crypto.randomUUID();
    const description = body +
      "\n\n--------------------------------\nCreated from an email.\nFrom: " + fromHeader +
      "\nSent to: " + to +
      // Written down because "we know who sent this" and "the From line said so" are different claims, and a
      // task that was filed months ago should still be able to say which one it rests on.
      "\nSender established by: " + basis +
      "\nReceived: " + now;

    await env.DB
      .prepare(
        "INSERT INTO items (id, list_id, title, description, status_id, display_order, created_by, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM items WHERE list_id = ?), ?, ?, ?)"
      )
      .bind(id, INTAKE_LIST_ID, subject.slice(0, 300), description, status ? status.id : null, INTAKE_LIST_ID, member.id, now, now)
      .run();

    await env.DB.prepare("INSERT OR IGNORE INTO task_tags (id, label, color, created_at, updated_at) VALUES ('tg-email', 'email', 'blue', ?, ?)").bind(now, now).run();
    await env.DB.prepare("INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM task_tags WHERE label = 'email'").bind(id).run();
    await env.DB.prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)").bind(id, member.id, now).run();
  }
};

function extractEmail(value) {
  const match = String(value).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

// Subjects arrive encoded when they contain anything but plain ASCII.
function decodeHeader(value) {
  return String(value).replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (whole, charset, kind, text) => {
    try {
      if (kind.toLowerCase() === "b") return decodeURIComponent(escape(atob(text)));
      return decodeQuotedPrintable(text.replace(/_/g, " "));
    } catch {
      return whole;
    }
  }).replace(/\s+/g, " ");
}

function decodeQuotedPrintable(value) {
  return String(value)
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (whole, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBody(body, encoding) {
  const kind = String(encoding || "").toLowerCase();
  if (kind.includes("base64")) {
    try {
      return decodeURIComponent(escape(atob(body.replace(/\s+/g, ""))));
    } catch {
      return body;
    }
  }
  if (kind.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function stripHtml(value) {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n");
}

// Pulls the readable words out of the raw message: plain text if the sender included it, otherwise the HTML with tags removed.
function extractText(raw) {
  const text = String(raw).replace(/\r\n/g, "\n");
  const split = text.indexOf("\n\n");
  const headers = split > 0 ? text.slice(0, split) : text;
  const boundaryMatch = headers.match(/boundary="?([^";\n]+)"?/i);

  if (boundaryMatch) {
    const parts = text.split("--" + boundaryMatch[1]);
    const plain = pickPart(parts, "text/plain");
    if (plain) return plain.trim();
    const html = pickPart(parts, "text/html");
    if (html) return stripHtml(html).trim();
  }

  const encoding = (headers.match(/content-transfer-encoding:\s*([^\n]+)/i) || [])[1];
  const bodyOnly = split > 0 ? text.slice(split + 2) : text;
  const decoded = decodeBody(bodyOnly, encoding);
  return (/<html|<body|<div/i.test(decoded) ? stripHtml(decoded) : decoded).trim();
}

function pickPart(parts, contentType) {
  for (const part of parts) {
    if (!part.toLowerCase().includes(contentType)) continue;
    const split = part.indexOf("\n\n");
    if (split < 0) continue;
    const partHeaders = part.slice(0, split);
    const encoding = (partHeaders.match(/content-transfer-encoding:\s*([^\n]+)/i) || [])[1];
    return decodeBody(part.slice(split + 2), encoding);
  }
  return null;
}
