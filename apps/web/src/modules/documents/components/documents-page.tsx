import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function DocumentsPage() {
  return <ModulePage definition={getModuleDefinition("documents")} />;
}
