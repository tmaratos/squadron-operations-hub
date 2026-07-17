import { ModulePage } from "@/components/module-page";
import { getModuleDefinition } from "@/lib/module-registry";

export function EmergencyServicesPage() {
  return <ModulePage definition={getModuleDefinition("emergency-services")} />;
}
