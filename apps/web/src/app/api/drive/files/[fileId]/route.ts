import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { trashDriveFile, updateDriveFile } from "@/lib/drive/google-drive";
import { assertSameOrigin } from "@/lib/security/origin";

const schema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  addParentId: z.string().trim().optional(),
  removeParentId: z.string().trim().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Not authorized." }, { status: 403 });
    const { fileId } = await context.params;
    const input = schema.parse(await request.json());
    const updated = await updateDriveFile({ fileId, ...input });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DRIVE_FILE_UPDATED",
      entityType: "drive_file",
      entityId: fileId,
      summary: `${user.fullName} updated ${updated.name}`,
      metadata: input
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The file could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Not authorized." }, { status: 403 });
    const { fileId } = await context.params;
    await trashDriveFile(fileId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DRIVE_FILE_TRASHED",
      entityType: "drive_file",
      entityId: fileId,
      summary: `${user.fullName} moved a Drive item to trash`
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The file could not be moved to trash." }, { status: 500 });
  }
}
