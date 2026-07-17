"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Filter, Plus, Search } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { priorityItems } from "@/lib/mock-data";
import type { PriorityItem, Tone } from "@/lib/types";

const columns = ["Open", "In Progress", "Awaiting Approval", "Completed"] as const;
type Column = (typeof columns)[number];

interface BoardTask extends PriorityItem {
  column: Column;
}

const initialTasks: BoardTask[] = [
  ...priorityItems.map((item, index) => ({ ...item, column: index === 2 ? "In Progress" as const : index === 0 ? "Awaiting Approval" as const : "Open" as const })),
  {
    id: "task-discord-policy",
    title: "Document Discord onboarding process",
    subtitle: "Continuity procedure",
    category: "Communications",
    due: "Jul 22, 2026",
    dueDetail: "5 days",
    status: "In Progress",
    tone: "info",
    assignedTo: "2d Lt. Maratos",
    column: "In Progress"
  },
  {
    id: "task-complete-1",
    title: "Publish July squadron calendar",
    subtitle: "Communications",
    category: "Administration",
    due: "Jul 10, 2026",
    dueDetail: "Completed Jul 9",
    status: "Completed",
    tone: "success",
    assignedTo: "2d Lt. Maratos",
    column: "Completed"
  }
];

export function TasksBoard() {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) => [task.title, task.category, task.assignedTo].some((value) => value.toLowerCase().includes(normalized)));
  }, [query, tasks]);

  function addTask(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    const category = String(formData.get("category") ?? "Command");
    const assignedTo = String(formData.get("owner") ?? "Unassigned");
    const tone: Tone = "neutral";
    setTasks((current) => [
      {
        id: crypto.randomUUID(),
        title,
        subtitle: "Manually created",
        category,
        due: String(formData.get("due") || "No due date"),
        dueDetail: "New task",
        status: "Open",
        tone,
        assignedTo,
        column: "Open"
      },
      ...current
    ]);
    setShowForm(false);
  }

  function advanceTask(taskId: string) {
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const currentIndex = columns.indexOf(task.column);
      const next = columns[Math.min(currentIndex + 1, columns.length - 1)];
      return { ...task, column: next, status: next, tone: next === "Completed" ? "success" : next === "Awaiting Approval" ? "warning" : "info" };
    }));
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Command workflow"
        title="Tasks and Suspenses"
        description="Assign, prioritize, escalate, and complete work across every squadron staff section."
        actions={<button className="button button--primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> New task</button>}
      />

      <section className="metric-grid metric-grid--four">
        <MetricCard label="Open" value={tasks.filter((task) => task.column === "Open").length} detail="Not yet started" tone="info" />
        <MetricCard label="In Progress" value={tasks.filter((task) => task.column === "In Progress").length} detail="Actively being worked" tone="warning" />
        <MetricCard label="Awaiting Approval" value={tasks.filter((task) => task.column === "Awaiting Approval").length} detail="Commander review" tone="warning" />
        <MetricCard label="Completed" value={tasks.filter((task) => task.column === "Completed").length} detail="Current board" tone="success" />
      </section>

      {showForm ? (
        <SectionCard title="Create task" description="This demo stores new tasks in local page state until database actions are connected.">
          <form className="task-form" action={addTask}>
            <label>Title<input name="title" required placeholder="What needs to be completed?" /></label>
            <label>Functional area<select name="category"><option>Command</option><option>Finance</option><option>Logistics</option><option>Safety</option><option>Aerospace Education</option><option>Communications</option></select></label>
            <label>Owner<input name="owner" placeholder="Unassigned" /></label>
            <label>Due date<input name="due" type="date" /></label>
            <div><button className="button button--primary" type="submit">Create task</button><button className="button button--ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </SectionCard>
      ) : null}

      <div className="task-toolbar">
        <label><Search size={17} /><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search tasks..." /></label>
        <button className="button button--secondary"><Filter size={16} /> Filters</button>
      </div>

      <section className="kanban-board">
        {columns.map((column) => (
          <div className="kanban-column" key={column}>
            <header><strong>{column}</strong><span>{visibleTasks.filter((task) => task.column === column).length}</span></header>
            <div>
              {visibleTasks.filter((task) => task.column === column).map((task) => (
                <article className="task-card" key={task.id}>
                  <div className="task-card__top"><span>{task.category}</span><StatusPill label={task.status} tone={task.tone} /></div>
                  <h3>{task.title}</h3>
                  <p>{task.subtitle}</p>
                  <dl><div><dt>Due</dt><dd>{task.due}</dd></div><div><dt>Owner</dt><dd>{task.assignedTo}</dd></div></dl>
                  {column !== "Completed" ? <button onClick={() => advanceTask(task.id)}>Advance status</button> : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
