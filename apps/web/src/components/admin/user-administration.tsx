"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shield, UserCheck, UserMinus } from "lucide-react";
import type { AuthenticatedUser, GlobalRole, UserRecord } from "@/lib/auth/types";

const roles: Array<{ value: GlobalRole; label: string }> = [
  { value: "SYSTEM_OWNER", label: "System owner" },
  { value: "ACCOUNT_APPROVER", label: "Account approver" },
  { value: "ADMINISTRATOR", label: "Administrator" },
  { value: "STAFF_MEMBER", label: "Staff member" },
  { value: "READ_ONLY", label: "Read only" }
];

export function UserAdministration({
  actor,
  users
}: {
  actor: AuthenticatedUser;
  users: UserRecord[];
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
      {message ? <div className="inline-notice" role="status">{message}</div> : null}

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
