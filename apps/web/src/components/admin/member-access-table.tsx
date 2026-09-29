"use client";

import { useMemo, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { AccessStatus, MemberAccess } from "@/lib/members/access";

// The member list, with the access decision next to the CAP facts.
//
// Two columns rather than one status, because collapsing them is what caused the confusion this page
// exists to end: a member can be perfectly active in CAP and deliberately have no business in this
// application, and that is not an error state.

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Everyone" },
  { key: "AUTHORIZED", label: "Authorized" },
  { key: "RESTRICTED", label: "Restricted" },
  { key: "NOT_CONFIGURED", label: "Not configured" },
  { key: "missing", label: "No login address" },
  { key: "inactive", label: "No longer active in CAP" }
];

function statusLabel(status: AccessStatus): string {
  return status === "AUTHORIZED" ? "Authorized"
    : status === "RESTRICTED" ? "Restricted"
      : "Not configured";
}

export function MemberAccessTable({ members: initial, canManage }: {
  members: MemberAccess[];
  canManage: boolean;
}) {
  const [members, setMembers] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    return members.filter((member) => {
      if (filter === "missing" && member.loginEmail) return false;
      if (filter === "inactive" && member.capMembership === "ACTIVE") return false;
      if (["AUTHORIZED", "RESTRICTED", "NOT_CONFIGURED"].includes(filter) && member.status !== filter) return false;
      if (!wanted) return true;
      return [member.fullName, member.capid, member.loginEmail ?? "", member.capEmail ?? ""]
        .join(" ").toLowerCase().includes(wanted);
    });
  }, [members, filter, search]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch("/api/members/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { message?: string; members?: MemberAccess[] };
      if (data.members) setMembers(data.members);
      setNote(data.message ?? null);
      if (response.ok) {
        setDraftEmail("");
        setOpen(null);
      }
    } catch {
      setNote("That could not be done.");
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => ({
    authorized: members.filter((m) => m.status === "AUTHORIZED").length,
    missing: members.filter((m) => !m.loginEmail).length
  }), [members]);

  return (
    <section className="ma">
      <style>{maCss}</style>

      <div className="ma-top">
        <input
          className="ma-search"
          type="search"
          value={search}
          placeholder="Search name, CAPID or address"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="ma-filters">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={"ma-chip" + (filter === entry.key ? " is-on" : "")}
              onClick={() => setFilter(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <p className="ma-summary">
        {members.length} members · {counts.authorized} authorized · {counts.missing} without a login address
      </p>

      {note ? <p className="ma-note" role="status">{note}</p> : null}

      <ul className="ma-list">
        {shown.map((member) => (
          <li key={member.capid} className={member.status === "RESTRICTED" ? "is-restricted" : ""}>
            <div className="ma-who">
              <strong>{member.fullName}</strong>
              <small>
                CAPID {member.capid}
                {member.rank ? " · " + member.rank : ""}
                {member.memberType === "CADET" ? " · cadet" : ""}
              </small>
            </div>

            <div className="ma-facts">
              <span className="ma-fact">
                <em>CAP membership</em>
                <b className={member.capMembership === "ACTIVE" ? "is-active" : "is-gone"}>
                  {member.capMembership === "ACTIVE" ? "Active" : "Not active"}
                </b>
                <small>{member.capSource === "CAPWATCH" ? "from CAPWATCH" : "entered by hand"}</small>
              </span>

              <span className="ma-fact">
                <em>Hub access</em>
                <b className={"is-" + member.status.toLowerCase()}>{statusLabel(member.status)}</b>
                <small>{member.loginEmail ?? "no login address"}</small>
              </span>
            </div>

            {canManage ? (
              <div className="ma-actions">
                <button type="button" className="ma-btn" onClick={() => {
                  setOpen(open === member.capid ? null : member.capid);
                  setDraftEmail(member.loginEmail ?? "");
                }}>
                  {member.loginEmail ? "Change address" : "Add address"}
                </button>

                {member.status === "AUTHORIZED" ? (
                  <ConfirmButton
                    className="ma-btn ma-btn--danger"
                    disabled={busy === member.capid}
                    question={"Restrict " + member.fullName + "? Their records and history stay."}
                    onConfirm={() => act({ action: "restrict", capid: member.capid }, member.capid)}
                  >
                    Restrict
                  </ConfirmButton>
                ) : (
                  <button
                    type="button"
                    className="ma-btn ma-btn--primary"
                    disabled={busy === member.capid || !member.loginEmail}
                    title={member.loginEmail ? undefined : "Add a login address first"}
                    onClick={() => act({ action: "grant", capid: member.capid }, member.capid)}
                  >
                    Grant access
                  </button>
                )}
              </div>
            ) : null}

            {open === member.capid ? (
              <form
                className="ma-email"
                onSubmit={(event) => {
                  event.preventDefault();
                  act({ action: "login_email", capid: member.capid, email: draftEmail.trim() || null }, member.capid);
                }}
              >
                <label>
                  <span>Personal login address</span>
                  <input
                    type="email"
                    value={draftEmail}
                    autoComplete="off"
                    placeholder="name@example.com"
                    onChange={(event) => setDraftEmail(event.target.value)}
                  />
                </label>
                <button type="submit" className="ma-btn ma-btn--primary" disabled={busy === member.capid}>
                  Save
                </button>
                <p className="ma-fine">
                  Saving an address does not grant access. It only records how this member signs in.
                </p>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {!shown.length ? <p className="ma-note">Nobody matches that.</p> : null}
    </section>
  );
}

const maCss = [
  ".ma{display:flex;flex-direction:column;gap:12px;min-width:0}",
  ".ma-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
  ".ma-search{flex:1;min-width:220px;font:inherit;font-size:13.5px;padding:9px 12px;border-radius:9px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);color:inherit}",
  "html[data-theme=dark] .ma-search{background:#2a2b2f;border-color:#3a3d44}",
  ".ma-filters{display:flex;gap:6px;flex-wrap:wrap}",
  ".ma-chip{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12px;font-weight:600;padding:6px 11px;border-radius:999px;cursor:pointer}",
  ".ma-chip.is-on{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".ma-summary{margin:0;font-size:12.5px;opacity:.7}",
  ".ma-note{margin:0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".ma-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".ma-list li{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--cu-border,#e4e6eb);border-radius:11px;min-width:0}",
  "html[data-theme=dark] .ma-list li{border-color:#3a3d44}",
  ".ma-list li.is-restricted{background:rgba(208,59,59,.05);border-color:rgba(208,59,59,.35)}",
  ".ma-who{display:flex;flex-direction:column;gap:2px;min-width:170px;flex:1}",
  ".ma-who strong{font-size:14.5px}.ma-who small{font-size:11.5px;opacity:.65}",
  ".ma-facts{display:flex;gap:20px;flex-wrap:wrap}",
  ".ma-fact{display:flex;flex-direction:column;gap:1px;min-width:150px}",
  ".ma-fact em{font-style:normal;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;opacity:.5;font-weight:700}",
  ".ma-fact b{font-size:13px}",
  ".ma-fact small{font-size:11.5px;opacity:.6;overflow:hidden;text-overflow:ellipsis}",
  ".ma-fact .is-active{color:#0a7a0a}html[data-theme=dark] .ma-fact .is-active{color:#7fdc7f}",
  ".ma-fact .is-gone{opacity:.65}",
  ".ma-fact .is-authorized{color:#0a7a0a}html[data-theme=dark] .ma-fact .is-authorized{color:#7fdc7f}",
  ".ma-fact .is-restricted{color:#c03030}",
  ".ma-fact .is-not_configured{opacity:.7}",
  ".ma-actions{display:flex;gap:6px;flex-wrap:wrap}",
  ".ma-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".ma-btn:disabled{opacity:.5;cursor:default}",
  ".ma-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".ma-btn--danger{color:#d03b3b}.ma-btn--danger:hover{border-color:#d03b3b}",
  ".ma-email{flex:1 0 100%;display:flex;gap:9px;align-items:flex-end;flex-wrap:wrap;padding-top:10px;border-top:1px dashed var(--cu-border,#e4e6eb)}",
  ".ma-email label{display:flex;flex-direction:column;gap:3px;flex:1;min-width:200px}",
  ".ma-email label span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.55}",
  ".ma-email input{font:inherit;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);color:inherit}",
  "html[data-theme=dark] .ma-email input{background:#2a2b2f;border-color:#3a3d44}",
  ".ma-fine{flex:1 0 100%;margin:0;font-size:11.5px;opacity:.6}"
].join("");
