// Work that makes itself.
//
// The duties catalogue knows what each role owes and when. Until now somebody had to read that and create
// the task by hand, which is exactly the remembering the Hub exists to remove. This runs daily and turns
// each upcoming duty into a real task, once, assigned to whoever holds that position.
//
// Only duties a person has confirmed produce work: an unverified duty is a claim about a regulation that
// nobody has checked, and the Hub does not put unchecked obligations on people's lists.

export async function generateDutyWork(env) {
  const today = new Date().toISOString().slice(0, 10);

  let duties;
  try {
    duties = await env.DB.prepare(
      "SELECT id, role, title, detail, cadence, interval_years, due_month, due_day, anchor_date, " +
      "COALESCE(lead_days, 30) AS lead_days, source_citation " +
      "FROM role_duties WHERE active = 1 AND confidence = 'CONFIRMED'"
    ).all();
  } catch {
    return 0; // the catalogue is not there yet
  }

  const rows = duties.results || [];
  if (!rows.length) return 0;

  const listId = await recurringListId(env);
  if (!listId) return 0;
  const status = await env.DB.prepare(
    "SELECT id FROM list_statuses WHERE list_id = ? ORDER BY display_order LIMIT 1"
  ).bind(listId).first();
  const owners = await ownersByRole(env);

  let made = 0;
  for (const duty of rows) {
    // Far enough ahead that the work can actually be done, rather than being a surprise on the due date.
    const horizon = addDays(today, duty.lead_days);
    for (const dueOn of occurrencesFor(duty, today, horizon)) {
      const already = await env.DB
        .prepare("SELECT id FROM duty_occurrences WHERE duty_id = ? AND due_on = ?")
        .bind(duty.id, dueOn)
        .first();
      if (already) continue;

      const now = new Date().toISOString();
      const itemId = crypto.randomUUID();
      const description = [
        duty.detail || "",
        duty.source_citation ? "Required by: " + duty.source_citation : "",
        "Created automatically from the duties of " + duty.role + "."
      ].filter(Boolean).join("\n\n");

      await env.DB.prepare(
        "INSERT INTO items (id, list_id, title, description, status_id, due_on, display_order, created_by, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM items WHERE list_id = ?), NULL, ?, ?)"
      ).bind(itemId, listId, String(duty.title).slice(0, 300), description, status ? status.id : null, dueOn, listId, now, now).run();

      // Assigned to whoever holds that duty position, when exactly one person does. A guess about who owns
      // squadron work is worse than leaving it unassigned, where it shows up as needing an owner.
      const owner = owners.get(String(duty.role).toLowerCase());
      if (owner) {
        await env.DB
          .prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)")
          .bind(itemId, owner, now)
          .run();
      }

      await env.DB
        .prepare("INSERT INTO duty_occurrences (id, duty_id, due_on, item_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), duty.id, dueOn, itemId, now)
        .run();
      made += 1;
    }
  }
  return made;
}

// One list for work that made itself, created the first time it is needed so nobody has to set it up.
async function recurringListId(env) {
  const existing = await env.DB
    .prepare("SELECT id FROM lists WHERE name = 'Recurring duties' AND archived_at IS NULL LIMIT 1")
    .first();
  if (existing) return existing.id;

  const space = await env.DB
    .prepare("SELECT id FROM spaces WHERE archived_at IS NULL ORDER BY display_order LIMIT 1")
    .first();
  if (!space) return null;

  const now = new Date().toISOString();
  const listId = "ls-recurring-duties";
  await env.DB.prepare(
    "INSERT INTO lists (id, space_id, folder_id, name, description, display_order, created_at, updated_at) " +
    "VALUES (?, ?, NULL, 'Recurring duties', 'Work the Hub creates from the squadron duties catalogue.', 999, ?, ?)"
  ).bind(listId, space.id, now, now).run();

  const statuses = [
    ["To do", "NOT_STARTED", "#87909e", 1],
    ["In progress", "ACTIVE", "#2a78d6", 2],
    ["Done", "DONE", "#0ca30c", 3]
  ];
  for (const entry of statuses) {
    await env.DB.prepare(
      "INSERT INTO list_statuses (id, list_id, name, color, category, display_order) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), listId, entry[0], entry[2], entry[1], entry[3]).run();
  }
  return listId;
}

/** Duty position to the one member who holds it. Anything ambiguous is left out on purpose. */
async function ownersByRole(env) {
  const owners = new Map();
  const add = (role, userId) => {
    if (!role || !userId) return;
    const key = String(role).toLowerCase();
    if (owners.has(key) && owners.get(key) !== userId) owners.set(key, null); // two claimants: assign neither
    else if (!owners.has(key)) owners.set(key, userId);
  };

  try {
    const staff = await env.DB.prepare(
      "SELECT p.title AS title, m.user_id AS user_id FROM personnel_positions p " +
      "JOIN personnel_members m ON m.id = p.incumbent_id WHERE m.user_id IS NOT NULL"
    ).all();
    (staff.results || []).forEach((row) => add(row.title, row.user_id));
  } catch {
    // no positions recorded yet
  }

  try {
    const titled = await env.DB.prepare(
      "SELECT duty_title, id FROM users WHERE duty_title IS NOT NULL AND status IN ('APPROVED','PENDING')"
    ).all();
    (titled.results || []).forEach((row) => add(row.duty_title, row.id));
  } catch {
    // nothing to add
  }

  for (const entry of [...owners]) if (!entry[1]) owners.delete(entry[0]);
  return owners;
}

function addDays(from, days) {
  return new Date(new Date(from + "T12:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

function dayString(year, month, day) {
  const safeDay = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return year + "-" + String(month).padStart(2, "0") + "-" + String(safeDay).padStart(2, "0");
}

// The same rules the Hub uses for its five-year outlook, so the task that appears is the one that was shown.
export function occurrencesFor(duty, from, to) {
  const dates = [];
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const day = duty.due_day == null ? 1 : duty.due_day;

  if (duty.cadence === "ONE_TIME") {
    if (duty.anchor_date && duty.anchor_date >= from && duty.anchor_date <= to) dates.push(duty.anchor_date);
    return dates;
  }

  if (duty.cadence === "EVERY_N_YEARS") {
    const interval = Math.max(1, duty.interval_years || 1);
    const anchor = duty.anchor_date || dayString(startYear, duty.due_month || 1, day);
    let year = Number(anchor.slice(0, 4));
    const month = duty.due_month || Number(anchor.slice(5, 7));
    while (year <= endYear) {
      const candidate = dayString(year, month, day);
      if (candidate >= from && candidate <= to) dates.push(candidate);
      year += interval;
    }
    return dates;
  }

  const months = duty.cadence === "MONTHLY" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    : duty.cadence === "QUARTERLY" ? [1, 4, 7, 10]
    : duty.cadence === "SEMIANNUAL" ? [duty.due_month || 1, ((duty.due_month || 1) + 5) % 12 + 1]
    : [duty.due_month || 1];

  for (let year = startYear; year <= endYear; year += 1) {
    months.forEach((month) => {
      const candidate = dayString(year, month, day);
      if (candidate >= from && candidate <= to) dates.push(candidate);
    });
  }
  return dates.sort();
}
