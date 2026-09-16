// Squadron Operations Hub - notifier.
// Runs on a schedule and does two jobs:
//   1. Raises deadline notices: anything due within a member's warning window, and anything already late.
//   2. Delivers pending notices by email - one message per member, never one per notice.
// Everything it sends already exists as a row in the Hub, so a member can always check what they were told.

const APP_URL = "https://tn170adminhub.tristanmaratos.com";
const BATCH = 200;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(event, env));
  },

  // Manual run, for checking the thing works without waiting for the clock. Protected by a shared secret.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") return new Response("Not found", { status: 404 });
    if (!env.NOTIFIER_TRIGGER_SECRET || request.headers.get("x-trigger") !== env.NOTIFIER_TRIGGER_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    const summary = await run({ cron: url.searchParams.get("cron") || "manual" }, env);
    return Response.json(summary);
  }
};

async function run(event, env) {
  const daily = String(event.cron || "").startsWith("0 11"); // the morning pass also sends the DAILY digests
  const raised = await raiseDeadlineNotices(env);
  const sent = await deliver(env, daily);
  return { raised, sent, cron: event.cron ?? null };
}

// ---------------------------------------------------------------- deadlines

async function raiseDeadlineNotices(env) {
  const today = new Date().toISOString().slice(0, 10);

  // One row per member per open, dated task they are assigned, with that member's own warning window.
  const rows = await env.DB.prepare(
    `SELECT a.user_id AS user_id, i.id AS item_id, i.list_id AS list_id, i.title AS title, i.due_on AS due_on,
            l.name AS list_name,
            COALESCE(p.lead_days, 3) AS lead_days,
            COALESCE(p.on_due_soon, 1) AS on_due_soon,
            COALESCE(p.on_overdue, 1) AS on_overdue,
            COALESCE(p.email_enabled, 1) AS email_enabled
     FROM item_assignees a
     JOIN items i ON i.id = a.item_id
     JOIN lists l ON l.id = i.list_id
     JOIN users u ON u.id = a.user_id
     LEFT JOIN list_statuses s ON s.id = i.status_id
     LEFT JOIN notification_prefs p ON p.user_id = a.user_id
     WHERE i.due_on IS NOT NULL
       AND i.archived_at IS NULL
       AND l.archived_at IS NULL
       AND u.status IN ('APPROVED','PENDING')
       AND (s.category IS NULL OR s.category NOT IN ('DONE','CLOSED'))`
  ).all();

  const now = new Date().toISOString();
  const statements = [];

  for (const row of rows.results || []) {
    const days = daysBetween(today, row.due_on);
    const late = days < 0;
    if (late && !row.on_overdue) continue;
    if (!late && !row.on_due_soon) continue;
    if (!late && days > row.lead_days) continue;

    const kind = late ? "OVERDUE" : "DUE_SOON";
    // A member hears about a given deadline once a day at most, however often this runs.
    const dedupe = kind + ":" + row.item_id + ":" + today;
    const title = late
      ? row.title + " is " + plural(Math.abs(days), "day") + " late"
      : days === 0
        ? row.title + " is due today"
        : row.title + " is due in " + plural(days, "day");

    statements.push(
      env.DB.prepare(
        "INSERT INTO notifications (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?) ON CONFLICT DO NOTHING"
      ).bind(
        crypto.randomUUID(),
        row.user_id,
        kind,
        title.slice(0, 300),
        "In " + row.list_name + ". Due " + row.due_on + ".",
        row.item_id,
        row.list_id,
        APP_URL + "/lists/" + row.list_id + "?item=" + row.item_id,
        dedupe,
        row.email_enabled ? "PENDING" : "SKIPPED",
        now
      )
    );
  }

  if (!statements.length) return 0;
  for (let index = 0; index < statements.length; index += 50) {
    await env.DB.batch(statements.slice(index, index + 50));
  }
  return statements.length;
}

// ---------------------------------------------------------------- delivery

async function deliver(env, includeDaily) {
  const rows = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.url, n.created_at,
            u.email AS email, u.full_name AS full_name,
            COALESCE(p.cadence, 'DAILY') AS cadence
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     LEFT JOIN notification_prefs p ON p.user_id = n.user_id
     WHERE n.email_state = 'PENDING' AND u.status IN ('APPROVED','PENDING')
     ORDER BY n.created_at
     LIMIT ?`
  ).bind(BATCH).all();

  const byUser = new Map();
  for (const row of rows.results || []) {
    if (row.cadence === "DAILY" && !includeDaily) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }
  if (!byUser.size) return 0;

  let sentCount = 0;
  for (const [userId, notices] of byUser) {
    const to = notices[0].email;
    const subject = notices.length === 1
      ? notices[0].title
      : notices.length + " things need you — Squadron Operations Hub";
    const result = await sendEmail(env, { to, subject, notices, name: notices[0].full_name });
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE notifications SET email_state = ?, emailed_at = ? WHERE id IN (" + notices.map(() => "?").join(",") + ")"
      ).bind(result.ok ? "SENT" : "FAILED", now, ...notices.map((notice) => notice.id)),
      env.DB.prepare(
        "INSERT INTO notification_sends (id, user_id, email, subject, notification_count, provider, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), userId, to, subject.slice(0, 300), notices.length, result.provider, result.ok ? "SENT" : "FAILED", result.error || null, now)
    ]);

    if (result.ok) sentCount += notices.length;
  }
  return sentCount;
}

// Whichever mail account the squadron set up. Nothing is sent when none is configured, and the notices
// stay PENDING rather than being marked delivered, so switching a provider on later catches everything up.
async function sendEmail(env, { to, subject, notices, name }) {
  const from = env.NOTIFY_FROM;
  const html = renderEmail({ name, notices });
  const text = notices.map((notice) => "- " + notice.title + (notice.url ? "\n  " + notice.url : "")).join("\n\n");

  if (!from) return { ok: false, provider: null, error: "NOTIFY_FROM is not set." };

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
    if (response.ok) return { ok: true, provider: "resend" };
    return { ok: false, provider: "resend", error: (await response.text()).slice(0, 400) };
  }

  if (env.BREVO_API_KEY) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: addressOf(from), name: nameOf(from) },
        to: [{ email: to, name }],
        subject,
        htmlContent: html,
        textContent: text
      })
    });
    if (response.ok) return { ok: true, provider: "brevo" };
    return { ok: false, provider: "brevo", error: (await response.text()).slice(0, 400) };
  }

  return { ok: false, provider: null, error: "No mail provider key is set." };
}

function renderEmail({ name, notices }) {
  const rows = notices.map((notice) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e7ebf2">
      <div style="font:600 15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#122247">${escapeHtml(notice.title)}</div>
      ${notice.body ? `<div style="font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#52514e;margin-top:3px">${escapeHtml(notice.body)}</div>` : ""}
      ${notice.url ? `<a href="${escapeHtml(notice.url)}" style="font:600 13px system-ui,sans-serif;color:#7b68ee;text-decoration:none">Open it &rarr;</a>` : ""}
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0">
      <tr><td style="font:700 17px system-ui,-apple-system,'Segoe UI',sans-serif;color:#122247;padding-bottom:4px">TN-170 Operations Hub</td></tr>
      <tr><td style="font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#52514e;padding-bottom:8px">${escapeHtml(name || "")}, here is what needs you.</td></tr>
      ${rows}
      <tr><td style="padding-top:18px;font:12px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#898781">
        You are getting this because you are assigned this work in the Hub.
        <a href="${APP_URL}/notifications" style="color:#898781">Change what you get emailed about</a>.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// ---------------------------------------------------------------- helpers

function daysBetween(from, to) {
  return Math.round((new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000);
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

function addressOf(value) {
  const match = String(value).match(/<([^>]+)>/);
  return match ? match[1] : String(value).trim();
}

function nameOf(value) {
  const match = String(value).match(/^\s*"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() : "Squadron Operations Hub";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
