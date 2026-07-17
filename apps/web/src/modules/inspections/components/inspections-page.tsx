import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function InspectionsPage() {
  return <ModulePage definition={getModuleDefinition("inspections")} />;
}
