import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function SafetyPage() {
  return <ModulePage definition={getModuleDefinition("safety")} />;
}
