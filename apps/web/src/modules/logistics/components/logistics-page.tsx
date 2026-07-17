import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function LogisticsPage() {
  return <ModulePage definition={getModuleDefinition("logistics")} />;
}
