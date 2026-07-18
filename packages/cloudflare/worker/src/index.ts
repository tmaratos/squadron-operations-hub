import { authenticate, logout, requestMagicLink, verifyMagicLink } from "./auth";
import { buildDashboard } from "./rules";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent
} from "./calendar";
import { runMaintenance } from "./maintenance";
import { createTask, listTasks, taskAction, updateTask } from "./tasks";
import type {
  CalendarEventStatus,
  CalendarEventType,
  CalendarPreparation,
  Env,
  ExecutionContext,
  ScheduledController,
  TaskPriority,
  UserRole,
  UserStatus
} from "./types";
import {
  accessRequestAction,
  listAccessRequests,
  listUsers,
  requireOwner,
  submitAccessRequest,
  updateUser
} from "./users";
import { clientIp, HttpError, json, readJson, verifyWriteOrigin } from "./utils";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      verifyWriteOrigin(request, env);
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (path === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({
          ok: true,
          service: "tn170-squadron-ops-api",
          database: "connected",
          time: new Date().toISOString()
        });
      }

      if (path === "/api/auth/request-link" && request.method === "POST") {
        const body = await readJson<{ email?: string }>(request);
        return requestMagicLink(request, env, body.email || "");
      }

      if (path === "/api/auth/verify" && request.method === "GET") {
        const token = url.searchParams.get("token");
        if (!token) return new Response("Missing sign-in token.", { status: 400 });
        return verifyMagicLink(env, token);
      }

      if (path === "/api/access-requests" && request.method === "POST") {
        const body = await readJson<{
          fullName?: string;
          email?: string;
          capid?: string;
          requestedArea?: string;
          reason?: string;
        }>(request);
        return json(await submitAccessRequest(env, body, clientIp(request)), 202);
      }

      const user = await authenticate(request, env);
      if (!user) return json({ error: "AUTH_REQUIRED", message: "Sign in is required." }, 401);

      if (path === "/api/auth/me" && request.method === "GET") return json({ user });
      if (path === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (path === "/api/dashboard" && request.method === "GET") return json(await buildDashboard(env));

      if (path === "/api/calendar/events" && request.method === "GET") {
        const start = url.searchParams.get("start") || new Date().toISOString().slice(0, 10);
        const end = url.searchParams.get("end") || start;
        const eventType = url.searchParams.get("type");
        return json({ events: await listCalendarEvents(env, start, end, eventType) });
      }

      if (path === "/api/calendar/events" && request.method === "POST") {
        const body = await readJson<{
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
        }>(request);
        return json({ event: await createCalendarEvent(env, user, body) }, 201);
      }

      const calendarEventMatch = path.match(/^\/api\/calendar\/events\/([^/]+)$/);
      if (calendarEventMatch && request.method === "PATCH") {
        const body = await readJson<{
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
        }>(request);
        return json({
          event: await updateCalendarEvent(env, user, decodeURIComponent(calendarEventMatch[1]), body)
        });
      }

      if (calendarEventMatch && request.method === "DELETE") {
        return json(await deleteCalendarEvent(env, user, decodeURIComponent(calendarEventMatch[1])));
      }

      if (path === "/api/tasks" && request.method === "GET") return json({ tasks: await listTasks(env) });

      if (path === "/api/tasks" && request.method === "POST") {
        const body = await readJson<{
          title?: string;
          description?: string;
          functionalArea?: string;
          ownerUserId?: string | null;
          dueOn?: string | null;
          priority?: TaskPriority;
          readinessWeight?: number;
          requiresApproval?: boolean;
        }>(request);
        return json(await createTask(env, user, body), 201);
      }

      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && request.method === "PATCH") {
        const body = await readJson<{
          title?: string;
          description?: string | null;
          functionalArea?: string;
          ownerUserId?: string | null;
          dueOn?: string | null;
          priority?: TaskPriority;
          readinessWeight?: number;
          requiresApproval?: boolean;
        }>(request);
        return json(await updateTask(env, user, decodeURIComponent(taskMatch[1]), body));
      }

      const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/action$/);
      if (actionMatch && request.method === "POST") {
        const body = await readJson<{ action?: string; note?: string }>(request);
        return json(await taskAction(env, user, decodeURIComponent(actionMatch[1]), body.action || "", body.note));
      }

      if (path === "/api/users" && request.method === "GET") {
        requireOwner(user);
        return json({ users: await listUsers(env) });
      }

      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && request.method === "PATCH") {
        const body = await readJson<{ email?: string | null; role?: UserRole; status?: UserStatus }>(request);
        return json({ user: await updateUser(env, user, decodeURIComponent(userMatch[1]), body) });
      }

      if (path === "/api/access-requests" && request.method === "GET") {
        return json({ requests: await listAccessRequests(env, user) });
      }

      const accessMatch = path.match(/^\/api\/access-requests\/([^/]+)\/action$/);
      if (accessMatch && request.method === "POST") {
        const body = await readJson<{ action?: "approve" | "reject" }>(request);
        if (!body.action) throw new HttpError(400, "Action is required.");
        return json(await accessRequestAction(env, user, decodeURIComponent(accessMatch[1]), body.action));
      }

      return json({ error: "NOT_FOUND", message: "API route not found." }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: "REQUEST_ERROR", message: error.message }, error.status);
      console.error(error);
      return json({ error: "INTERNAL_ERROR", message: "The server could not complete the request." }, 500);
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext
  ): Promise<void> {
    context.waitUntil(runMaintenance(env));
  }
};
