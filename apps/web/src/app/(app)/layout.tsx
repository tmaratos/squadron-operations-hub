import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/operations/workspaces";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspaces();
  return (
    <AppShell user={user} workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, shortName: workspace.shortName }))}>
      {children}
    </AppShell>
  );
}
