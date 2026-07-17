"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, LoaderCircle, Plus, Star, Trash2, UserRoundCog } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import type { GlobalRole } from "@/lib/auth/types";
import type { DutyAssignmentRecord } from "@/lib/operations/staff";
import type { FunctionalAreaRecord } from "@/lib/operations/types";

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  dutyTitle: string | null;
  globalRole: GlobalRole;
}

export function StaffPage({
  initialAssignments,
  functionalAreas,
  users,
  canManage,
  canDelete
}: {
  initialAssignments: DutyAssignmentRecord[];
  functionalAreas: FunctionalAreaRecord[];
  users: UserOption[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const staffedAreas = new Set(assignments.filter(isActive).map((item) => item.functionalAreaKey));
  const unstaffed = functionalAreas.filter((area) => !staffedAreas.has(area.key));
  const assignedUsers = new Set(assignments.filter(isActive).map((item) => item.userId));
  const workload = useMemo(() => {
    return users
      .map((user) => ({ user, assignments: assignments.filter((item) => item.userId === user.id && isActive(item)) }))
      .sort((left, right) => right.assignments.length - left.assignments.length || left.user.fullName.localeCompare(right.user.fullName));
  }, [assignments, users]);

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || creating) return;
    setCreating(true);
    setNotice(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/staff/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: String(data.get("userId") ?? ""),
          functionalAreaKey: String(data.get("functionalAreaKey") ?? "command"),
          dutyTitle: String(data.get("dutyTitle") ?? ""),
          isPrimary: data.get("isPrimary") === "on",
          startsOn: String(data.get("startsOn") ?? today())
        })
      });
      const payload = await response.json() as { assignment?: DutyAssignmentRecord; message?: string };
      if (!response.ok || !payload.assignment) throw new Error(payload.message || "The assignment could not be created.");
      setAssignments((current) => [...current.filter((item) => !(payload.assignment!.isPrimary && item.functionalAreaKey === payload.assignment!.functionalAreaKey && item.isPrimary)), payload.assignment!]);
      form.reset();
      setShowForm(false);
      setNotice({ tone: "success", message: payload.message || "Duty assignment created." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The assignment could not be created." });
    } finally {
      setCreating(false);
    }
  }

  async function endAssignment(assignment: DutyAssignmentRecord) {
    if (!canManage || busyId) return;
    const endsOn = window.prompt("Enter the assignment end date in YYYY-MM-DD format:", today());
    if (!endsOn) return;
    setBusyId(assignment.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/staff/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsOn })
      });
      const payload = await response.json() as { assignment?: DutyAssignmentRecord; message?: string };
      if (!response.ok || !payload.assignment) throw new Error(payload.message || "The assignment could not be ended.");
      setAssignments((current) => current.map((item) => item.id === assignment.id ? payload.assignment! : item));
      setNotice({ tone: "success", message: payload.message || "Duty assignment ended." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The assignment could not be ended." });
    } finally {
      setBusyId(null);
    }
  }

  async function removeAssignment(assignment: DutyAssignmentRecord) {
    if (!canDelete || busyId) return;
    if (!window.confirm(`Permanently delete ${assignment.userName}'s ${assignment.dutyTitle} assignment? Ending it preserves continuity history.`)) return;
    setBusyId(assignment.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/staff/assignments/${assignment.id}`, { method: "DELETE" });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "The assignment could not be deleted.");
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      setNotice({ tone: "success", message: payload.message || "Duty assignment deleted." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The assignment could not be deleted." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Staff continuity"
        title="Senior Members and Duty Assignments"
        description="Show who owns each functional area, identify single points of failure, and make it possible for one member to cover multiple positions without losing accountability."
        actions={canManage ? <button className="button button--primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> Assign duty</button> : undefined}
      />

      <section className="metric-grid metric-grid--four">
        <MetricCard label="Approved Members" value={users.length} detail="Accounts able to access the hub" tone="info" />
        <MetricCard label="Assigned Members" value={assignedUsers.size} detail="Holding at least one active duty" tone="success" />
        <MetricCard label="Active Assignments" value={assignments.filter(isActive).length} detail="Across all staff sections" tone="info" />
        <MetricCard label="Unstaffed Areas" value={unstaffed.length} detail="No active duty assignment" tone={unstaffed.length ? "warning" : "success"} />
      </section>

      {notice ? <div className={`inline-notice inline-notice--${notice.tone}`} role="status"><AlertCircle size={17} /><span>{notice.message}</span></div> : null}

      {showForm && canManage ? (
        <SectionCard title="Create duty assignment" description="One senior member may hold multiple duties. Mark one assignment as primary when that person owns the functional area.">
          <form className="staff-assignment-form" onSubmit={addAssignment}>
            <label>Member<select name="userId" required defaultValue=""><option value="" disabled>Select a senior member</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {formatRole(user.globalRole)}</option>)}</select></label>
            <label>Functional area<select name="functionalAreaKey" defaultValue="command">{functionalAreas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}</select></label>
            <label>Duty title<input name="dutyTitle" required minLength={2} maxLength={180} placeholder="Safety Officer" /></label>
            <label>Start date<input name="startsOn" type="date" defaultValue={today()} required /></label>
            <label className="checkbox-field"><input name="isPrimary" type="checkbox" /> Primary owner for this functional area</label>
            <div><button className="button button--primary" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <UserRoundCog size={16} />}{creating ? "Assigning..." : "Create assignment"}</button><button className="button button--ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </SectionCard>
      ) : null}

      <div className="content-grid content-grid--wide">
        <SectionCard title="Functional area ownership" description="Primary and supporting duty assignments by staff section.">
          <div className="staff-area-list">
            {functionalAreas.map((area) => {
              const areaAssignments = assignments.filter((item) => item.functionalAreaKey === area.key && isActive(item));
              return (
                <article className={`staff-area-row ${areaAssignments.length ? "" : "staff-area-row--empty"}`} key={area.key}>
                  <div><strong>{area.name}</strong><span>{area.description}</span></div>
                  <div className="staff-area-row__owners">
                    {areaAssignments.length ? areaAssignments.map((assignment) => (
                      <span key={assignment.id} className={assignment.isPrimary ? "staff-chip staff-chip--primary" : "staff-chip"}>
                        {assignment.isPrimary ? <Star size={12} /> : null}
                        <b>{assignment.userName}</b>
                        <small>{assignment.dutyTitle}</small>
                        {canManage ? <button disabled={busyId === assignment.id} onClick={() => endAssignment(assignment)}>End</button> : null}
                        {canDelete ? <button className="staff-chip__delete" disabled={busyId === assignment.id} onClick={() => removeAssignment(assignment)} aria-label={`Delete ${assignment.dutyTitle}`}><Trash2 size={12} /></button> : null}
                      </span>
                    )) : <em>Unassigned</em>}
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Member workload" description="See where a single member is carrying several parts of the squadron.">
          <div className="member-workload-list">
            {workload.map(({ user, assignments: memberAssignments }) => (
              <article key={user.id}>
                <div className="member-avatar">{initials(user.fullName)}</div>
                <div><strong>{user.fullName}</strong><span>{user.dutyTitle || formatRole(user.globalRole)}</span><small>{memberAssignments.length ? memberAssignments.map((item) => item.dutyTitle).join(" · ") : "No current duty assignments"}</small></div>
                <b>{memberAssignments.length}</b>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function isActive(assignment: DutyAssignmentRecord): boolean {
  return !assignment.endsOn || assignment.endsOn >= today();
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatRole(role: GlobalRole): string {
  return role.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
