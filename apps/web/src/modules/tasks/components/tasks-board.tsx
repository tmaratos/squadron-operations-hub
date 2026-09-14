"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, LayoutList, LoaderCircle, Plus, Search, Trash2, Trello, X } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import type { FunctionalAreaRecord, OperationalTask, TaskPriority, TaskStatus, TaskTag } from "@/lib/operations/types";
import type { Tone } from "@/lib/types";

// All task data lives in Cloudflare D1 and is read and written through /api/tasks. Nothing is kept in browser storage.

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "AWAITING_APPROVAL", label: "Awaiting Approval" },
  { status: "COMPLETED", label: "Completed" }
];

const statusSequence: TaskStatus[] = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETED"];
const priorities: TaskPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
const priorityRank: Record<TaskPriority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const dueOrder = ["Overdue", "Due today", "Next 7 days", "Next 14 days", "Later", "No due date", "Closed"];

type GroupBy = "status" | "due" | "owner" | "priority" | "area" | "none";
type SortBy = "due" | "priority" | "updated" | "title";
type DueFilter = "ALL" | "OVERDUE" | "NEXT7" | "NEXT14" | "NONE";

interface UserOption {
  id: string;
  fullName: string;
  dutyTitle: string | null;
}

export function TasksBoard({
  initialTasks,
  functionalAreas,
  users,
  availableTags,
  canEdit,
  canDelete
}: {
  availableTags?: TaskTag[];
  initialTasks: OperationalTask[];
  functionalAreas: FunctionalAreaRecord[];
  users: UserOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL" | TaskStatus>("ACTIVE");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TaskPriority>("ALL");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [tagFilter, setTagFilter] = useState("ALL");
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("due");
  const [sortBy, setSortBy] = useState<SortBy>("due");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = today();
    return tasks.filter((task) => {
      if (statusFilter !== "ALL" && task.status === "CANCELLED") return false;
      if (statusFilter === "ACTIVE" && task.status === "COMPLETED") return false;
      if (!["ACTIVE", "ALL"].includes(statusFilter) && task.status !== statusFilter) return false;
      if (ownerFilter === "UNASSIGNED" && task.ownerUserId) return false;
      if (!["ALL", "UNASSIGNED"].includes(ownerFilter) && task.ownerUserId !== ownerFilter) return false;
      if (priorityFilter !== "ALL" && task.priority !== priorityFilter) return false;
      if (areaFilter !== "ALL" && task.functionalAreaKey !== areaFilter) return false;
      if (tagFilter !== "ALL" && !(task.tags ?? []).some((tag) => tag.label === tagFilter)) return false;
      if (dueFilter === "NONE" && task.dueOn) return false;
      if (dueFilter === "OVERDUE" && !(task.dueOn && task.dueOn < now && !isClosed(task))) return false;
      if (dueFilter === "NEXT7" && !(task.dueOn && task.dueOn >= now && task.dueOn <= addDays(now, 7))) return false;
      if (dueFilter === "NEXT14" && !(task.dueOn && task.dueOn >= now && task.dueOn <= addDays(now, 14))) return false;
      return !normalized || [task.title, task.description ?? "", task.functionalAreaName, task.ownerName ?? "Unassigned", task.priority, ...(task.tags ?? []).map((tag) => tag.label)]
        .some((value) => value.toLowerCase().includes(normalized));
    }).sort((a, b) => compareTasks(a, b, sortBy));
  }, [query, statusFilter, ownerFilter, priorityFilter, areaFilter, tagFilter, dueFilter, sortBy, tasks]);

  const tagOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of availableTags ?? []) map.set(tag.label, tag.color);
    for (const task of tasks) for (const tag of task.tags ?? []) map.set(tag.label, tag.color);
    return [...map.entries()].map(([label, color]) => ({ label, color })).sort((a, b) => a.label.localeCompare(b.label));
  }, [availableTags, tasks]);

  const groups = useMemo(() => groupTasks(visibleTasks, groupBy), [visibleTasks, groupBy]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const activeTasks = tasks.filter((task) => !isClosed(task));
  const overdue = activeTasks.filter((task) => task.dueOn && task.dueOn < today()).length;
  const filtersActive = ownerFilter !== "ALL" || priorityFilter !== "ALL" || areaFilter !== "ALL" || tagFilter !== "ALL" || dueFilter !== "ALL" || statusFilter !== "ACTIVE" || query !== "";

  function clearFilters() {
    setQuery("");
    setStatusFilter("ACTIVE");
    setOwnerFilter("ALL");
    setPriorityFilter("ALL");
    setAreaFilter("ALL");
    setTagFilter("ALL");
    setDueFilter("ALL");
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating) return;
    setCreating(true);
    setNotice(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? "") || null,
          priority: String(formData.get("priority") ?? "NORMAL"),
          functionalAreaKey: String(formData.get("functionalAreaKey") ?? "command"),
          ownerUserId: String(formData.get("ownerUserId") ?? "") || null,
          dueOn: String(formData.get("dueOn") ?? "") || null,
          requiresApproval: formData.get("requiresApproval") === "on",
          tags: String(formData.get("tags") ?? "").split(",").map((value) => value.trim()).filter(Boolean)
        })
      });
      const payload = await response.json() as { task?: OperationalTask; message?: string };
      if (!response.ok || !payload.task) throw new Error(payload.message || "The task could not be created.");
      setTasks((current) => [payload.task!, ...current]);
      form.reset();
      setShowForm(false);
      setNotice({ tone: "success", message: payload.message || "Task created." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The task could not be created." });
    } finally {
      setCreating(false);
    }
  }

  async function saveTask(task: OperationalTask, patch: Record<string, unknown>): Promise<boolean> {
    if (!canEdit || busyTaskId) return false;
    setBusyTaskId(task.id);
    setNotice(null);
    try {
      const response = await fetch("/api/tasks/" + task.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = await response.json() as { task?: OperationalTask; message?: string };
      if (!response.ok || !payload.task) throw new Error(payload.message || "The task could not be updated.");
      setTasks((current) => current.map((item) => item.id === task.id ? payload.task! : item));
      setNotice({ tone: "success", message: payload.message || "Task updated." });
      return true;
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The task could not be updated." });
      return false;
    } finally {
      setBusyTaskId(null);
    }
  }

  function updateStatus(task: OperationalTask, status: TaskStatus) {
    return saveTask(task, { status });
  }

  async function removeTask(task: OperationalTask) {
    if (!canDelete || busyTaskId) return;
    if (!window.confirm("Permanently delete “" + task.title + "”? This action will be audited.")) return;
    setBusyTaskId(task.id);
    setNotice(null);
    try {
      const response = await fetch("/api/tasks/" + task.id, { method: "DELETE" });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "The task could not be deleted.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedId(null);
      setNotice({ tone: "success", message: payload.message || "Task deleted." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The task could not be deleted." });
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="page-stack">
      <style>{workCss}</style>
      <PageHeader
        eyebrow="Work"
        title="Tasks and Suspenses"
        description="Every assignment across the squadron in one place. Click any task to open it, reassign it, or change its dates and priority. Changes save to the Hub database and are recorded in History."
        actions={canEdit ? (
          <button className="button button--primary" onClick={() => setShowForm((value) => !value)}>
            <Plus size={16} /> New task
          </button>
        ) : undefined}
      />

      <section className="metric-grid metric-grid--four">
        <button type="button" className="work-metric" onClick={() => { clearFilters(); setDueFilter("OVERDUE"); }}>
          <MetricCard label="Overdue" value={overdue} detail="Past due. Deal with these first" tone={overdue ? "danger" : "success"} />
        </button>
        <button type="button" className="work-metric" onClick={() => { clearFilters(); setDueFilter("NEXT7"); }}>
          <MetricCard label="Due in 7 days" value={activeTasks.filter((task) => task.dueOn && task.dueOn >= today() && task.dueOn <= addDays(today(), 7)).length} detail="Coming up this week" tone="warning" />
        </button>
        <button type="button" className="work-metric" onClick={() => { clearFilters(); setStatusFilter("BLOCKED"); }}>
          <MetricCard label="Blocked" value={tasks.filter((task) => task.status === "BLOCKED").length} detail="Needs intervention" tone="danger" />
        </button>
        <button type="button" className="work-metric" onClick={() => { clearFilters(); setOwnerFilter("UNASSIGNED"); }}>
          <MetricCard label="Unassigned" value={activeTasks.filter((task) => !task.ownerUserId).length} detail="Nobody owns these yet" tone="info" />
        </button>
      </section>

      {notice ? (
        <div className={"inline-notice inline-notice--" + notice.tone} role="status">
          <AlertCircle size={17} />
          <span>{notice.message}</span>
        </div>
      ) : null}

      {showForm && canEdit ? (
        <SectionCard title="Create task" description="Create a durable suspense item that can be reassigned and tracked after staff turnover.">
          <form className="task-form task-form--expanded" onSubmit={addTask}>
            <label className="task-form__title">Title<input name="title" required minLength={3} maxLength={180} placeholder="What needs to be completed?" /></label>
            <label>Functional area<select name="functionalAreaKey" defaultValue="command">{functionalAreas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}</select></label>
            <label>Assignee<select name="ownerUserId" defaultValue=""><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}{user.dutyTitle ? ", " + user.dutyTitle : ""}</option>)}</select></label>
            <label>Priority<select name="priority" defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
            <label>Due date<input name="dueOn" type="date" /></label>
            <label>Tags<input name="tags" list="work-tag-options" placeholder="Comma separated, e.g. commander action, finance" /></label>
            <label className="task-form__description">Description<textarea name="description" maxLength={5000} rows={3} placeholder="Context, expected result, or completion evidence..." /></label>
            <label className="checkbox-field"><input name="requiresApproval" type="checkbox" /> Commander or administrator approval required before completion</label>
            <div>
              <button className="button button--primary" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : null}{creating ? "Creating..." : "Create task"}</button>
              <button className="button button--ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <div className="task-toolbar task-toolbar--workbench">
        <label><Search size={17} /><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search tasks, assignees, or staff sections..." /></label>
        <div className="view-toggle" role="group" aria-label="Task view">
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"}><LayoutList size={16} /> List</button>
          <button type="button" className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-pressed={view === "board"}><Trello size={16} /> Board</button>
        </div>
      </div>

      <div className="work-filters">
        <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ACTIVE" | "ALL" | TaskStatus)}>
          <option value="ACTIVE">Status: active work</option>
          <option value="ALL">Status: everything</option>
          {columns.map((column) => <option key={column.status} value={column.status}>Status: {column.label}</option>)}
          <option value="CANCELLED">Status: Cancelled</option>
        </select>
        <select aria-label="Assignee" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="ALL">Assignee: anyone</option>
          <option value="UNASSIGNED">Assignee: unassigned</option>
          {users.map((user) => <option key={user.id} value={user.id}>Assignee: {user.fullName}</option>)}
        </select>
        <select aria-label="Due" value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)}>
          <option value="ALL">Due: any time</option>
          <option value="OVERDUE">Due: overdue</option>
          <option value="NEXT7">Due: next 7 days</option>
          <option value="NEXT14">Due: next 14 days</option>
          <option value="NONE">Due: no date</option>
        </select>
        <select aria-label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "ALL" | TaskPriority)}>
          <option value="ALL">Priority: any</option>
          {priorities.map((priority) => <option key={priority} value={priority}>Priority: {formatPriority(priority)}</option>)}
        </select>
        <select aria-label="Staff section" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
          <option value="ALL">Section: all</option>
          {functionalAreas.map((area) => <option key={area.key} value={area.key}>Section: {area.name}</option>)}
        </select>
        <select aria-label="Tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="ALL">Tag: any</option>
          {tagOptions.map((tag) => <option key={tag.label} value={tag.label}>Tag: {tag.label}</option>)}
        </select>
        <span className="work-filters__divider" />
        {view === "list" ? (
          <select aria-label="Group by" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
            <option value="due">Group: due date</option>
            <option value="status">Group: status</option>
            <option value="owner">Group: assignee</option>
            <option value="priority">Group: priority</option>
            <option value="area">Group: section</option>
            <option value="none">Group: none</option>
          </select>
        ) : null}
        <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
          <option value="due">Sort: due soonest</option>
          <option value="priority">Sort: priority</option>
          <option value="updated">Sort: recently updated</option>
          <option value="title">Sort: title</option>
        </select>
        <span className="work-filters__count">{visibleTasks.length} shown</span>
        {filtersActive ? <button type="button" className="work-clear" onClick={clearFilters}>Clear filters</button> : null}
      </div>

      {tasks.length === 0 ? (
        <SectionCard title="No tasks yet" description="Create the first operational task to begin building the squadron's shared suspense tracker.">
          <div className="empty-state"><strong>The task board is ready.</strong><span>Use New task to add the first assignment.</span></div>
        </SectionCard>
      ) : view === "board" ? (
        <section className="kanban-board kanban-board--five">
          {columns.map((column) => {
            const columnTasks = visibleTasks.filter((task) => task.status === column.status);
            return (
              <div className="kanban-column" key={column.status}>
                <header><strong>{column.label}</strong><span>{columnTasks.length}</span></header>
                <div>
                  {columnTasks.map((task) => (
                    <article className={"task-card task-card--" + task.priority.toLowerCase() + " work-card"} key={task.id} onClick={() => setSelectedId(task.id)}>
                      <div className="task-card__top"><span>{task.functionalAreaName}</span><PriorityChip priority={task.priority} /></div>
                      <h3>{task.title}</h3>
                      <div className="work-chips"><DueChip task={task} /><TagChips tags={task.tags} /></div>
                      <dl>
                        <div><dt>Assignee</dt><dd>{task.ownerName || "Unassigned"}</dd></div>
                      </dl>
                      <div className="task-card__actions" onClick={(event) => event.stopPropagation()}>
                        {canEdit && task.status !== "COMPLETED" ? (
                          <button disabled={busyTaskId === task.id} onClick={() => updateStatus(task, nextStatus(task))}>
                            {busyTaskId === task.id ? "Saving..." : task.status === "BLOCKED" ? "Return to work" : "Move to " + formatStatus(nextStatus(task))}
                          </button>
                        ) : null}
                        {canEdit && task.status !== "BLOCKED" && !isClosed(task) ? <button className="task-card__secondary" disabled={busyTaskId === task.id} onClick={() => updateStatus(task, "BLOCKED")}>Block</button> : null}
                      </div>
                    </article>
                  ))}
                  {columnTasks.length === 0 ? <div className="kanban-empty">No matching tasks</div> : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <SectionCard title="Work queue" description="Click a task to open it. Use the filters above to narrow the list, and group it the way you think about the work.">
          <div className="work-list" role="table" aria-label="Task work queue">
            <div className="work-row work-row--head" role="row"><span>Task</span><span>Status</span><span className="work-hide-sm">Assignee</span><span>Due</span><span className="work-hide-sm">Priority</span></div>
            {groups.map((group) => (
              <div className="work-group" key={group.label}>
                {groupBy !== "none" ? <div className="work-group__head">{group.label}<b>{group.tasks.length}</b></div> : null}
                {group.tasks.map((task) => (
                  <div key={task.id} role="row" tabIndex={0} className={"work-row work-row--" + task.priority.toLowerCase() + (selectedId === task.id ? " is-selected" : "")} onClick={() => setSelectedId(task.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(task.id); }}>
                    <div className="work-row__title"><strong>{task.title}</strong><small>{task.functionalAreaName}{task.requiresApproval ? " · needs approval" : ""}</small>{task.tags?.length ? <div className="work-chips work-row__tags"><TagChips tags={task.tags} /></div> : null}</div>
                    <span><StatusPill label={formatStatus(task.status)} tone={toneForStatus(task.status)} /></span>
                    <span className={"work-hide-sm" + (task.ownerName ? "" : " work-muted")}>{task.ownerName || "Unassigned"}</span>
                    <span><DueChip task={task} /></span>
                    <span className="work-hide-sm"><PriorityChip priority={task.priority} /></span>
                  </div>
                ))}
              </div>
            ))}
            {!visibleTasks.length ? <div className="empty-state"><strong>No tasks match this view.</strong><span>Clear the filters or create a new task.</span></div> : null}
          </div>
        </SectionCard>
      )}

      {selected ? (
        <TaskDrawer
          key={selected.id + selected.updatedAt}
          task={selected}
          users={users}
          functionalAreas={functionalAreas}
          tagOptions={tagOptions}
          canEdit={canEdit}
          canDelete={canDelete}
          busy={busyTaskId === selected.id}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => saveTask(selected, patch)}
          onDelete={() => removeTask(selected)}
        />
      ) : null}
      <datalist id="work-tag-options">{tagOptions.map((tag) => <option key={tag.label} value={tag.label} />)}</datalist>
    </div>
  );
}

function TaskDrawer({
  task,
  users,
  functionalAreas,
  tagOptions,
  canEdit,
  canDelete,
  busy,
  onClose,
  onSave,
  onDelete
}: {
  task: OperationalTask;
  users: UserOption[];
  functionalAreas: FunctionalAreaRecord[];
  tagOptions: Array<{ label: string; color: string }>;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    functionalAreaKey: task.functionalAreaKey,
    ownerUserId: task.ownerUserId ?? "",
    dueOn: task.dueOn ?? "",
    requiresApproval: task.requiresApproval,
    tags: (task.tags ?? []).map((tag) => tag.label)
  });
  const [tagInput, setTagInput] = useState("");

  function addTag(raw: string) {
    const label = normalizeTag(raw);
    if (!label || label.length > 40) return;
    setDraft((current) => current.tags.includes(label) ? current : { ...current, tags: [...current.tags, label] });
    setTagInput("");
  }
  const ownerMissing = Boolean(task.ownerUserId) && !users.some((user) => user.id === task.ownerUserId);

  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      title: draft.title,
      description: draft.description.trim() || null,
      status: draft.status,
      priority: draft.priority,
      functionalAreaKey: draft.functionalAreaKey,
      ownerUserId: draft.ownerUserId || null,
      dueOn: draft.dueOn || null,
      requiresApproval: draft.requiresApproval,
      tags: [...new Set([...draft.tags, normalizeTag(tagInput)].filter(Boolean))]
    });
  }

  return (
    <>
      <div className="work-drawer-backdrop" onClick={onClose} />
      <aside className="work-drawer" role="dialog" aria-label={"Task: " + task.title}>
        <div className="work-drawer__top">
          <div className="work-chips"><StatusPill label={formatStatus(task.status)} tone={toneForStatus(task.status)} /><PriorityChip priority={task.priority} /><DueChip task={task} /></div>
          <button type="button" className="work-drawer__close" onClick={onClose} aria-label="Close task"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="work-drawer__form">
          <label>Title<input value={draft.title} onChange={(event) => set("title", event.target.value)} required minLength={3} maxLength={180} disabled={!canEdit} /></label>
          <div className="work-drawer__grid">
            <label>Status<select value={draft.status} onChange={(event) => set("status", event.target.value as TaskStatus)} disabled={!canEdit}>
              {columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
              <option value="CANCELLED">Cancelled</option>
            </select></label>
            <label>Assignee<select value={draft.ownerUserId} onChange={(event) => set("ownerUserId", event.target.value)} disabled={!canEdit}>
              <option value="">Unassigned</option>
              {ownerMissing ? <option value={task.ownerUserId!}>{task.ownerName || "Former member"}</option> : null}
              {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
            </select></label>
            <label>Due date<input type="date" value={draft.dueOn} onChange={(event) => set("dueOn", event.target.value)} disabled={!canEdit} /></label>
            <label>Priority<select value={draft.priority} onChange={(event) => set("priority", event.target.value as TaskPriority)} disabled={!canEdit}>
              {priorities.map((priority) => <option key={priority} value={priority}>{formatPriority(priority)}</option>)}
            </select></label>
            <label className="work-drawer__wide">Staff section<select value={draft.functionalAreaKey} onChange={(event) => set("functionalAreaKey", event.target.value)} disabled={!canEdit}>
              {functionalAreas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}
            </select></label>
          </div>
          <div className="work-tag-editor">
            <span className="work-tag-editor__label">Tags</span>
            <div className="work-chips">
              {draft.tags.map((label) => (
                <span key={label} className={"work-tag work-tag--" + (tagOptions.find((tag) => tag.label === label)?.color ?? "slate")}>
                  {label}
                  {canEdit ? <button type="button" aria-label={"Remove tag " + label} onClick={() => set("tags", draft.tags.filter((item) => item !== label))}>×</button> : null}
                </span>
              ))}
              {!draft.tags.length ? <span className="work-muted">No tags yet</span> : null}
            </div>
            {canEdit ? <input list="work-tag-options" value={tagInput} placeholder="Type a tag and press Enter" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(tagInput); } }} /> : null}
          </div>
          <label>Description<textarea rows={8} maxLength={5000} value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Context, expected result, or completion evidence..." disabled={!canEdit} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={draft.requiresApproval} onChange={(event) => set("requiresApproval", event.target.checked)} disabled={!canEdit} /> Approval required before completion</label>
          <div className="work-drawer__foot">
            {canEdit ? <button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{busy ? "Saving..." : "Save changes"}</button> : null}
            <button className="button button--ghost" type="button" onClick={onClose}>Close</button>
            {canDelete ? <button className="button button--ghost work-drawer__delete" type="button" disabled={busy} onClick={onDelete}><Trash2 size={14} /> Delete</button> : null}
          </div>
        </form>
        <div className="work-drawer__meta">
          <span>Created by {task.createdByName} on {formatDateTime(task.createdAt)}</span>
          <span>Last updated {formatDateTime(task.updatedAt)}</span>
          {task.completedAt ? <span>Completed {formatDateTime(task.completedAt)}</span> : null}
          {task.sourceReference ? <span>Source: {task.sourceReference}</span> : null}
        </div>
      </aside>
    </>
  );
}

function TagChips({ tags }: { tags?: TaskTag[] }) {
  if (!tags?.length) return null;
  return <>{tags.map((tag) => <span key={tag.id} className={"work-tag work-tag--" + tag.color}>{tag.label}</span>)}</>;
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  return <span className={"work-chip work-chip--" + priority.toLowerCase()}>{formatPriority(priority)}</span>;
}

function DueChip({ task }: { task: OperationalTask }) {
  if (!task.dueOn) return <span className="work-chip work-chip--none">No date</span>;
  const now = today();
  const late = task.dueOn < now && !isClosed(task);
  const soon = !late && !isClosed(task) && task.dueOn <= addDays(now, 7);
  return <span className={"work-chip " + (late ? "work-chip--overdue" : soon ? "work-chip--soon" : "work-chip--date")}>{late ? "Overdue · " : task.dueOn === now ? "Today · " : ""}{formatDate(task.dueOn)}</span>;
}

function groupTasks(tasks: OperationalTask[], groupBy: GroupBy): Array<{ label: string; tasks: OperationalTask[] }> {
  if (groupBy === "none") return [{ label: "All", tasks }];
  const map = new Map<string, OperationalTask[]>();
  for (const task of tasks) {
    const label = groupLabel(task, groupBy);
    map.set(label, [...(map.get(label) ?? []), task]);
  }
  const order = (label: string): string => {
    if (groupBy === "due") return String(dueOrder.indexOf(label)).padStart(2, "0");
    if (groupBy === "status") return String(Math.max(0, columns.findIndex((column) => column.label === label))).padStart(2, "0") + label;
    if (groupBy === "priority") return String(priorities.map(formatPriority).indexOf(label)).padStart(2, "0");
    return (label === "Unassigned" ? "~" : "") + label.toLowerCase();
  };
  return [...map.entries()].map(([label, items]) => ({ label, tasks: items })).sort((a, b) => order(a.label).localeCompare(order(b.label)));
}

function groupLabel(task: OperationalTask, groupBy: GroupBy): string {
  if (groupBy === "status") return formatStatus(task.status);
  if (groupBy === "owner") return task.ownerName || "Unassigned";
  if (groupBy === "priority") return formatPriority(task.priority);
  if (groupBy === "area") return task.functionalAreaName;
  if (isClosed(task)) return "Closed";
  if (!task.dueOn) return "No due date";
  const now = today();
  if (task.dueOn < now) return "Overdue";
  if (task.dueOn === now) return "Due today";
  if (task.dueOn <= addDays(now, 7)) return "Next 7 days";
  if (task.dueOn <= addDays(now, 14)) return "Next 14 days";
  return "Later";
}

function compareTasks(a: OperationalTask, b: OperationalTask, sortBy: SortBy): number {
  if (sortBy === "priority") return priorityRank[a.priority] - priorityRank[b.priority] || compareDue(a, b);
  if (sortBy === "updated") return b.updatedAt.localeCompare(a.updatedAt);
  if (sortBy === "title") return a.title.localeCompare(b.title);
  return compareDue(a, b) || priorityRank[a.priority] - priorityRank[b.priority];
}

function compareDue(a: OperationalTask, b: OperationalTask): number {
  if (a.dueOn === b.dueOn) return 0;
  if (!a.dueOn) return 1;
  if (!b.dueOn) return -1;
  return a.dueOn.localeCompare(b.dueOn);
}

function isClosed(task: OperationalTask): boolean {
  return task.status === "COMPLETED" || task.status === "CANCELLED";
}

function nextStatus(task: OperationalTask): TaskStatus {
  if (task.status === "BLOCKED") return "IN_PROGRESS";
  const currentIndex = statusSequence.indexOf(task.status);
  if (currentIndex < 0 || currentIndex >= statusSequence.length - 1) return "COMPLETED";
  if (task.status === "IN_PROGRESS" && !task.requiresApproval) return "COMPLETED";
  return statusSequence[currentIndex + 1];
}

function toneForStatus(status: TaskStatus): Tone {
  if (status === "COMPLETED") return "success";
  if (status === "BLOCKED" || status === "CANCELLED") return "danger";
  if (status === "AWAITING_APPROVAL") return "warning";
  if (status === "IN_PROGRESS") return "info";
  return "neutral";
}

function formatStatus(status: TaskStatus): string {
  return status.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function formatPriority(priority: TaskPriority): string {
  return priority[0] + priority.slice(1).toLowerCase();
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function addDays(date: string, days: number): string {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const workCss = [
  ".work-metric{all:unset;display:block;cursor:pointer;border-radius:12px}",
  ".work-metric:focus-visible{outline:2px solid #6f9bff;outline-offset:2px}",
  ".work-metric>*{height:100%}",
  ".work-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
  ".work-filters select{min-height:34px;padding:0 10px;border:1px solid var(--border-soft);border-radius:9px;background:var(--surface);color:inherit;font-size:12px}",
  ".work-filters__divider{width:1px;height:22px;background:var(--border-soft)}",
  ".work-filters__count{color:var(--muted);font-size:12px}",
  ".work-clear{min-height:34px;padding:0 12px;border:1px solid var(--border-soft);border-radius:9px;background:transparent;color:inherit;font-size:12px;cursor:pointer}",
  ".work-list{display:grid}",
  ".work-group__head{display:flex;align-items:center;gap:8px;padding:14px 10px 6px;color:var(--text-soft);font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}",
  ".work-group__head b{padding:1px 8px;border-radius:99px;background:var(--surface-alt);font-size:11px}",
  ".work-row{display:grid;grid-template-columns:minmax(0,2.6fr) 150px 160px 160px 90px;align-items:center;gap:10px;padding:9px 10px;border-bottom:1px solid var(--border-soft);border-left:3px solid transparent;cursor:pointer}",
  ".work-row:hover,.work-row.is-selected{background:rgba(111,155,255,.07)}",
  ".work-row--critical{border-left-color:var(--danger)}.work-row--high{border-left-color:var(--warning)}",
  ".work-row--head{cursor:default;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.work-row--head:hover{background:transparent}",
  ".work-row__title{min-width:0;display:grid;gap:2px}.work-row__title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.work-row__title small{color:var(--muted);font-size:11px}",
  ".work-muted{color:var(--muted)}",
  ".work-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
  ".work-chip{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border:1px solid var(--border-soft);border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap}",
  ".work-chip--critical{background:rgba(242,87,87,.16);border-color:rgba(242,87,87,.45);color:#ff8f8f}",
  ".work-chip--high{background:rgba(245,176,65,.14);border-color:rgba(245,176,65,.4);color:#f5c26b}",
  ".work-chip--normal{color:var(--text-soft)}.work-chip--low,.work-chip--none{color:var(--muted)}",
  ".work-chip--overdue{background:rgba(242,87,87,.16);border-color:rgba(242,87,87,.45);color:#ff8f8f}",
  ".work-chip--soon{background:rgba(245,176,65,.12);color:#f5c26b}",
  ".work-card{cursor:pointer}",
  ".work-tag{display:inline-flex;align-items:center;gap:4px;min-height:20px;padding:0 7px;border-radius:5px;background:rgba(148,163,184,.16);color:#cbd5e1;font-size:11px;font-weight:600;white-space:nowrap}",
  ".work-tag button{all:unset;cursor:pointer;padding-left:2px;opacity:.75}.work-tag button:hover{opacity:1}",
  ".work-tag--blue{background:rgba(96,165,250,.18);color:#93c5fd}.work-tag--green{background:rgba(74,222,128,.16);color:#86efac}.work-tag--amber{background:rgba(251,191,36,.16);color:#fcd34d}.work-tag--red{background:rgba(248,113,113,.18);color:#fca5a5}.work-tag--purple{background:rgba(192,132,252,.18);color:#d8b4fe}.work-tag--teal{background:rgba(45,212,191,.16);color:#5eead4}.work-tag--pink{background:rgba(244,114,182,.16);color:#f9a8d4}",
  ".work-row__tags{margin-top:4px}.work-tag-editor{display:grid;gap:7px}.work-tag-editor__label{color:var(--text-soft);font-size:12px}",
  ".work-drawer-backdrop{position:fixed;inset:0;z-index:80;background:rgba(3,8,16,.55)}",
  ".work-drawer{position:fixed;top:0;right:0;bottom:0;z-index:81;width:min(540px,100vw);overflow-y:auto;display:grid;align-content:start;gap:14px;padding:18px 20px;background:var(--surface,#0d1a2c);border-left:1px solid var(--border-soft);box-shadow:-24px 0 48px rgba(0,0,0,.35)}",
  ".work-drawer__top{display:flex;align-items:center;justify-content:space-between;gap:10px}",
  ".work-drawer__close{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--border-soft);border-radius:9px;background:transparent;color:inherit;cursor:pointer}",
  ".work-drawer__form{display:grid;gap:12px}",
  ".work-drawer__form label{display:grid;gap:5px;color:var(--text-soft);font-size:12px}",
  ".work-drawer__form label.checkbox-field{display:flex;align-items:center;gap:8px}",
  ".work-drawer__form input:not([type=checkbox]),.work-drawer__form select,.work-drawer__form textarea{width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;background:rgba(255,255,255,.03);color:inherit;font:inherit}",
  ".work-drawer__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.work-drawer__wide{grid-column:1/-1}",
  ".work-drawer__foot{display:flex;flex-wrap:wrap;gap:8px}.work-drawer__delete{margin-left:auto;color:#ff8f8f}",
  ".work-drawer__meta{display:grid;gap:4px;padding-top:12px;border-top:1px solid var(--border-soft);color:var(--muted);font-size:11px}",
  "@media(max-width:900px){.work-row{grid-template-columns:minmax(0,1fr) auto auto}.work-hide-sm{display:none}.work-row--head{display:none}.work-drawer__grid{grid-template-columns:1fr}}"
].join("\n");
