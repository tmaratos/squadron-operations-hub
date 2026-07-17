"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, Filter, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import type { FunctionalAreaRecord, OperationalTask, TaskPriority, TaskStatus } from "@/lib/operations/types";
import type { Tone } from "@/lib/types";

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "AWAITING_APPROVAL", label: "Awaiting Approval" },
  { status: "COMPLETED", label: "Completed" }
];

const statusSequence: TaskStatus[] = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETED"];

interface UserOption {
  id: string;
  fullName: string;
  dutyTitle: string | null;
}

export function TasksBoard({
  initialTasks,
  functionalAreas,
  users,
  canEdit,
  canDelete
}: {
  initialTasks: OperationalTask[];
  functionalAreas: FunctionalAreaRecord[];
  users: UserOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks.filter((task) => task.status !== "CANCELLED");
    return tasks.filter((task) => {
      if (task.status === "CANCELLED") return false;
      return [task.title, task.description ?? "", task.functionalAreaName, task.ownerName ?? "Unassigned", task.priority]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, tasks]);

  const activeTasks = tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status));
  const overdue = activeTasks.filter((task) => task.dueOn && task.dueOn < today()).length;

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
          requiresApproval: formData.get("requiresApproval") === "on"
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

  async function updateStatus(task: OperationalTask, status: TaskStatus) {
    if (!canEdit || busyTaskId) return;
    setBusyTaskId(task.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = await response.json() as { task?: OperationalTask; message?: string };
      if (!response.ok || !payload.task) throw new Error(payload.message || "The task could not be updated.");
      setTasks((current) => current.map((item) => item.id === task.id ? payload.task! : item));
      setNotice({ tone: "success", message: payload.message || "Task updated." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The task could not be updated." });
    } finally {
      setBusyTaskId(null);
    }
  }

  async function removeTask(task: OperationalTask) {
    if (!canDelete || busyTaskId) return;
    if (!window.confirm(`Permanently delete “${task.title}”? This action will be audited.`)) return;
    setBusyTaskId(task.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "The task could not be deleted.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice({ tone: "success", message: payload.message || "Task deleted." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The task could not be deleted." });
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Command workflow"
        title="Tasks and Suspenses"
        description="Assign, prioritize, escalate, and complete work across every squadron staff section. Changes are saved to Cloudflare D1 and recorded in the audit log."
        actions={canEdit ? (
          <button className="button button--primary" onClick={() => setShowForm((value) => !value)}>
            <Plus size={16} /> New task
          </button>
        ) : undefined}
      />

      <section className="metric-grid metric-grid--four">
        <MetricCard label="Active" value={activeTasks.length} detail="Not completed or cancelled" tone="info" />
        <MetricCard label="Overdue" value={overdue} detail="Past the assigned due date" tone={overdue ? "danger" : "success"} />
        <MetricCard label="Blocked" value={tasks.filter((task) => task.status === "BLOCKED").length} detail="Needs intervention" tone="danger" />
        <MetricCard label="Awaiting Approval" value={tasks.filter((task) => task.status === "AWAITING_APPROVAL").length} detail="Ready for review" tone="warning" />
      </section>

      {notice ? (
        <div className={`inline-notice inline-notice--${notice.tone}`} role="status">
          <AlertCircle size={17} />
          <span>{notice.message}</span>
        </div>
      ) : null}

      {showForm && canEdit ? (
        <SectionCard title="Create task" description="Create a durable suspense item that can be reassigned and tracked after staff turnover.">
          <form className="task-form task-form--expanded" onSubmit={addTask}>
            <label className="task-form__title">Title<input name="title" required minLength={3} maxLength={180} placeholder="What needs to be completed?" /></label>
            <label>Functional area<select name="functionalAreaKey" defaultValue="command">{functionalAreas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}</select></label>
            <label>Owner<select name="ownerUserId" defaultValue=""><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}{user.dutyTitle ? `, ${user.dutyTitle}` : ""}</option>)}</select></label>
            <label>Priority<select name="priority" defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
            <label>Due date<input name="dueOn" type="date" /></label>
            <label className="task-form__description">Description<textarea name="description" maxLength={5000} rows={3} placeholder="Context, expected result, or completion evidence..." /></label>
            <label className="checkbox-field"><input name="requiresApproval" type="checkbox" /> Commander or administrator approval required before completion</label>
            <div>
              <button className="button button--primary" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : null}{creating ? "Creating..." : "Create task"}</button>
              <button className="button button--ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <div className="task-toolbar">
        <label><Search size={17} /><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search tasks, owners, or staff sections..." /></label>
        <button className="button button--secondary" type="button"><Filter size={16} /> Filters</button>
      </div>

      {tasks.length === 0 ? (
        <SectionCard title="No tasks yet" description="Create the first operational task to begin building the squadron's shared suspense tracker.">
          <div className="empty-state"><strong>The task board is ready.</strong><span>Use New task to add the first assignment.</span></div>
        </SectionCard>
      ) : (
        <section className="kanban-board kanban-board--five">
          {columns.map((column) => {
            const columnTasks = visibleTasks.filter((task) => task.status === column.status);
            return (
              <div className="kanban-column" key={column.status}>
                <header><strong>{column.label}</strong><span>{columnTasks.length}</span></header>
                <div>
                  {columnTasks.map((task) => (
                    <article className={`task-card task-card--${task.priority.toLowerCase()}`} key={task.id}>
                      <div className="task-card__top"><span>{task.functionalAreaName}</span><StatusPill label={formatStatus(task.status)} tone={toneForStatus(task.status)} /></div>
                      <h3>{task.title}</h3>
                      <p>{task.description || `${formatPriority(task.priority)} priority task`}</p>
                      <dl>
                        <div><dt>Due</dt><dd className={task.dueOn && task.dueOn < today() && !["COMPLETED", "CANCELLED"].includes(task.status) ? "text-danger" : ""}>{task.dueOn ? formatDate(task.dueOn) : "No due date"}</dd></div>
                        <div><dt>Owner</dt><dd>{task.ownerName || "Unassigned"}</dd></div>
                      </dl>
                      <div className="task-card__actions">
                        {canEdit && task.status !== "COMPLETED" ? (
                          <button disabled={busyTaskId === task.id} onClick={() => updateStatus(task, nextStatus(task))}>
                            {busyTaskId === task.id ? "Saving..." : task.status === "BLOCKED" ? "Return to work" : `Move to ${formatStatus(nextStatus(task))}`}
                          </button>
                        ) : null}
                        {canEdit && task.status !== "BLOCKED" && !["COMPLETED", "CANCELLED"].includes(task.status) ? <button className="task-card__secondary" disabled={busyTaskId === task.id} onClick={() => updateStatus(task, "BLOCKED")}>Block</button> : null}
                        {canDelete ? <button className="task-card__delete" disabled={busyTaskId === task.id} aria-label={`Delete ${task.title}`} onClick={() => removeTask(task)}><Trash2 size={14} /></button> : null}
                      </div>
                    </article>
                  ))}
                  {columnTasks.length === 0 ? <div className="kanban-empty">No matching tasks</div> : null}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
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
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
