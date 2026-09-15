import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createField, deleteField, listFields, updateField } from "@/lib/work/structure";

const FIELD_TYPES = ["text", "long_text", "number", "currency", "date", "checkbox", "dropdown", "labels", "person", "url", "email", "phone", "rating", "progress"] as const;

const optionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional()
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(60), type: z.enum(FIELD_TYPES), options: z.array(optionSchema).max(50).optional() }),
  z.object({ action: z.literal("update"), fieldId: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(60).optional(), options: z.array(optionSchema).max(50).optional() }),
  z.object({ action: z.literal("delete"), fieldId: z.string().trim().min(1).max(80) })
]);

async function spaceIdFor(listId: string): Promise<string> {
  const { getDatabase } = await import("@/lib/cloudflare");
  const row = await getDatabase().prepare("SELECT space_id FROM lists WHERE id = ?").bind(listId).first<{ space_id: string }>();
  if (!row) throw new Error("List not found.");
  return row.space_id;
}

export async function GET(_request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { listId } = await params;
  return NextResponse.json({ fields: await listFields(listId, await spaceIdFor(listId)) });
}

export async function POST(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change fields." }, { status: 403 });
    const { listId } = await params;
    const input = requestSchema.parse(await request.json());

    let summary = "";
    if (input.action === "create") {
      await createField({ listId, name: input.name, type: input.type, options: input.options?.map((option) => ({ ...option, color: option.color ?? null })) });
      summary = "added the field " + input.name;
    } else if (input.action === "update") {
      await updateField(input.fieldId, { name: input.name, options: input.options?.map((option) => ({ ...option, color: option.color ?? null })) });
      summary = "edited a field" + (input.name ? " (" + input.name + ")" : "");
    } else {
      await deleteField(input.fieldId);
      summary = "deleted a field";
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "LIST_FIELDS_UPDATED",
      entityType: "list",
      entityId: listId,
      summary: user.fullName + " " + summary,
      metadata: { action: input.action }
    });
    return NextResponse.json({ fields: await listFields(listId, await spaceIdFor(listId)), message: "Fields saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The field change was invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "The field could not be saved." }, { status: 500 });
  }
}
