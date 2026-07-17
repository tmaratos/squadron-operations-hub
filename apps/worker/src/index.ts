import { runRecurringComplianceJob } from "./jobs/recurring-compliance.job";
import { runDiscordSyncJob } from "./jobs/discord-sync.job";

async function main() {
  console.log("Squadron worker started");

  await runRecurringComplianceJob();
  await runDiscordSyncJob();
}

main().catch((error) => {
  console.error("Worker failed", error);
  process.exit(1);
});
