import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { findScheduleFolder, missingMonths, monthName, proposeSchedule, writeDraft, type DraftProposal } from "@/lib/schedules/drafts";
import { createItem, updateItem } from "@/lib/work/items";
import { getWorkspaceTree } from "@/lib/work/structure";

// Drafting a monthly meeting schedule into the squadron's own Drive folder.
//
// Two steps on purpose. A GET or a "propose" writes nothing and returns the text for somebody to read;
// only "publish" puts a document in the shared folder, because that folder is watched by the command
// staff and a file appearing in it is a thing the squadron will act on.

const REVIEWERS = ["Steven C Mellard", "Mel W Osborne", "Zachary D Johnson Jr"];

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("propose"),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2024).max(2100)
  }),
  z.object({
    action: z.literal("publish"),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2024).max(2100),
    name: z.string().trim().min(3).max(120),
    text: z.string().trim().min(20).max(60000),
    builtFrom: z.array(z.string().max(120)).max(10).optional(),
    events: z.array(z.string().max(300)).max(100).optional()
  })
]);

/** What is already filed for the year, and what is not. Reads only. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year") ?? new Date().getFullYear());

  const folder = await findScheduleFolder(user.id, year).catch(() => null);
  if (!folder) {
    return NextResponse.json({
      found: false,
      message: "No TN-170 Meeting Schedules folder for " + year + " could be found in the shared drive."
    });
  }

  const missing = missingMonths(folder);
  return NextResponse.json({
    found: true,
    year,
    folderId: folder.id,
    published: folder.existing.filter((file) => !file.isDraft).map((file) => file.name),
    drafts: folder.existing.filter((file) => file.isDraft).map((file) => file.name),
    missing,
    missingNames: missing.map(monthName)
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot write to the drive." }, { status: 403 });
    }

    const input = schema.parse(await request.json());
    const folder = await findScheduleFolder(user.id, input.year);
    if (!folder) return NextResponse.json({ message: "That year's schedule folder could not be found." }, { status: 404 });

    if (input.action === "propose") {
      // Nothing is written. This is the text, for a person to read before it goes anywhere.
      const proposal = await proposeSchedule(user.id, folder, input.month, input.year);
      return NextResponse.json({ proposal });
    }

    // A schedule that already exists is not quietly replaced.
    const clash = folder.existing.find((file) => file.name.trim().toLowerCase() === input.name.trim().toLowerCase());
    if (clash) {
      return NextResponse.json({ message: "There is already a document called " + input.name + " in that folder." }, { status: 409 });
    }

    const proposal: DraftProposal = {
      month: input.month,
      year: input.year,
      name: input.name,
      text: input.text,
      builtFrom: input.builtFrom ?? [],
      events: input.events ?? []
    };
    const file = await writeDraft(user.id, folder, proposal);

    // The people who review it are told by the Hub, in the Hub, with the document attached to the task.
    const label = monthName(input.month) + " " + input.year;
    const tree = await getWorkspaceTree();
    const list = tree.flatMap((space) => space.lists).find((entry) => /monthly training schedules/i.test(entry.name))
      ?? tree.flatMap((space) => space.lists).find((entry) => /command intake/i.test(entry.name));

    let itemId: string | null = null;
    if (list) {
      itemId = await createItem({ listId: list.id, title: "Review the " + label + " schedule draft", userId: user.id });
      const reviewers = await getDatabase()
        .prepare(
          "SELECT id, full_name FROM users WHERE status = 'APPROVED' AND full_name IN (" +
          REVIEWERS.map(() => "?").join(",") + ")"
        )
        .bind(...REVIEWERS)
        .all<{ id: string; full_name: string }>();

      await updateItem(itemId, {
        description:
          "A draft of the " + label + " meeting schedule is in the squadron drive, beside the published months.\n\n" +
          file.webViewLink + "\n\n" +
          (proposal.builtFrom.length ? "It follows the format of " + proposal.builtFrom.join(", ") + ".\n" : "") +
          "Anything marked [TO CONFIRM] needs a decision. Renaming the document to \"" + label + "\" publishes it.",
        dueOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        priority: "NORMAL",
        assigneeIds: reviewers.results.map((row) => row.id)
      });
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "SCHEDULE_DRAFTED",
      entityType: "document",
      entityId: file.id,
      summary: user.fullName + " had the Hub draft the " + label + " schedule into the squadron drive",
      metadata: { month: input.month, year: input.year, fileId: file.id, itemId }
    });

    return NextResponse.json({
      file: { id: file.id, name: file.name, webViewLink: file.webViewLink },
      itemId,
      message: file.name + " is in the folder, and " + (itemId ? "a review task is with " + REVIEWERS.length + " people." : "no list was found to raise a review task in.")
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That draft request was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The draft could not be written." }, { status: 500 });
  }
}
