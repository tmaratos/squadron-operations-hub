import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/operations/workspaces";
import { getWorkspaceTree } from "@/lib/work/structure";
import type { SpaceNode } from "@/lib/work/types";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [workspaces, spaces] = await Promise.all([
    listWorkspaces(),
    getWorkspaceTree().catch((error: unknown): SpaceNode[] => {
      console.error(error);
      return [];
    })
  ]);
  return (
    <AppShell user={user} spaces={spaces} workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, shortName: workspace.shortName }))}>
      {children}
    </AppShell>
  );
}
