import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createWidget, deleteWidget, reorderWidgets, updateWidget } from "@/lib/work/dashboards";

const filtersSchema = z.object({
  due: z.enum(["overdue", "today", "next7", "next14", "none"]).optional(),
  statusName: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  priorities: z.array(z.enum(["URGENT", "HIGH", "NORMAL", "LOW"])).max(4).optional(),
  includeClosed: z.boolean().optional(),
  search: z.string().trim().max(100).optional()
}).partial();

const configSchema = z.object({
  filters: filtersSchema.optional(),
  listIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  sortBy: z.enum(["due", "priority", "updated", "title", "manual"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  tone: z.enum(["danger", "warning", "info", "success", "accent"]).optional(),
  text: z.string().max(5000).optional()
});

const widgetSchema = z.object({
  type: z.enum(["count", "item_list", "status_breakdown", "assignee_workload", "tag_breakdown", "text"]),
  title: z.string().trim().min(1).max(80),
  config: configSchema.default({}),
  w: z.number().int().min(2).max(12).optional()
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), widget: widgetSchema }),
  z.object({ action: z.literal("update"), widgetId: z.string().trim().min(1).max(80), widget: widgetSchema.partial() }),
  z.object({ action: z.literal("delete"), widgetId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("reorder"), widgetIds: z.array(z.string().trim().min(1).max(80)).max(60) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ dashboardId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change dashboards." }, { status: 403 });
    const { dashboardId } = await params;
    const input = requestSchema.parse(await request.json());

    let summary = "";
    if (input.action === "create") {
      const id = await createWidget(dashboardId, input.widget);
      summary = "added the card " + input.widget.title + " (" + id + ")";
    } else if (input.action === "update") {
      await updateWidget(input.widgetId, input.widget);
      summary = "edited a dashboard card" + (input.widget.title ? " (" + input.widget.title + ")" : "");
    } else if (input.action === "delete") {
      await deleteWidget(input.widgetId);
      summary = "removed a dashboard card";
    } else {
      await reorderWidgets(dashboardId, input.widgetIds);
      summary = "reordered dashboard cards";
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "DASHBOARD_UPDATED",
      entityType: "dashboard",
      entityId: dashboardId,
      summary: user.fullName + " " + summary,
      metadata: { action: input.action }
    });
    return NextResponse.json({ message: "Dashboard saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The dashboard change was invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "The dashboard could not be saved." }, { status: 500 });
  }
}
