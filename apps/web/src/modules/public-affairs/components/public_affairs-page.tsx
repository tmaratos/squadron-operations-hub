import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function PublicAffairsPage() {
  return <ModulePage definition={getModuleDefinition("public-affairs")} />;
}
