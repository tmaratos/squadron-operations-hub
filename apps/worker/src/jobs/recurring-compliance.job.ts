export interface RecurringRequirement {
  id: string;
  name: string;
  nextDueAt: Date;
  leadTimeDays: number;
  active: boolean;
}

export interface GeneratedTask {
  requirementId: string;
  title: string;
  dueAt: Date;
  sourceType: "COMPLIANCE";
}

export function generateComplianceTasks(
  requirements: RecurringRequirement[],
  now = new Date()
): GeneratedTask[] {
  return requirements
    .filter((requirement) => requirement.active)
    .filter((requirement) => {
      const leadTime = requirement.leadTimeDays * 24 * 60 * 60 * 1000;
      return requirement.nextDueAt.getTime() - now.getTime() <= leadTime;
    })
    .map((requirement) => ({
      requirementId: requirement.id,
      title: requirement.name,
      dueAt: requirement.nextDueAt,
      sourceType: "COMPLIANCE" as const
    }));
}

export async function runRecurringComplianceJob() {
  // Database repositories will replace this empty collection when persistence is connected.
  const generatedTasks = generateComplianceTasks([]);
  console.log(`Recurring compliance job completed. Generated ${generatedTasks.length} tasks.`);
}
