import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function NotificationsPage() {
  return <ModulePage definition={getModuleDefinition("notifications")} />;
}
