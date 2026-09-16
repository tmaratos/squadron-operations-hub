// Squadron Operations Hub - email intake.
// Cloudflare Email Routing hands mail to this Worker, which files it as a task in Command Intake.
// Mail is only accepted when it is addressed to a member's personal intake code, or sent from the email
// address of a Hub member. Anything else is rejected, so a public address cannot fill the Hub with spam.

const INTAKE_LIST_ID = "ls-901421012792"; // Command Intake
const MAX_BODY = 6000;

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
    if (!member && senderEmail) {
      member = await env.DB
        .prepare("SELECT id, full_name FROM users WHERE lower(email) = ? AND suspended_at IS NULL")
        .bind(senderEmail)
        .first();
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
