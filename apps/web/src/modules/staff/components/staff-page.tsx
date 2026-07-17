import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function StaffPage() {
  return <ModulePage definition={getModuleDefinition("staff")} />;
}
