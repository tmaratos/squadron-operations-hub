// Routines producing their next task.
//
// Runs daily beside the duty generator. A routine makes one task per due date, however often this runs,
// and only once the due date is close enough to be worth doing - there is no use seeing next November's
// schedule task in September.

export async function generateRecurringWork(env) {
  const today = new Date().toISOString().slice(0, 10);

  let routines;
  try {
    routines = await env.DB.prepare(
      "SELECT id, list_id, title, description, priority, frequency, day_of_month, weekday, week_of_month, " +
      "month_of_period, lead_days, assignee_user_id, tags, next_due FROM recurring_tasks WHERE active = 1"
    ).all();
  } catch {
    return 0; // the table is not there yet
  }

  const rows = routines.results || [];
  if (!rows.length) return 0;

  let made = 0;
  for (const routine of rows) {
    const horizon = addDays(today, routine.lead_days ?? 7);
    let dueOn = routine.next_due;

    // A routine left alone for months catches up rather than losing every occurrence it missed, but only
    // so far: ten is plenty, and stops a mistake in a rule producing a thousand tasks.
    let guard = 0;
    while (dueOn <= horizon && guard < 10) {
      guard += 1;
      const already = await env.DB
        .prepare("SELECT id FROM recurring_occurrences WHERE recurring_id = ? AND due_on = ?")
        .bind(routine.id, dueOn)
        .first();

      if (!already) {
        const now = new Date().toISOString();
        const itemId = crypto.randomUUID();
        const status = await env.DB
          .prepare("SELECT id FROM list_statuses WHERE list_id = ? ORDER BY display_order LIMIT 1")
          .bind(routine.list_id)
          .first();

        await env.DB.prepare(
          "INSERT INTO items (id, list_id, title, description, status_id, priority, due_on, display_order, created_by, recurring_id, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM items WHERE list_id = ?), NULL, ?, ?, ?)"
        ).bind(
          itemId,
          routine.list_id,
          String(routine.title).slice(0, 300),
          routine.description || null,
          status ? status.id : null,
          routine.priority || null,
          dueOn,
          routine.list_id,
          routine.id,
          now,
          now
        ).run();

        if (routine.assignee_user_id) {
          await env.DB
            .prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)")
            .bind(itemId, routine.assignee_user_id, now)
            .run();
        }

        for (const label of parseTags(routine.tags)) {
          const tagId = "tg-" + label.replace(/[^a-z0-9]+/g, "-");
          await env.DB.prepare(
            "INSERT OR IGNORE INTO task_tags (id, label, color, created_at, updated_at) VALUES (?, ?, 'blue', ?, ?)"
          ).bind(tagId, label, now, now).run();
          await env.DB.prepare(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM task_tags WHERE label = ?"
          ).bind(itemId, label).run();
        }

        await env.DB
          .prepare("INSERT INTO recurring_occurrences (id, recurring_id, due_on, item_id, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), routine.id, dueOn, itemId, now)
          .run();
        made += 1;
      }

      dueOn = nextDue(routine, dueOn);
    }

    if (dueOn !== routine.next_due) {
      await env.DB
        .prepare("UPDATE recurring_tasks SET next_due = ?, updated_at = ? WHERE id = ?")
        .bind(dueOn, new Date().toISOString(), routine.id)
        .run();
    }
  }

  return made;
}

function parseTags(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag).toLowerCase()).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function addDays(from, days) {
  return new Date(new Date(from + "T12:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function nthWeekday(year, month, weekday, week) {
  if (week === -1) {
    const last = daysInMonth(year, month);
    const lastDow = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
    return last - ((lastDow - weekday + 7) % 7);
  }
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return Math.min(1 + ((weekday - firstDow + 7) % 7) + (week - 1) * 7, daysInMonth(year, month));
}

function dayIn(year, month, routine) {
  if (routine.weekday !== null && routine.weekday !== undefined && routine.week_of_month) {
    return nthWeekday(year, month, routine.weekday, routine.week_of_month);
  }
  return Math.min(routine.day_of_month || 1, daysInMonth(year, month));
}

// The same rules the Hub uses when it shows somebody what their routine means.
function nextDue(routine, after) {
  const start = new Date(after + "T00:00:00Z");

  if (routine.frequency === "WEEKLY") {
    const weekday = routine.weekday ?? 1;
    const ahead = ((weekday - start.getUTCDay() + 7) % 7) || 7;
    return new Date(start.getTime() + ahead * 86400000).toISOString().slice(0, 10);
  }

  if (routine.frequency === "MONTHLY") {
    for (let step = 0; step < 24; step += 1) {
      const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + step) / 12);
      const month = ((start.getUTCMonth() + step) % 12) + 1;
      const candidate = year + "-" + pad(month) + "-" + pad(dayIn(year, month, routine));
      if (candidate > after) return candidate;
    }
  }

  if (routine.frequency === "QUARTERLY") {
    const offset = Math.min(Math.max(routine.month_of_period || 1, 1), 3) - 1;
    for (let step = 0; step < 12; step += 1) {
      const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3 + step * 3;
      const year = start.getUTCFullYear() + Math.floor(quarterStartMonth / 12);
      const month = (quarterStartMonth % 12) + 1 + offset;
      const realYear = month > 12 ? year + 1 : year;
      const realMonth = month > 12 ? month - 12 : month;
      const candidate = realYear + "-" + pad(realMonth) + "-" + pad(dayIn(realYear, realMonth, routine));
      if (candidate > after) return candidate;
    }
  }

  const month = Math.min(Math.max(routine.month_of_period || 1, 1), 12);
  for (let step = 0; step < 5; step += 1) {
    const year = start.getUTCFullYear() + step;
    const candidate = year + "-" + pad(month) + "-" + pad(dayIn(year, month, routine));
    if (candidate > after) return candidate;
  }
  return after;
}
