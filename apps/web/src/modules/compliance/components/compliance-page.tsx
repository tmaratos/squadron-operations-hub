"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, LoaderCircle, Pause, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import type { ComplianceRequirementRecord, ComplianceStatus } from "@/lib/operations/compliance";
import type { FunctionalAreaRecord } from "@/lib/operations/types";
import type { Tone } from "@/lib/types";

interface UserOption {
  id: string;
  fullName: string;
  dutyTitle: string | null;
}

export function CompliancePage({
  initialRequirements,
  functionalAreas,
  users,
  canEdit,
  canDelete
}: {
  initialRequirements: ComplianceRequirementRecord[];
  functionalAreas: FunctionalAreaRecord[];
  users: UserOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const metrics = useMemo(() => {
    const active = requirements.filter((item) => item.status === "ACTIVE");
    const overdue = active.filter((item) => item.nextDueOn && item.nextDueOn < today()).length;
    const dueThisMonth = active.filter((item) => item.nextDueOn && item.nextDueOn >= today() && item.nextDueOn <= monthEnd()).length;
    return { active: active.length, overdue, dueThisMonth, paused: requirements.filter((item) => item.status === "PAUSED").length };
  }, [requirements]);

  async function createRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating) return;
    setCreating(true);
    setNotice(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const evidence = String(data.get("requiredEvidence") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? "") || null,
          governingSource: String(data.get("governingSource") ?? "") || null,
          functionalAreaKey: String(data.get("functionalAreaKey") ?? "command"),
          responsibleUserId: String(data.get("responsibleUserId") ?? "") || null,
          recurrenceRule: String(data.get("recurrenceRule") ?? "") || null,
          nextDueOn: String(data.get("nextDueOn") ?? "") || null,
          requiredEvidence: evidence
        })
      });
      const payload = await response.json() as { requirement?: ComplianceRequirementRecord; message?: string };
      if (!response.ok || !payload.requirement) throw new Error(payload.message || "The requirement could not be created.");
      setRequirements((current) => [...current, payload.requirement!].sort(sortRequirements));
      form.reset();
      setShowForm(false);
      setNotice({ tone: "success", message: payload.message || "Requirement created." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The requirement could not be created." });
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(requirement: ComplianceRequirementRecord, status: ComplianceStatus) {
    if (!canEdit || busyId) return;
    setBusyId(requirement.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/compliance/${requirement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = await response.json() as { requirement?: ComplianceRequirementRecord; message?: string };
      if (!response.ok || !payload.requirement) throw new Error(payload.message || "The requirement could not be updated.");
      setRequirements((current) => current.map((item) => item.id === requirement.id ? payload.requirement! : item).sort(sortRequirements));
      setNotice({ tone: "success", message: payload.message || "Requirement updated." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The requirement could not be updated." });
    } finally {
      setBusyId(null);
    }
  }

  async function removeRequirement(requirement: ComplianceRequirementRecord) {
    if (!canDelete || busyId) return;
    if (!window.confirm(`Permanently delete “${requirement.name}”? Retiring it is usually safer because deletion removes its configuration.`)) return;
    setBusyId(requirement.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/compliance/${requirement.id}`, { method: "DELETE" });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "The requirement could not be deleted.");
      setRequirements((current) => current.filter((item) => item.id !== requirement.id));
      setNotice({ tone: "success", message: payload.message || "Requirement deleted." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The requirement could not be deleted." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Readiness engine"
        title="Compliance and Recurring Requirements"
        description="Define recurring squadron obligations once. The scheduled Cloudflare Worker generates tracked tasks as their due dates arrive."
        actions={canEdit ? <button className="button button--primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> New requirement</button> : undefined}
      />

      <section className="metric-grid metric-grid--four">
        <MetricCard label="Active" value={metrics.active} detail="Generating future work" tone="info" />
        <MetricCard label="Overdue" value={metrics.overdue} detail="Past their next due date" tone={metrics.overdue ? "danger" : "success"} />
        <MetricCard label="Due This Month" value={metrics.dueThisMonth} detail="Upcoming recurring obligations" tone={metrics.dueThisMonth ? "warning" : "success"} />
        <MetricCard label="Paused" value={metrics.paused} detail="Temporarily excluded from automation" tone="neutral" />
      </section>

      {notice ? <div className={`inline-notice inline-notice--${notice.tone}`} role="status"><AlertCircle size={17} /><span>{notice.message}</span></div> : null}

      {showForm && canEdit ? (
        <SectionCard title="Create recurring requirement" description="Use a concise recurrence rule and identify the evidence that proves completion.">
          <form className="compliance-form" onSubmit={createRequirement}>
            <label className="compliance-form__name">Requirement name<input name="name" required minLength={3} maxLength={180} placeholder="Monthly safety education" /></label>
            <label>Functional area<select name="functionalAreaKey" defaultValue="safety">{functionalAreas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}</select></label>
            <label>Responsible member<select name="responsibleUserId" defaultValue=""><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}{user.dutyTitle ? `, ${user.dutyTitle}` : ""}</option>)}</select></label>
            <label>Recurrence<select name="recurrenceRule" defaultValue="FREQ=MONTHLY"><option value="FREQ=DAILY">Daily</option><option value="FREQ=WEEKLY">Weekly</option><option value="FREQ=MONTHLY">Monthly</option><option value="FREQ=QUARTERLY">Quarterly</option><option value="FREQ=ANNUALLY">Annually</option></select></label>
            <label>Next due date<input name="nextDueOn" type="date" required /></label>
            <label>Governing source<input name="governingSource" maxLength={500} placeholder="Regulation, policy, OI, or local procedure" /></label>
            <label className="compliance-form__description">Description<textarea name="description" rows={3} maxLength={5000} placeholder="What must be done and why?" /></label>
            <label className="compliance-form__evidence">Required evidence, one item per line<textarea name="requiredEvidence" rows={3} placeholder={'Briefing record\nMeeting minutes\nCompletion certificate'} /></label>
            <div><button className="button button--primary" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{creating ? "Creating..." : "Create requirement"}</button><button className="button button--ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Requirement register" description="Active requirements will create a task on their due date and then advance to the next recurrence.">
        {requirements.length ? (
          <div className="compliance-list">
            {requirements.map((requirement) => {
              const tone = toneForRequirement(requirement);
              return (
                <article className="compliance-row" key={requirement.id}>
                  <div className={`record-row__marker record-row__marker--${tone}`} />
                  <div className="compliance-row__body">
                    <div className="compliance-row__heading"><strong>{requirement.name}</strong><StatusPill label={requirement.status} tone={requirement.status === "ACTIVE" ? tone : "neutral"} /></div>
                    <span>{requirement.functionalAreaName} · {formatRecurrence(requirement.recurrenceRule)} · Owner: {requirement.responsibleName || "Unassigned"}</span>
                    <small>{requirement.governingSource || requirement.description || "No governing source recorded"}</small>
                    {requirement.requiredEvidence.length ? <div className="evidence-tags">{requirement.requiredEvidence.map((item) => <b key={item}>{item}</b>)}</div> : null}
                  </div>
                  <div className="compliance-row__due"><small>Next due</small><strong className={tone === "danger" ? "text-danger" : ""}>{requirement.nextDueOn ? formatDate(requirement.nextDueOn) : "Not scheduled"}</strong></div>
                  <div className="compliance-row__actions">
                    {canEdit && requirement.status === "ACTIVE" ? <button title="Pause automation" disabled={busyId === requirement.id} onClick={() => setStatus(requirement, "PAUSED")}><Pause size={15} /></button> : null}
                    {canEdit && requirement.status !== "ACTIVE" ? <button title="Activate automation" disabled={busyId === requirement.id} onClick={() => setStatus(requirement, "ACTIVE")}><Play size={15} /></button> : null}
                    {canEdit && requirement.status !== "RETIRED" ? <button title="Retire requirement" disabled={busyId === requirement.id} onClick={() => setStatus(requirement, "RETIRED")}>Retire</button> : null}
                    {canDelete ? <button className="danger-action" title="Delete requirement" disabled={busyId === requirement.id} onClick={() => removeRequirement(requirement)}><Trash2 size={15} /></button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><strong>No recurring requirements configured</strong><span>Add monthly, quarterly, annual, or local recurring work to activate the automation engine.</span></div>}
      </SectionCard>
    </div>
  );
}

function sortRequirements(left: ComplianceRequirementRecord, right: ComplianceRequirementRecord): number {
  const statusRank = { ACTIVE: 0, PAUSED: 1, RETIRED: 2 } as const;
  return statusRank[left.status] - statusRank[right.status] || (left.nextDueOn || "9999").localeCompare(right.nextDueOn || "9999") || left.name.localeCompare(right.name);
}

function toneForRequirement(requirement: ComplianceRequirementRecord): Tone {
  if (requirement.status !== "ACTIVE") return "neutral";
  if (requirement.nextDueOn && requirement.nextDueOn < today()) return "danger";
  if (requirement.nextDueOn && requirement.nextDueOn <= monthEnd()) return "warning";
  return "success";
}

function formatRecurrence(value: string | null): string {
  if (!value) return "One-time";
  return value.replace("FREQ=", "").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthEnd(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
