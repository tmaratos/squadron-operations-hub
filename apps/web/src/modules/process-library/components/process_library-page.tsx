import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function ProcessLibraryPage() {
  return <ModulePage definition={getModuleDefinition("processes")} />;
}
