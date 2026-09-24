import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/types";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import {
  deleteStep,
  listDevelopment,
  listSteps,
  nextStepsFor,
  parseDutyPositions,
  saveDevelopment,
  saveStep
} from "@/lib/org/development";
import { assertSameOrigin } from "@/lib/security/origin";
import { createItem, updateItem } from "@/lib/work/items";
import { getWorkspaceTree } from "@/lib/work/structure";

// Positions, professional development, and the nudge that follows from both.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const [members, steps] = await Promise.all([listDevelopment(), listSteps()]);
  return NextResponse.json({ members, steps, canEdit: canApproveAccounts(user.globalRole) });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("member"),
    capid: z.string().regex(/^\d{5,7}$/),
    dutyPosition: z.string().trim().max(120).nullable().optional(),
    pdLevel: z.enum(["I", "II", "III", "IV", "V"]).nullable().optional(),
    specialtyTrack: z.string().trim().max(120).nullable().optional(),
    trackRating: z.enum(["TECHNICIAN", "SENIOR", "MASTER"]).nullable().optional()
  }),
  z.object({ action: z.literal("positions"), text: z.string().min(5).max(200000) }),
  z.object({
    action: z.literal("step"),
    fromLevel: z.enum(["I", "II", "III", "IV", "V"]),
    toLevel: z.enum(["I", "II", "III", "IV", "V"]),
    title: z.string().trim().min(3).max(200),
    detail: z.string().trim().max(1000).optional(),
    sourceCitation: z.string().trim().max(200).optional()
  }),
  z.object({ action: z.literal("removeStep"), stepId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("prompt"), capid: z.string().regex(/^\d{5,7}$/) })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canApproveAccounts(user.globalRole)) return NextResponse.json({ message: "Administrators only." }, { status: 403 });
    const input = schema.parse(await request.json());

    if (input.action === "member") {
      await saveDevelopment({ ...input, updatedBy: user.id });
      return NextResponse.json({ ...(await state()), message: "Saved." });
    }

    if (input.action === "positions") {
      const parsed = parseDutyPositions(input.text);
      for (const entry of parsed) {
        await saveDevelopment({ capid: entry.capid, dutyPosition: entry.dutyPosition, source: "ESERVICES", updatedBy: user.id });
      }
      await recordAuditEvent({
        actorUserId: user.id,
        action: "DUTY_POSITIONS_IMPORTED",
        entityType: "roster",
        entityId: "tn-170",
        summary: user.fullName + " loaded " + parsed.length + " duty positions from eServices",
        metadata: { count: parsed.length }
      });
      return NextResponse.json({
        ...(await state()),
        message: parsed.length
          ? "Read " + parsed.length + " duty position" + (parsed.length === 1 ? "" : "s") + "."
          : "No duty positions were found in that text."
      });
    }

    if (input.action === "step") {
      await saveStep({ ...input, userId: user.id });
      return NextResponse.json({ ...(await state()), message: "Added." });
    }

    if (input.action === "removeStep") {
      await deleteStep(input.stepId);
      return NextResponse.json({ ...(await state()), message: "Removed." });
    }

    // Puts the next steps in front of one member as real tasks, once each.
    const [members, steps] = await Promise.all([listDevelopment(), listSteps()]);
    const member = members.find((entry) => entry.capid === input.capid);
    if (!member) return NextResponse.json({ message: "That member is not on the roster." }, { status: 404 });
    const next = nextStepsFor(member, steps);
    if (!next.length) {
      return NextResponse.json({
        message: member.pdLevel
          ? "Nothing is recorded as the next step from Level " + member.pdLevel + " yet."
          : "Record " + member.fullName + "'s level first, so the Hub knows what comes next."
      }, { status: 400 });
    }

    const spaces = await getWorkspaceTree();
    const lists = spaces.flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)]);
    const list = lists.find((entry) => entry.name.toLowerCase().includes("intake")) ?? lists[0];
    if (!list) return NextResponse.json({ message: "There is no list to put these in." }, { status: 400 });

    const db = getDatabase();
    let made = 0;
    for (const step of next) {
      const already = await db
        .prepare("SELECT id FROM development_prompts WHERE capid = ? AND step_id = ?")
        .bind(member.capid, step.id)
        .first();
      if (already) continue;

      const itemId = await createItem({ listId: list.id, title: step.title, userId: user.id });
      await updateItem(itemId, {
        description: [
          "Professional development: Level " + step.fromLevel + " to Level " + step.toLevel + ".",
          step.detail ?? "",
          step.sourceCitation ? "From: " + step.sourceCitation : ""
        ].filter(Boolean).join("\n\n"),
        ...(member.userId ? { assigneeIds: [member.userId] } : {})
      });
      await db
        .prepare("INSERT INTO development_prompts (id, capid, step_id, item_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), member.capid, step.id, itemId, new Date().toISOString())
        .run();
      made += 1;
    }

    return NextResponse.json({
      ...(await state()),
      message: made
        ? "Put " + made + " step" + (made === 1 ? "" : "s") + " on " + member.fullName + "'s list" + (member.userId ? "" : " (they have no account yet, so it is unassigned)") + "."
        : member.fullName + " has already been given these."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}

async function state() {
  const [members, steps] = await Promise.all([listDevelopment(), listSteps()]);
  return { members, steps };
}
