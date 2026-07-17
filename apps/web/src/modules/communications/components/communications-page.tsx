import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function CommunicationsPage() {
  return <ModulePage definition={getModuleDefinition("communications")} />;
}
