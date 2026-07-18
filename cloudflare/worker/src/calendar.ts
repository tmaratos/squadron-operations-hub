import { audit } from "./auth";
import type { AuthUser, CalendarEventRow, CalendarEventStatus, CalendarEventType, CalendarPreparation, Env } from "./types";
import { HttpError, nowIso } from "./utils";

const EVENT_SELECT = `
  SELECT
    e.*,
    owner.full_name AS owner_name,
    creator.full_name AS created_by_name
  FROM calendar_events e
  LEFT JOIN users owner ON owner.id = e.owner_user_id
  LEFT JOIN users creator ON creator.id = e.created_by
`;

export interface CalendarEventInput {
  title?: string;
  description?: string | null;
  eventType?: CalendarEventType;
  eventDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  ownerUserId?: string | null;
  status?: CalendarEventStatus;
  preparation?: CalendarPreparation;
  linkUrl?: string | null;
}

export async function listCalendarEvents(
  env: Env,
  start: string,
  end: string,
  eventType?: string | null
): Promise<CalendarEventRow[]> {
  requireIsoDate(start, "start");
  requireIsoDate(end, "end");
  if (end < start) throw new HttpError(400, "Calendar range is invalid.");

  const clauses = ["e.event_date >= ?1", "e.event_date <= ?2"];
  const values: unknown[] = [start, end];

  if (eventType && eventType !== "ALL") {
    requireEventType(eventType);
    clauses.push(`e.event_type = ?${values.length + 1}`);
    values.push(eventType);
  }

  const result = await env.DB.prepare(`
    ${EVENT_SELECT}
    WHERE ${clauses.join(" AND ")}
    ORDER BY e.event_date, e.all_day DESC, COALESCE(e.start_time, '00:00'), e.title
  `).bind(...values).all<CalendarEventRow>();

  return result.results;
}

export async function getCalendarEvent(env: Env, id: string): Promise<CalendarEventRow | null> {
  return env.DB.prepare(`${EVENT_SELECT} WHERE e.id = ?1 LIMIT 1`).bind(id).first<CalendarEventRow>();
}

export async function createCalendarEvent(
  env: Env,
  user: AuthUser,
  input: CalendarEventInput
): Promise<CalendarEventRow> {
  const normalized = await validateInput(env, input, false);
  const id = crypto.randomUUID();
  const current = nowIso();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO calendar_events (
        id, title, description, event_type, event_date, start_time, end_time,
        all_day, location, owner_user_id, created_by, status, preparation,
        link_url, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
    `).bind(
      id,
      normalized.title,
      normalized.description,
      normalized.eventType,
      normalized.eventDate,
      normalized.startTime,
      normalized.endTime,
      normalized.allDay ? 1 : 0,
      normalized.location,
      normalized.ownerUserId,
      user.id,
      normalized.status,
      normalized.preparation,
      normalized.linkUrl,
      current
    ),
    env.DB.prepare(`
      INSERT INTO audit_log (
        id, actor_user_id, action, summary, entity_type, entity_id, created_at
      ) VALUES (?1, ?2, 'CALENDAR_EVENT_CREATED', ?3, 'calendar_event', ?4, ?5)
    `).bind(crypto.randomUUID(), user.id, `Created calendar event: ${normalized.title}`, id, current)
  ]);

  const event = await getCalendarEvent(env, id);
  if (!event) throw new HttpError(500, "Calendar event could not be loaded after creation.");
  return event;
}

export async function updateCalendarEvent(
  env: Env,
  user: AuthUser,
  id: string,
  input: CalendarEventInput
): Promise<CalendarEventRow> {
  const existing = await getCalendarEvent(env, id);
  if (!existing) throw new HttpError(404, "Calendar event not found.");

  const normalized = await validateInput(env, input, true);
  const fields: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown): void => {
    fields.push(`${column} = ?${values.length + 1}`);
    values.push(value);
  };

  if (normalized.title !== undefined) set("title", normalized.title);
  if (normalized.description !== undefined) set("description", normalized.description);
  if (normalized.eventType !== undefined) set("event_type", normalized.eventType);
  if (normalized.eventDate !== undefined) set("event_date", normalized.eventDate);
  if (normalized.startTime !== undefined) set("start_time", normalized.startTime);
  if (normalized.endTime !== undefined) set("end_time", normalized.endTime);
  if (normalized.allDay !== undefined) set("all_day", normalized.allDay ? 1 : 0);
  if (normalized.location !== undefined) set("location", normalized.location);
  if (normalized.ownerUserId !== undefined) set("owner_user_id", normalized.ownerUserId);
  if (normalized.status !== undefined) set("status", normalized.status);
  if (normalized.preparation !== undefined) set("preparation", normalized.preparation);
  if (normalized.linkUrl !== undefined) set("link_url", normalized.linkUrl);

  if (!fields.length) return existing;

  set("updated_at", nowIso());
  values.push(id);
  await env.DB.prepare(`UPDATE calendar_events SET ${fields.join(", ")} WHERE id = ?${values.length}`)
    .bind(...values)
    .run();

  await audit(env, user.id, "CALENDAR_EVENT_UPDATED", `Updated calendar event: ${existing.title}`);

  const event = await getCalendarEvent(env, id);
  if (!event) throw new HttpError(500, "Calendar event could not be loaded after update.");
  return event;
}

export async function deleteCalendarEvent(
  env: Env,
  user: AuthUser,
  id: string
): Promise<{ ok: true }> {
  const existing = await getCalendarEvent(env, id);
  if (!existing) throw new HttpError(404, "Calendar event not found.");

  const current = nowIso();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM calendar_events WHERE id = ?1").bind(id),
    env.DB.prepare(`
      INSERT INTO audit_log (
        id, actor_user_id, action, summary, entity_type, entity_id, created_at
      ) VALUES (?1, ?2, 'CALENDAR_EVENT_DELETED', ?3, 'calendar_event', ?4, ?5)
    `).bind(crypto.randomUUID(), user.id, `Deleted calendar event: ${existing.title}`, id, current)
  ]);

  return { ok: true };
}

async function validateInput(
  env: Env,
  input: CalendarEventInput,
  partial: boolean
): Promise<CalendarEventInput & {
  title?: string;
  eventDate?: string;
  eventType?: CalendarEventType;
  status?: CalendarEventStatus;
  preparation?: CalendarPreparation;
}> {
  const output: CalendarEventInput = {};

  if (!partial || input.title !== undefined) {
    const title = input.title?.trim();
    if (!title) throw new HttpError(400, "Event title is required.");
    if (title.length > 160) throw new HttpError(400, "Event title is too long.");
    output.title = title;
  }

  if (!partial || input.eventDate !== undefined) {
    const eventDate = input.eventDate?.trim() || "";
    requireIsoDate(eventDate, "eventDate");
    output.eventDate = eventDate;
  }

  if (input.description !== undefined) output.description = cleanOptional(input.description, 4000);
  if (input.location !== undefined) output.location = cleanOptional(input.location, 300);
  if (input.linkUrl !== undefined) output.linkUrl = validateOptionalUrl(input.linkUrl);

  if (!partial || input.eventType !== undefined) {
    const eventType = input.eventType || "MEETING";
    requireEventType(eventType);
    output.eventType = eventType;
  }

  if (!partial || input.status !== undefined) {
    const status = input.status || "SCHEDULED";
    requireStatus(status);
    output.status = status;
  }

  if (!partial || input.preparation !== undefined) {
    const preparation = input.preparation || "NONE";
    requirePreparation(preparation);
    output.preparation = preparation;
  }

  const allDay = input.allDay ?? (!partial ? false : undefined);
  if (allDay !== undefined) output.allDay = Boolean(allDay);

  if (input.startTime !== undefined || !partial) {
    output.startTime = allDay ? null : normalizeTime(input.startTime);
  }
  if (input.endTime !== undefined || !partial) {
    output.endTime = allDay ? null : normalizeTime(input.endTime);
  }

  if (output.startTime && output.endTime && output.endTime <= output.startTime) {
    throw new HttpError(400, "End time must be after start time.");
  }

  if (input.ownerUserId !== undefined) {
    if (!input.ownerUserId) {
      output.ownerUserId = null;
    } else {
      const owner = await env.DB.prepare(`
        SELECT id FROM users WHERE id = ?1 AND status = 'ACTIVE'
      `).bind(input.ownerUserId).first<{ id: string }>();
      if (!owner) throw new HttpError(400, "The selected event owner is unavailable.");
      output.ownerUserId = input.ownerUserId;
    }
  } else if (!partial) {
    output.ownerUserId = null;
  }

  return output;
}

function cleanOptional(value: string | null | undefined, maximum: number): string | null {
  const cleaned = value?.trim() || "";
  if (!cleaned) return null;
  if (cleaned.length > maximum) throw new HttpError(400, "One of the event fields is too long.");
  return cleaned;
}

function validateOptionalUrl(value: string | null | undefined): string | null {
  const cleaned = value?.trim() || "";
  if (!cleaned) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new HttpError(400, "Event link must be a valid URL.");
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new HttpError(400, "Event link must use HTTP or HTTPS.");
  }
  return parsed.toString();
}

function normalizeTime(value: string | null | undefined): string | null {
  const cleaned = value?.trim() || "";
  if (!cleaned) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) {
    throw new HttpError(400, "Time must use HH:MM format.");
  }
  return cleaned;
}

function requireIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} is not a valid date.`);
  }
}

function requireEventType(value: string): asserts value is CalendarEventType {
  if (!["MEETING", "DEADLINE", "ACTIVITY", "INSPECTION", "TRAINING", "OTHER"].includes(value)) {
    throw new HttpError(400, "Unknown calendar event type.");
  }
}

function requireStatus(value: string): asserts value is CalendarEventStatus {
  if (!["SCHEDULED", "COMPLETED", "CANCELLED"].includes(value)) {
    throw new HttpError(400, "Unknown calendar event status.");
  }
}

function requirePreparation(value: string): asserts value is CalendarPreparation {
  if (!["NONE", "NEEDS_ACTION", "IN_PROGRESS", "READY"].includes(value)) {
    throw new HttpError(400, "Unknown preparation status.");
  }
}
