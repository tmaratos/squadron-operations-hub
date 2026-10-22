"use client";

import { useMemo, useState } from "react";
import { History, Search, ShieldCheck } from "lucide-react";
import type { AuditEventRecord } from "@/lib/db/audit";

type AuditDisplayEvent = Pick<AuditEventRecord, "id" | "summary" | "actorName" | "action" | "entityType" | "createdAt">;

function readableAction(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}

function dateGroup(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown date" :
    new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function dateTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown time" :
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** View-only interface: never sends audit data or modification commands back to the server. */
export function AuditExplorer({ events }: { events: AuditDisplayEvent[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const categories = useMemo(() =>
    Array.from(new Set(events.map((event) => event.entityType))).sort((a, b) => a.localeCompare(b)), [events]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en-US");
    return events.filter((event) =>
      (category === "ALL" || event.entityType === category) &&
      (!term || [event.summary, event.actorName ?? "", event.action, event.entityType]
        .some((part) => part.toLocaleLowerCase("en-US").includes(term)))
    );
  }, [events, query, category]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, AuditDisplayEvent[]>();
    for (const event of visible) {
      const group = dateGroup(event.createdAt);
      const groupEvents = buckets.get(group) ?? [];
      groupEvents.push(event);
      buckets.set(group, groupEvents);
    }
    return [...buckets.entries()];
  }, [visible]);

  return (
    <div className="audit-explorer">
      <div className="audit-controls">
        <div className="audit-search-wrap">
          <label htmlFor="audit-search">Search activity</label>
          <div className="audit-search-field"><Search size={18} aria-hidden="true" />
            <input id="audit-search" type="search" value={query} placeholder="Member, action, or description"
              onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="audit-category-wrap">
          <label htmlFor="audit-category">Record type</label>
          <select id="audit-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="ALL">All record types</option>
            {categories.map((name) => <option key={name} value={name}>{name.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div className="audit-match" role="status" aria-live="polite">
          Showing <strong>{visible.length}</strong> of {events.length} recent events
        </div>
      </div>
      <p className="audit-scope-note">Only the latest {events.length} audit records are loaded here. Filtering searches those records, not the full historical database. This view is read-only.</p>
      {grouped.length ? grouped.map(([day, entries]) => (
        <section className="audit-day" key={day} aria-label={day}>
          <header><h3>{day}</h3><span>{entries.length} event{entries.length !== 1 ? "s" : ""}</span></header>
          <ul className="audit-group-list">
            {entries.map((event) => (
              <li key={event.id}>
                <span className="audit-event-icon" aria-hidden="true"><History size={18}/></span>
                <div className="audit-detail">
                  <strong>{event.summary}</strong>
                  <span>{readableAction(event.action)} · {event.entityType.replaceAll("_", " ")}</span>
                  <small>{event.actorName ? "By " + event.actorName : "System event"}</small>
                </div>
                <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
              </li>
            ))}
          </ul>
        </section>
      )) : (
        <div className="audit-empty">
          <ShieldCheck size={27} aria-hidden="true" />
          <strong>{events.length ? "No matching activity" : "No audit events yet"}</strong>
          <span>{events.length ? "Try a different search or record type." : "Recorded security and administrative actions will appear here."}</span>
          {(query || category !== "ALL") ? <button type="button" onClick={() => { setQuery(""); setCategory("ALL"); }}>Clear filters</button> : null}
        </div>
      )}
    </div>
  );
}
