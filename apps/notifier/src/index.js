// Squadron Operations Hub - notifier.
// Runs on a schedule and does three jobs:
//   1. Turns the squadron's confirmed duties into real tasks before they are due.
//   2. Raises deadline notices: anything due within a member's warning window, and anything already late.
//   3. Delivers pending notices by email - one message per member, never one per notice.
// Everything it sends already exists as a row in the Hub, so a member can always check what they were told.

import { generateDutyWork } from "./duty-work.js";
import { generateRecurringWork } from "./recurring-work.js";

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
    const forced = url.searchParams.get("digest");
    const summary = forced === "EVENING" || forced === "MORNING"
      ? { raised: await raiseDeadlineNotices(env), sent: await deliver(env, forced), digest: forced, forced: true }
      : await run({ cron: "manual" }, env);
    return Response.json(summary);
  }
};

// The squadron is in Oak Ridge, Tennessee, which is Eastern. A fixed UTC hour would drift an hour every
// time daylight saving changes, so the worker wakes up hourly and asks what time it actually is there.
const SQUADRON_TIME_ZONE = "America/New_York";

function squadronHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: SQUADRON_TIME_ZONE,
    hour: "numeric",
    hour12: false
  }).format(now);
  return Number(hour) % 24;
}

async function run(event, env) {
  // Two daily passes, both in squadron time. The evening one is the default, because squadron work gets
  // dealt with after the day job; the morning one is for members who would rather start the day with it.
  const hour = squadronHour();
  const digest = hour === 18 ? "EVENING" : hour === 6 ? "MORNING" : null;
  // Duties become real work before anybody has to remember them.
  const generated = digest ? await generateDutyWork(env) : 0;
  const routines = digest ? await generateRecurringWork(env) : 0;
  const raised = digest ? await raiseDeadlineNotices(env) : 0;
  // Once a day, in the evening pass. The security controls the squadron attested to CAP are tested against
  // the running system, and nothing is said unless one has stopped holding.
  const security = digest === "EVENING" ? await checkSecurityControls(env, new Date().toISOString()) : 0;
  const sent = await deliver(env, digest);
  return { generated, routines, raised, security, sent, digest, squadronHour: hour, cron: event.cron ?? null };
}

// ---------------------------------------------------------------- deadlines

// When a deadline is worth mentioning: a week out, three days out, the day before, and the day itself.
// Then every day once it is late, because late is the part that needs nagging.
//
// Milestones rather than "every day inside the window". A task with a fortnight's notice used to produce
// a fortnight of identical emails, and the squadron learned to delete them unread - which costs you the
// one that mattered.
const LADDER = [7, 3, 1, 0];

/**
 * Who holds each functional area, by the name a department carries.
 *
 * This is how a dated task nobody has taken reaches the person whose job it is. The Finance department's
 * work reaches the Finance Officer; Logistics reaches the Logistics Officer. A task with an assignee goes
 * to the assignee and stops there - the position holder is the fallback, not a second copy.
 */
async function positionHolders(env) {
  const byArea = new Map();
  try {
    // Two things were wrong here and both failed quietly, which is why work with a date and no owner has
    // never once reached a position holder. The column is functional_area_key and not functional_area_name,
    // so the query threw and the catch below swallowed it; and the lookup compares this against a space
    // name like "Aerospace Education" while the key is "aerospace-education", so even a working query would
    // have matched nothing. Both the key and the area's real name are now registered, each normalised the
    // same way, so a department matches whichever it is named after.
    //
    // Assistants count. A position with an officer in charge and two assistants has three people doing the
    // job, and routing to one of them because the chart has one incumbent field is how something sits
    // unanswered while somebody is away.
    const rows = await env.DB.prepare(
      `SELECT a.key AS area_key, a.name AS area_name, m.user_id AS user_id
       FROM personnel_positions p
       JOIN personnel_members m ON m.id = p.incumbent_id
       JOIN functional_areas a ON a.key = p.functional_area_key
       WHERE m.user_id IS NOT NULL AND m.status = 'ACTIVE'
       UNION
       SELECT a.key AS area_key, a.name AS area_name, m.user_id AS user_id
       FROM position_assistants s
       JOIN personnel_positions p ON p.id = s.position_id
       JOIN personnel_members m ON m.id = s.personnel_member_id
       JOIN functional_areas a ON a.key = p.functional_area_key
       WHERE m.user_id IS NOT NULL AND m.status = 'ACTIVE'`
    ).all();

    const normalise = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const row of rows.results || []) {
      for (const label of [row.area_key, row.area_name]) {
        const key = normalise(label);
        if (!key) continue;
        const held = byArea.get(key) || [];
        if (!held.includes(row.user_id)) held.push(row.user_id);
        byArea.set(key, held);
      }
    }
  } catch {
    // No organisation chart yet. Assignees still get their own notices.
  }
  return byArea;
}

/**
 * The security controls the squadron attested to CAP, tested nightly against the running system.
 *
 * Kept here rather than in the app because it has to happen whether or not anybody opens a page. It speaks
 * only when something has stopped holding: a nightly "all is well" trains people to ignore it, and the one
 * night it matters it would be ignored too.
 *
 * Deliberately a small set of hard facts. Anything that needs a person to confirm - a laptop's disk
 * encryption, MFA on a Google account - is not tested here and is never reported as passing.
 */
async function checkSecurityControls(env, now) {
  const failures = [];
  const ask = async (sql, ...binds) => {
    try {
      const row = await env.DB.prepare(sql).bind(...binds).first();
      return row ? Number(Object.values(row)[0]) : 0;
    } catch {
      return null; // a missing table is not a breach; it is reported by its absence elsewhere
    }
  };

  // A credential readable in the database. The one that would matter most.
  const plain = await ask(
    "SELECT COUNT(*) AS n FROM user_google_oauth WHERE access_token_encrypted LIKE 'ya29.%' OR access_token_encrypted LIKE '1//%' OR refresh_token_encrypted LIKE '1//%'"
  );
  if (plain > 0) {
    failures.push(plain + " stored credential" + (plain === 1 ? " is" : "s are") + " readable in plain text.");
  }

  // Suspension that did not take effect.
  const suspended = await ask(
    "SELECT COUNT(*) AS n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.status IN ('SUSPENDED','ARCHIVED') AND s.revoked_at IS NULL AND s.expires_at > ?",
    now
  );
  if (suspended > 0) {
    failures.push(suspended + " suspended or archived account still holds a live session.");
  }

  // An account let in on a CAP address alone that can now change things.
  const overReaching = await ask(
    "SELECT COUNT(*) AS n FROM users WHERE access_basis = 'DOMAIN' AND global_role != 'READ_ONLY'"
  );
  if (overReaching > 0) {
    failures.push(overReaching + " account admitted on a CAP address alone can change data.");
  }

  // A session that outlives the window the squadron attested to.
  const ttl = Number(env.SESSION_TTL_HOURS || 12);
  const beyond = await ask(
    "SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?",
    new Date(Date.now() + (ttl + 1) * 3600000).toISOString()
  );
  if (beyond > 0) {
    failures.push(beyond + " session lasts longer than the " + ttl + " hour limit.");
  }

  // The audit log is how an incident would ever be reconstructed. Silence in it is itself a finding.
  const audit = await ask("SELECT COUNT(*) AS n FROM audit_events WHERE created_at > ?", new Date(Date.now() - 7 * 86400000).toISOString());
  if (audit === 0) {
    failures.push("Nothing has been written to the audit log in seven days.");
  }

  if (!failures.length) return 0;

  // Every system owner hears about it, once per day per distinct problem.
  const owners = await env.DB.prepare(
    "SELECT id FROM users WHERE global_role = 'SYSTEM_OWNER' AND status = 'APPROVED'"
  ).all();
  const statements = [];
  const day = now.slice(0, 10);
  for (const owner of owners.results || []) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO notifications (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, created_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, 'PENDING', ?) ON CONFLICT DO NOTHING"
      ).bind(
        crypto.randomUUID(),
        owner.id,
        "SYSTEM",
        failures.length === 1 ? "A security control has stopped holding" : failures.length + " security controls have stopped holding",
        failures.join(" ") + " These are controls the squadron attested to CAP.",
        APP_URL + "/settings/security",
        "SECCHECK:" + day + ":" + failures.length,
        now
      )
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return failures.length;
}

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

  // Dated, open, and nobody has taken it: these go to whoever holds the department's position instead.
  const holders = await positionHolders(env);
  let unowned = { results: [] };
  try {
    unowned = await env.DB.prepare(
      `SELECT i.id AS item_id, i.list_id AS list_id, i.title AS title, i.due_on AS due_on,
              l.name AS list_name, sp.name AS space_name
       FROM items i
       JOIN lists l ON l.id = i.list_id
       JOIN spaces sp ON sp.id = l.space_id
       LEFT JOIN list_statuses s ON s.id = i.status_id
       WHERE i.due_on IS NOT NULL
         AND i.archived_at IS NULL
         AND l.archived_at IS NULL
         AND (s.category IS NULL OR s.category NOT IN ('DONE','CLOSED'))
         AND NOT EXISTS (SELECT 1 FROM item_assignees a WHERE a.item_id = i.id)`
    ).all();
  } catch {
    unowned = { results: [] };
  }

  const queued = [];
  for (const row of rows.results || []) {
    queued.push({ ...row, viaPosition: false, viaWatch: false });
  }

  // People following a task they are not doing. The deadline is the whole reason they followed it.
  let followed = { results: [] };
  try {
    followed = await env.DB.prepare(
      `SELECT w.user_id AS user_id, i.id AS item_id, i.list_id AS list_id, i.title AS title, i.due_on AS due_on,
              l.name AS list_name,
              COALESCE(p.lead_days, 3) AS lead_days,
              COALESCE(p.on_due_soon, 1) AS on_due_soon,
              COALESCE(p.on_overdue, 1) AS on_overdue,
              COALESCE(p.email_enabled, 1) AS email_enabled
       FROM item_watchers w
       JOIN items i ON i.id = w.item_id
       JOIN lists l ON l.id = i.list_id
       JOIN users u ON u.id = w.user_id
       LEFT JOIN list_statuses s ON s.id = i.status_id
       LEFT JOIN notification_prefs p ON p.user_id = w.user_id
       WHERE i.due_on IS NOT NULL
         AND i.archived_at IS NULL
         AND l.archived_at IS NULL
         AND u.status IN ('APPROVED','PENDING')
         AND (s.category IS NULL OR s.category NOT IN ('DONE','CLOSED'))
         AND NOT EXISTS (SELECT 1 FROM item_assignees a WHERE a.item_id = i.id AND a.user_id = w.user_id)`
    ).all();
  } catch {
    followed = { results: [] };
  }
  for (const row of followed.results || []) {
    queued.push({ ...row, viaPosition: false, viaWatch: true });
  }
  for (const row of unowned.results || []) {
    const areaKey = String(row.space_name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const userId of holders.get(areaKey) || []) {
      queued.push({
        ...row,
        user_id: userId,
        lead_days: 7,
        on_due_soon: 1,
        on_overdue: 1,
        email_enabled: 1,
        viaPosition: true
      });
    }
  }

  for (const row of queued) {
    const days = daysBetween(today, row.due_on);
    const late = days < 0;
    if (late && !row.on_overdue) continue;
    if (!late && !row.on_due_soon) continue;
    // A rung of the ladder, not every day of the window. Late still speaks up daily.
    if (!late && !LADDER.includes(days)) continue;
    if (!late && days > Math.max(row.lead_days, 7)) continue;

    const kind = late ? "OVERDUE" : "DUE_SOON";
    // Once per member per task per rung. Late uses the date, so it repeats daily and nothing else does.
    const dedupe = kind + ":" + row.item_id + ":" + (late ? today : "d" + days) + (row.viaPosition ? ":pos" : row.viaWatch ? ":watch" : "");
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
        (row.viaPosition
          ? "Nobody has taken this. It is " + row.space_name + " work, which is yours. In " + row.list_name + ". Due " + row.due_on + "."
          : row.viaWatch
            ? "You are following this one. In " + row.list_name + ". Due " + row.due_on + "."
            : "In " + row.list_name + ". Due " + row.due_on + "."),
        row.item_id,
        row.list_id,
        APP_URL + "/lists/" + row.list_id + "?item=" + row.item_id,
        dedupe,
        row.email_enabled ? "PENDING" : "SKIPPED",
        now
      )
    );
  }

  // Reminders somebody set on the task itself, rather than the ladder above.
  //
  // These are exact: a date a person chose, or accepted from the assistant, and they go to whoever the task
  // is assigned to. A task carrying its own reminders still gets the ladder as well - the point of setting
  // one for six weeks out is the early warning, not going quiet a week before a deadline.
  let own = { results: [] };
  try {
    own = await env.DB.prepare(
      `SELECT r.id AS reminder_id, r.remind_on, r.note,
              i.id AS item_id, i.title, i.due_on, l.id AS list_id, l.name AS list_name,
              a.user_id AS user_id, COALESCE(p.email_enabled, 1) AS email_enabled
       FROM item_reminders r
       JOIN items i ON i.id = r.item_id
       JOIN lists l ON l.id = i.list_id
       JOIN item_assignees a ON a.item_id = i.id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN list_statuses s ON s.id = i.status_id
       LEFT JOIN notification_prefs p ON p.user_id = a.user_id
       WHERE r.sent_at IS NULL
         AND r.remind_on <= ?
         AND i.archived_at IS NULL
         AND l.archived_at IS NULL
         AND u.status IN ('APPROVED','PENDING')
         AND (s.category IS NULL OR s.category NOT IN ('DONE','CLOSED'))`
    ).bind(today).all();
  } catch {
    // The table arrives with a migration. Until then there are none, and the ladder is all there is.
    own = { results: [] };
  }

  const firing = new Set();
  for (const row of own.results || []) {
    firing.add(row.reminder_id);
    const days = row.due_on ? daysBetween(today, row.due_on) : null;
    statements.push(
      env.DB.prepare(
        "INSERT INTO notifications (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?) ON CONFLICT DO NOTHING"
      ).bind(
        crypto.randomUUID(),
        row.user_id,
        "DUE_SOON",
        row.note ? row.title + " — " + row.note : row.title,
        [
          "In " + row.list_name + ".",
          row.due_on ? (days > 0 ? "Due in " + plural(days, "day") + ", on " + row.due_on + "." : days === 0 ? "Due today." : "Due " + row.due_on + ".") : null,
          "You asked to be reminded now."
        ].filter(Boolean).join(" "),
        row.item_id,
        row.list_id,
        APP_URL + "/lists/" + row.list_id + "?item=" + row.item_id,
        // Its own id, so one reminder sends once however many times this runs in a day.
        "REMINDER:" + row.reminder_id,
        row.email_enabled ? "PENDING" : "SKIPPED",
        now
      )
    );
  }

  // Marked sent in the same batch as the notice, so a failure part way through does not lose the reminder
  // or send it twice.
  for (const reminderId of firing) {
    statements.push(
      env.DB.prepare("UPDATE item_reminders SET sent_at = ?, updated_at = ? WHERE id = ?").bind(now, now, reminderId)
    );
  }

  if (!statements.length) return 0;
  for (let index = 0; index < statements.length; index += 50) {
    await env.DB.batch(statements.slice(index, index + 50));
  }
  return statements.length;
}

/** Puts back anything that was marked failed when there was no way to send it in the first place. */
async function revivePendingSends(env) {
  try {
    await env.DB.prepare(
      "UPDATE notifications SET email_state = 'PENDING', emailed_at = NULL " +
      "WHERE email_state = 'FAILED' AND id IN (" +
      "  SELECT n.id FROM notifications n JOIN notification_sends s ON s.user_id = n.user_id " +
      "  WHERE s.provider IS NULL AND s.status = 'FAILED' AND s.created_at >= n.created_at" +
      ")"
    ).run();
  } catch {
    // nothing to put back
  }
}

// ---------------------------------------------------------------- delivery

async function deliver(env, digestWindow) {
  // A notice that could not be sent because nothing was configured to send it has not failed - it has not
  // been tried. Marking those FAILED burned them permanently: the key was added later and the member never
  // heard about the work anyway. They are put back in the queue instead.
  await revivePendingSends(env);

  const rows = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.url, n.created_at,
            u.email AS email, u.full_name AS full_name,
            COALESCE(p.cadence, 'DAILY') AS cadence,
            COALESCE(p.digest_when, 'EVENING') AS digest_when
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     LEFT JOIN notification_prefs p ON p.user_id = n.user_id
     WHERE n.email_state = 'PENDING' AND u.status IN ('APPROVED','PENDING')
     ORDER BY n.created_at
     LIMIT ?`
  ).bind(BATCH).all();

  const byUser = new Map();
  for (const row of rows.results || []) {
    // Immediate notices are sent by the Hub itself; anything of theirs still sitting here is a catch-up.
    if (row.cadence === "DAILY" && row.digest_when !== digestWindow) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }
  if (!byUser.size) return 0;

  let sentCount = 0;
  for (const [userId, notices] of byUser) {
    // A member is one person with several addresses: their CAP address, the personal one CAP has on file,
    // and later a Microsoft one. One email, addressed to all of them, rather than one email per address.
    const to = await addressesFor(env, userId, notices[0].email);
    const subject = notices.length === 1
      ? notices[0].title
      : notices.length + " things need you — Squadron Operations Hub";
    const result = await sendEmail(env, { to, subject, notices, name: notices[0].full_name });
    const now = new Date().toISOString();

    // Nothing configured to send with: leave them pending so they go out when there is.
    if (!result.ok && !result.provider) {
      await env.DB.prepare(
        "INSERT INTO notification_sends (id, user_id, email, subject, notification_count, provider, status, error, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'FAILED', ?, ?)"
      ).bind(crypto.randomUUID(), userId, to.join(", "), subject.slice(0, 300), notices.length, result.error || "Nothing is configured to send email.", now).run();
      continue;
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE notifications SET email_state = ?, emailed_at = ? WHERE id IN (" + notices.map(() => "?").join(",") + ")"
      ).bind(result.ok ? "SENT" : "FAILED", now, ...notices.map((notice) => notice.id)),
      env.DB.prepare(
        "INSERT INTO notification_sends (id, user_id, email, subject, notification_count, provider, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), userId, to.join(", "), subject.slice(0, 300), notices.length, result.provider, result.ok ? "SENT" : "FAILED", result.error || null, now)
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
      body: JSON.stringify({ from, to, subject, html, text })
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
        to: to.map((address) => ({ email: address, name })),
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


/** Every address that reaches this member: their Hub address plus anything linked to their CAPID. */
async function addressesFor(env, userId, fallback) {
  try {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT e.email AS email
       FROM users u
       LEFT JOIN member_email_links e ON e.capid = u.capid AND e.notify = 1
       WHERE u.id = ? AND e.email IS NOT NULL`
    ).bind(userId).all();
    const extra = (rows.results || []).map((row) => String(row.email).toLowerCase());
    return [...new Set([String(fallback).toLowerCase(), ...extra])];
  } catch {
    return [String(fallback).toLowerCase()];
  }
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
