import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMcpBearer } from "@/lib/integrations/mcp-access";
import { findTaskById, listTasks } from "@/lib/operations/tasks";
import { getWorkspaceTree } from "@/lib/work/structure";
import { getItemDetail, listItems } from "@/lib/work/items";
import type { AuthenticatedUser } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const PROTOCOL_VERSION = "2025-06-18";
const tools = [
  {
    name: "hub_identity", title: "My Hub access",
    description: "Check which approved Hub account and current role the AI connection represents. Read only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "hub_workspaces", title: "Squadron spaces and lists",
    description: "List the squadron's spaces, folders and task lists, including list IDs for requesting work items. Read only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "hub_tasks", title: "Find operational tasks",
    description: "Find operational tasks by title, filter to tasks assigned to this Hub account, or filter by status. Read only. Maximum 50 results per call.",
    inputSchema: {
      type: "object", properties: {
        search: { type: "string", description: "Case-insensitive substring of task title" },
        onlyMine: { type: "boolean", description: "Only tasks assigned to the authorized Hub user" },
        status: { type: "string", enum: ["OPEN", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "CANCELLED"] },
        limit: { type: "integer", minimum: 1, maximum: 50 }
      }, additionalProperties: false
    }
  },
  {
    name: "hub_task", title: "Get one operational task",
    description: "Get the full details of an operational task by its UUID. Read only.",
    inputSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false }
  },
  {
    name: "hub_list_items", title: "Work items in a list",
    description: "Browse items and subtasks in a specific squadron list. Read only. Returns up to 50 results.",
    inputSchema: {
      type: "object", properties: {
        listId: { type: "string", minLength: 1, maxLength: 80 },
        search: { type: "string", description: "Optional title search" }
      }, required: ["listId"], additionalProperties: false
    }
  },
  {
    name: "hub_item", title: "Work item details",
    description: "Get a work item's description, assignments, checklist, comments and relations. Read only.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["id"], additionalProperties: false }
  }
] as const;

const tasksArgs = z.object({
  search: z.string().max(120).optional(), onlyMine: z.boolean().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "CANCELLED"]).optional(),
  limit: z.number().int().min(1).max(50).optional()
});
const itemArgs = z.object({ listId: z.string().min(1).max(80), search: z.string().max(120).optional() });
const idArgs = z.object({ id: z.string().min(1).max(80) });

function result(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
}
function callError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}
function reply(id: string | number | null, resultValue: unknown, code = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result: resultValue }, { status: code, headers: HEADERS });
}
function rpcError(id: string | number | null, code: number, message: string, httpCode = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: httpCode, headers: HEADERS });
}
function projectTask(task: Awaited<ReturnType<typeof findTaskById>>) {
  if (!task) return null;
  // Avoid exporting unrelated account and system internals from operational rows.
  return {
    id: task.id, title: task.title, description: task.description,
    status: task.status, priority: task.priority, functionalArea: task.functionalAreaName,
    owner: task.ownerName, ownerUserId: task.ownerUserId, dueOn: task.dueOn,
    tags: task.tags, requiresApproval: task.requiresApproval, createdAt: task.createdAt, updatedAt: task.updatedAt
  };
}
async function callTool(name: string, raw: unknown, user: AuthenticatedUser): Promise<unknown> {
  if (name === "hub_identity") return { id: user.id, name: user.fullName, role: user.globalRole, readOnly: true };
  if (name === "hub_workspaces") return getWorkspaceTree();
  if (name === "hub_tasks") {
    const args = tasksArgs.parse(raw);
    const all = await listTasks({ limit: 1000 });
    const found = all.filter((item) =>
      (!args.onlyMine || item.ownerUserId === user.id) &&
      (!args.status || item.status === args.status) &&
      (!args.search || item.title.toLowerCase().includes(args.search.toLowerCase()))
    );
    const limit = args.limit ?? 30;
    return { totalInLoadedWindow: found.length, truncatedToFirst1000: all.length >= 1000, tasks: found.slice(0, limit).map(projectTask) };
  }
  if (name === "hub_task") {
    const { id } = idArgs.extend({ id: z.string().uuid() }).parse(raw);
    const task = await findTaskById(id);
    return task ? projectTask(task) : { message: "Task not found." };
  }
  if (name === "hub_list_items") {
    const args = itemArgs.parse(raw);
    const tree = await getWorkspaceTree();
    const known = tree.some((space) => space.lists.some((list) => list.id === args.listId) ||
      space.folders.some((folder) => folder.lists.some((list) => list.id === args.listId)));
    if (!known) return { message: "No visible list has that ID." };
    const all = await listItems(args.listId);
    const found = args.search ? all.filter((item) => item.title.toLowerCase().includes(args.search!.toLowerCase())) : all;
    return { count: found.length, items: found.slice(0, 50).map(({ id, title, listId, parentId, statusId, priority, dueOn, assignees, tags }) =>
      ({ id, title, listId, parentId, statusId, priority, dueOn, assignees, tags })) };
  }
  if (name === "hub_item") {
    const { id } = idArgs.parse(raw);
    const item = await getItemDetail(id);
    return item ?? { message: "Item not found." };
  }
  return null;
}

/** Stateless JSON-RPC over Streamable HTTP. Does not use web sessions or CORS. */
export async function POST(request: Request) {
  // Intentionally no cookie/session fallback; MCP must use per-person bearer tokens.
  let user: AuthenticatedUser | null;
  try { user = await authenticateMcpBearer(request); }
  catch { return NextResponse.json({ message: "Connection authorization unavailable." }, { status: 503, headers: HEADERS }); }
  if (!user) {
    return NextResponse.json({ message: "A valid, approved Hub member connection key is required." }, {
      status: 401, headers: { ...HEADERS, "WWW-Authenticate": 'Bearer realm="TN-170 Operations Hub"' }
    });
  }
  let message: unknown;
  try {
    if (Number(request.headers.get("content-length") || 0) > 32000) return rpcError(null, -32600, "Request too large", 413);
    const body = await request.text();
    if (body.length > 32000) return rpcError(null, -32600, "Request too large", 413);
    message = JSON.parse(body);
  } catch {
    return rpcError(null, -32700, "Invalid JSON", 400);
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return rpcError(null, -32600, "Invalid request");
  const msg = message as Record<string, unknown>;
  const id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(id, -32600, "Invalid JSON-RPC request");
  if (msg.id === undefined) return new Response(null, { status: 202, headers: HEADERS });
  if (msg.method === "initialize") {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "TN-170 Operations Hub", version: "0.1.0" },
      instructions: "Read-only access to the currently authorized Hub member's permitted operational information. Do not claim to have written, emailed or synchronized anything."
    });
  }
  if (msg.method === "ping") return reply(id, {});
  if (msg.method === "tools/list") return reply(id, { tools: tools.map((tool) => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } })) });
  if (msg.method === "tools/call") {
    const params = msg.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) return rpcError(id, -32602, "Tool parameters required");
    const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
    if (typeof name !== "string" || !tools.some((tool) => tool.name === name)) return rpcError(id, -32602, "Unknown tool");
    try { return reply(id, result(await callTool(name, args ?? {}, user))); }
    catch (error) {
      if (error instanceof z.ZodError) return reply(id, callError("Invalid tool arguments.")); 
      console.error("MCP read tool failed:", name);
      return reply(id, callError("The Hub could not complete that read request."));
    }
  }
  return rpcError(id, -32601, "Method not found");
}

// Stateless server does not require SSE session initialization. Client should POST for calls.
export async function GET() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "POST" } });
}
