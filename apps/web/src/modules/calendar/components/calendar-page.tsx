import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function CalendarPage() {
  return <ModulePage definition={getModuleDefinition("calendar")} />;
}
