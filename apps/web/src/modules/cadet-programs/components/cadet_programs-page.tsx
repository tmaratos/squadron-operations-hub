import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function CadetProgramsPage() {
  return <ModulePage definition={getModuleDefinition("cadet-programs")} />;
}
