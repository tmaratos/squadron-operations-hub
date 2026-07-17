import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function AerospaceEducationPage() {
  return <ModulePage definition={getModuleDefinition("aerospace")} />;
}
