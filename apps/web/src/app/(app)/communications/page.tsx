import { CommunicationsPage } from "@/modules/communications";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return <CommunicationsPage />;
}
