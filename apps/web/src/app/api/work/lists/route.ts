import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceTree } from "@/lib/work/structure";

// Every list in the squadron, for the times something needs to be moved somewhere else.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const spaces = await getWorkspaceTree();
  const lists = spaces.flatMap((space) => [
    ...space.lists.map((list) => ({ id: list.id, name: list.name, space: space.name })),
    ...space.folders.flatMap((folder) => folder.lists.map((list) => ({ id: list.id, name: list.name, space: space.name + " / " + folder.name })))
  ]);
  return NextResponse.json({ lists });
}
