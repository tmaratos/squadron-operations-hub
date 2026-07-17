import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function AuditPage() {
  return <ModulePage definition={getModuleDefinition("audit")} />;
}
