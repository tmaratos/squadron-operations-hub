"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shield, UserCheck, UserMinus } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import type { DuplicatePair } from "@/lib/auth/merge";
import type { AuthenticatedUser, GlobalRole, UserRecord } from "@/lib/auth/types";

// What each role actually lets somebody do, said on the page rather than remembered. A dropdown of five
// words that nobody can tell apart is how people end up handing out more than they meant to.
const roles: Array<{ value: GlobalRole; label: string; means: string }> = [
  { value: "SYSTEM_OWNER", label: "System owner", means: "Everything, including making somebody else an owner, merging accounts and removing members. The commander and whoever maintains the Hub." },
  { value: "ACCOUNT_APPROVER", label: "Account approver", means: "Can let new members in and turn accounts off, and nothing else administrative." },
  { value: "ADMINISTRATOR", label: "Administrator", means: "Runs the squadron's work: departments, lists, the organisation chart, agents and settings. Cannot change who may sign in." },
  { value: "STAFF_MEMBER", label: "Staff member", means: "The ordinary one. Creates and completes work, assigns it, comments, and connects their own mail. Most members are this." },
  { value: "READ_ONLY", label: "Read only", means: "Can see the squadron's work and change none of it. New members who have not been given Shared Drive access start here." }
];

export function UserAdministration({
  actor,
  users,
  duplicates = []
}: {
  actor: AuthenticatedUser;
  users: UserRecord[];
  duplicates?: DuplicatePair[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function action(payload: Record<string, unknown>, key: string) {
    setWorking(key);
    setMessage(null);
    const response = await fetch("/api/admin/users/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? "Account updated.");
    setWorking(null);
    if (response.ok) router.refresh();
  }

  return (
    <div className="user-admin-stack">
      <style>{uaCss}</style>
      {message ? <div className="inline-notice" role="status">{message}</div> : null}

      {/* One person with two accounts is not a display problem. Work assigned to one is invisible from the
          other, and where the two carry different privileges, which account somebody signs in with decides
          what they are allowed to do. Detected and shown; merged only when somebody says so, because two
          members really can share a name. */}
      {duplicates.length ? (
        <section className="section-card ua-dupes">
          <header className="section-card__header">
            <div>
              <h2>These look like the same person twice</h2>
              <p>Merging moves all of their work onto the account that stays and removes the other one. It cannot be undone.</p>
            </div>
            <span className="count-badge">{duplicates.length}</span>
          </header>
          <div className="section-card__body">
            {duplicates.map((pair) => (
              <div className="ua-dupe" key={pair.keep.id + pair.drop.id}>
                <div className="ua-dupe-body">
                  <strong>{pair.keep.name}</strong>
                  <span className="ua-dupe-side">Keep <code>{pair.keep.email}</code> · {pair.keep.role.replace(/_/g, " ").toLowerCase()} · {pair.keep.status.toLowerCase()}</span>
                  <span className="ua-dupe-side">Fold in <code>{pair.drop.email}</code> · {pair.drop.role.replace(/_/g, " ").toLowerCase()} · {pair.drop.status.toLowerCase()}</span>
                  <small>{pair.because}</small>
                </div>
                {actor.globalRole === "SYSTEM_OWNER" ? (
                  <ConfirmButton
                    className="ua-merge"
                    disabled={working === pair.drop.id}
                    question={"Move everything from " + pair.drop.email + " onto " + pair.keep.email + " and remove it? This cannot be undone."}
                    onConfirm={() => action({ action: "MERGE", targetId: pair.keep.id, mergeFromId: pair.drop.id }, pair.drop.id)}
                  >
                    Same person — merge
                  </ConfirmButton>
                ) : <span className="ua-dupe-note">A system owner can merge these.</span>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Five words in a dropdown that nobody can tell apart is how people hand out more than they meant. */}
      <section className="section-card">
        <header className="section-card__header">
          <div><h2>What the roles mean</h2><p>Every account has exactly one. They stack: each can do everything the one below it can.</p></div>
        </header>
        <div className="section-card__body">
          <dl className="ua-roles">
            {roles.map((role) => (
              <div key={role.value}>
                <dt>{role.label}</dt>
                <dd>{role.means}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-card">
        <header className="section-card__header">
          <div><h2>Approved and historical users</h2><p>System owners can elevate another approved member to full owner privileges.</p></div>
          <span className="count-badge">{users.length}</span>
        </header>
        <div className="section-card__body">
          <div className="user-table">
            {users.map((user) => (
              <article key={user.id}>
                <div className="user-table__person">
                  <span className="user-avatar">{initials(user.fullName)}</span>
                  <div><strong>{user.fullName}</strong><small>{user.email}</small><em>{user.dutyTitle || "No duty title set"}</em></div>
                </div>
                <span className={`status-chip status-chip--${user.status.toLowerCase()}`}>{user.status}</span>
                <label>
                  Global privileges
                  <select
                    value={user.globalRole}
                    disabled={actor.globalRole !== "SYSTEM_OWNER" || working === user.id}
                    onChange={(event) => action({ action: "SET_ROLE", targetId: user.id, role: event.target.value }, user.id)}
                  >
                    {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                </label>
                <div className="user-table__actions">
                  {user.status === "APPROVED" ? (
                    <button className="button button--ghost" disabled={user.id === actor.id || working === user.id} onClick={() => action({ action: "SUSPEND", targetId: user.id }, user.id)}><UserMinus size={15} /> Suspend</button>
                  ) : (
                    <button className="button button--ghost" disabled={working === user.id} onClick={() => action({ action: "REACTIVATE", targetId: user.id }, user.id)}><UserCheck size={15} /> Reactivate</button>
                  )}
                </div>
                {user.globalRole === "SYSTEM_OWNER" ? <span className="owner-marker"><Shield size={14} /> Full system owner</span> : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

const uaCss = [
  ".ua-dupes .section-card__body{display:flex;flex-direction:column;gap:9px}",
  ".ua-dupe{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:11px 13px;border:1px solid var(--cu-border,#e4e6eb);border-left:3px solid #d9932b;border-radius:9px;flex-wrap:wrap}",
  ".ua-dupe-body{display:flex;flex-direction:column;gap:2px;flex:1 1 280px;min-width:0}",
  ".ua-dupe-body strong{font-size:14px}",
  ".ua-dupe-side{font-size:12.5px;opacity:.8}",
  ".ua-dupe-side code{font-size:12px}",
  ".ua-dupe-body small{font-size:12px;opacity:.7;margin-top:3px}",
  ".ua-dupe-note{font-size:12px;opacity:.6}",
  ".ua-merge{border:1px solid #d9932b;background:none;color:#d9932b;font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".ua-roles{display:flex;flex-direction:column;gap:9px;margin:0}",
  ".ua-roles > div{display:flex;flex-direction:column;gap:2px}",
  ".ua-roles dt{font-size:13px;font-weight:700}",
  ".ua-roles dd{margin:0;font-size:12.5px;opacity:.8;line-height:1.5}"
].join("");
