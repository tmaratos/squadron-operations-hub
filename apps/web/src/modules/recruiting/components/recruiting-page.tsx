import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function RecruitingPage() {
  return <ModulePage definition={getModuleDefinition("recruiting")} />;
}
