import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { downloadDriveFile } from "@/lib/drive/google-drive";

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  try {
    const { fileId } = await context.params;
    return downloadDriveFile(fileId);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The file could not be downloaded." }, { status: 500 });
  }
}
