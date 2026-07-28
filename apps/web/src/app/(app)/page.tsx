import { CommandDashboard } from "@/modules/command";
import { requireUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  return <CommandDashboard user={user} />;
}
