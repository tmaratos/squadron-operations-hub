import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function FinancePage() {
  return <ModulePage definition={getModuleDefinition("finance")} />;
}
