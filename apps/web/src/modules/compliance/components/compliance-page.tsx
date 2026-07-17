import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function CompliancePage() {
  return <ModulePage definition={getModuleDefinition("compliance")} />;
}
