import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { listDirectory } from "@/lib/org/directory";
import { emailsByCapid, importRoster, linkEmailToMember, listRoster, parseRoster, parseRosterEmails, saveMemberEmails, suggestMember, unlinkEmail } from "@/lib/org/roster";
import { assertSameOrigin } from "@/lib/security/origin";

// The roster and the "who is this address?" list. Admin only: tying an address to a person decides whose
// name appears on work, so it is a decision somebody accountable makes.

async function state(actorId: string) {
  const [roster, directory, addresses] = await Promise.all([listRoster(), listDirectory(actorId), emailsByCapid()]);
  const known = new Set(roster.map((member) => member.capid));
  const unmatched = directory.people
    .filter((person) => !person.capid || !known.has(person.capid))
    .map((person) => {
      const suggestion = suggestMember(person.email, roster);
      return {
        email: person.email,
        shownAs: person.fullName,
        suggestion: suggestion ? { capid: suggestion.capid, fullName: suggestion.fullName } : null,
        // A CAPID address whose CAPID is missing from the roster is usually a cadet or someone from another unit.
        capidNotOnRoster: person.capid && !known.has(person.capid) ? person.capid : null
      };
    });
  return {
    roster: roster.map((member) => ({
      capid: member.capid,
      fullName: member.fullName,
      memberType: member.memberType,
      hasAccount: Boolean(member.userId),
      // Everywhere the Hub can reach them. The CAP address is implied by the CAPID.
      emails: [member.capid + "@tncap.us", ...(addresses.get(member.capid) ?? []).filter((email) => email !== member.capid + "@tncap.us")]
    })),
    unmatched,
    driveNote: directory.driveNote
  };
}

export async function GET() {
  try {
    const actor = await getCurrentUser();
    if (!actor || !canApproveAccounts(actor.globalRole)) return NextResponse.json({ message: "Administrators only." }, { status: 403 });
    return NextResponse.json(await state(actor.id));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The roster could not be read." }, { status: 500 });
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), text: z.string().min(5).max(200000) }),
  z.object({ action: z.literal("link"), email: z.string().trim().email().max(200), capid: z.string().regex(/^\d{5,7}$/) }),
  z.object({ action: z.literal("unlink"), email: z.string().trim().email().max(200) })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || !canApproveAccounts(actor.globalRole)) return NextResponse.json({ message: "Administrators only." }, { status: 403 });
    const input = schema.parse(await request.json());

    if (input.action === "import") {
      const entries = parseRoster(input.text);
      if (!entries.length) {
        return NextResponse.json({ message: "No members were found in that text. Copy the whole list from eServices, including the CAPID column." }, { status: 400 });
      }
      const result = await importRoster(entries);
      // eServices lists the addresses in the same order as the members; pair them only when the counts agree.
      const pairs = parseRosterEmails(input.text, entries);
      const savedEmails = pairs.length ? await saveMemberEmails(pairs, "ESERVICES", actor.id) : 0;
      await recordAuditEvent({
        actorUserId: actor.id,
        action: "ROSTER_IMPORTED",
        entityType: "roster",
        entityId: "tn-170",
        summary: actor.fullName + " loaded the roster from eServices (" + entries.length + " members)",
        metadata: { ...result, addresses: savedEmails }
      });
      return NextResponse.json({
        ...(await state(actor.id)),
        message: "Loaded " + entries.length + " members: " + result.added + " new, " + result.updated + " updated, " + result.linked + " matched to Hub accounts." +
          (savedEmails ? " Saved " + savedEmails + " email addresses." : " No addresses were in that text, so names only.")
      });
    }

    if (input.action === "link") {
      await linkEmailToMember({ email: input.email, capid: input.capid, linkedBy: actor.id });
      await recordAuditEvent({
        actorUserId: actor.id,
        action: "MEMBER_EMAIL_LINKED",
        entityType: "user",
        entityId: input.email.toLowerCase(),
        summary: actor.fullName + " confirmed " + input.email + " belongs to CAPID " + input.capid,
        metadata: { email: input.email.toLowerCase(), capid: input.capid }
      });
      return NextResponse.json({ ...(await state(actor.id)), message: "Saved. That address now shows the member's name everywhere." });
    }

    await unlinkEmail(input.email);
    await recordAuditEvent({
      actorUserId: actor.id,
      action: "MEMBER_EMAIL_UNLINKED",
      entityType: "user",
      entityId: input.email.toLowerCase(),
      summary: actor.fullName + " removed the member link for " + input.email,
      metadata: {}
    });
    return NextResponse.json({ ...(await state(actor.id)), message: "Link removed." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "That change could not be saved." }, { status: 500 });
  }
}
