import { CommunicationsPage } from "@/modules/communications";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  const user = await requireUser();
  return <CommunicationsPage user={user} />;
}
