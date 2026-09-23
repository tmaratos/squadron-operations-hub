import { MyTasks } from "@/components/work/my-tasks";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { loadDashboardItems } from "@/lib/work/dashboards";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const items = await loadDashboardItems();
  const mine = items.filter((item) => !item.closed && item.assigneeIds.includes(user.id)).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Work"
        title="My tasks"
        description={mine ? mine + " open and assigned to you, soonest first." : "Nothing is assigned to you at the moment."}
      />
      <MyTasks items={items} userId={user.id} />
    </div>
  );
}
