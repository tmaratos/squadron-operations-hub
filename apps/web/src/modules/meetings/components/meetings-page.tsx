import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function MeetingsPage() {
  return <ModulePage definition={getModuleDefinition("meetings")} />;
}
