import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { createDriveFolder, isGoogleDriveConfigured, listDriveFiles, uploadDriveFile } from "@/lib/drive/google-drive";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!isGoogleDriveConfigured()) return NextResponse.json({ configured: false, files: [] });

  try {
    const url = new URL(request.url);
    const result = await listDriveFiles({
      parentId: url.searchParams.get("parentId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      pageToken: url.searchParams.get("pageToken") ?? undefined
    });
    return NextResponse.json({ configured: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Google Drive could not be loaded." }, { status: 502 });
  }
}

const folderSchema = z.object({
  kind: z.literal("folder"),
  name: z.string().trim().min(1).max(180),
  parentId: z.string().trim().optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "You are not authorized to modify documents." }, { status: 403 });
    }
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ message: "Google Drive is not configured." }, { status: 503 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const input = folderSchema.parse(await request.json());
      const folder = await createDriveFolder(input.name, input.parentId);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "DRIVE_FOLDER_CREATED",
        entityType: "drive_file",
        entityId: folder.id,
        summary: `${user.fullName} created Drive folder ${folder.name}`
      });
      return NextResponse.json(folder, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const parentId = String(form.get("parentId") ?? "").trim() || undefined;
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Choose a file to upload." }, { status: 400 });
    }
    const maxMb = Number(getCloudflareEnv().GOOGLE_DRIVE_MAX_UPLOAD_MB ?? 10);
    if (file.size > maxMb * 1024 * 1024) {
      return NextResponse.json({ message: `Uploads are limited to ${maxMb} MB.` }, { status: 413 });
    }

    const uploaded = await uploadDriveFile({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: await file.arrayBuffer(),
      parentId
    });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DRIVE_FILE_UPLOADED",
      entityType: "drive_file",
      entityId: uploaded.id,
      summary: `${user.fullName} uploaded ${uploaded.name}`,
      metadata: { size: file.size, mimeType: file.type }
    });
    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "The folder name is invalid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "The Drive operation could not be completed." }, { status: 500 });
  }
}
