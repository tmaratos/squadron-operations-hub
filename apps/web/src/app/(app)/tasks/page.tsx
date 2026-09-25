import { MyTasks } from "@/components/work/my-tasks";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { loadDashboardItems } from "@/lib/work/dashboards";

export const dynamic = "force-dynamic";

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

/**
 * The dashboard's numbers arrive here as a filter.
 *
 * Every card and every bar on the dashboard links in with the same filters it counted, so pressing "5
 * overdue" lands on those five rather than on everything.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (key: string) => { const value = params[key]; return Array.isArray(value) ? value[0] : value; };

  const items = await loadDashboardItems();
  const today = isoDay(0);

  const due = one("due");
  const date = one("date");
  const tag = one("tag");
  const status = one("status");
  const priority = one("priority");
  const owner = one("owner");

  const described: string[] = [];
  let shown = items;

  if (date) {
    shown = shown.filter((item) => item.dueOn === date);
    // "due Wed 30 Sep" rather than "due 2026-09-30": this heading is read, not parsed.
    const when = new Date(date + "T12:00:00");
    described.push("due " + (Number.isNaN(when.getTime())
      ? date
      : when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })));
  }
  if (due === "overdue") { shown = shown.filter((item) => item.dueOn && item.dueOn < today && !item.closed); described.push("overdue"); }
  if (due === "today") { shown = shown.filter((item) => item.dueOn === today); described.push("due today"); }
  if (due === "next7") { shown = shown.filter((item) => item.dueOn && item.dueOn >= today && item.dueOn <= isoDay(7)); described.push("due in the next 7 days"); }
  if (due === "next14") { shown = shown.filter((item) => item.dueOn && item.dueOn >= today && item.dueOn <= isoDay(14)); described.push("due in the next 14 days"); }
  if (due === "none") { shown = shown.filter((item) => !item.dueOn); described.push("with no due date"); }
  if (tag) { shown = shown.filter((item) => item.tags.includes(tag)); described.push("tagged " + tag); }
  if (status) { shown = shown.filter((item) => item.statusName === status); described.push(status); }
  if (priority) { shown = shown.filter((item) => item.priority === priority); described.push(priority.toLowerCase() + " priority"); }
  if (owner === "none") { shown = shown.filter((item) => !item.assigneeIds.length && item.dueOn); described.push("with no owner"); }

  const filtered = described.length > 0;
  const mine = items.filter((item) => !item.closed && item.assigneeIds.includes(user.id)).length;

  // "All tasks" and "My tasks" are different questions. Arriving from All tasks shows the squadron's work
  // and says so, rather than quietly answering the narrower question under the wider title.
  const everybody = one("scope") === "all";
  const openCount = shown.filter((item) => !item.closed).length;

  const title = filtered
    ? "Tasks " + described.join(", ")
    : everybody ? "All tasks" : "My tasks";

  const description = filtered
    ? openCount + " open, everybody's, not only yours."
    : everybody
      ? openCount + " open across the squadron, in every list."
      : mine ? mine + " open and assigned to you, soonest first." : "Nothing is assigned to you at the moment.";

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Work" title={title} description={description} />
      <MyTasks
        items={shown}
        userId={user.id}
        filterLabel={filtered ? described.join(", ") : undefined}
        showEveryone={everybody}
      />
    </div>
  );
}
