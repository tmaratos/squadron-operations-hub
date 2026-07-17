import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function ReportsPage() {
  return <ModulePage definition={getModuleDefinition("reports")} />;
}
