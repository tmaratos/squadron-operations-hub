"use client";

import { useEffect, useRef, useState } from "react";

// Picking a person works like Gmail: type a few letters, pick the row. The list is everyone with squadron
// access, not only people who have signed in, so nobody has to be "set up" before they can be given work.
export interface PickablePerson {
  userId: string | null;
  email: string;
  fullName: string;
  dutyTitle: string | null;
  source: "hub" | "drive";
  pending: boolean;
}

export function PeoplePicker({
  excludeUserIds = [],
  onPick,
  onClose,
  label = "Assign to"
}: {
  excludeUserIds?: string[];
  onPick: (person: { userId: string; fullName: string }) => void;
  onClose: () => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PickablePerson[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.focus(); }, []);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/directory?q=" + encodeURIComponent(query));
        const data = (await response.json()) as { people?: PickablePerson[]; driveNote?: string | null; message?: string };
        if (!live) return;
        if (!response.ok) throw new Error(data.message || "The directory could not be read.");
        setPeople(data.people ?? []);
        setNote(data.driveNote ?? null);
        setError(null);
      } catch (caught) {
        if (live) setError(caught instanceof Error ? caught.message : "The directory could not be read.");
      } finally {
        if (live) setLoading(false);
      }
    }, query ? 180 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onDown = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);

  async function choose(person: PickablePerson) {
    if (person.userId) {
      onPick({ userId: person.userId, fullName: person.fullName });
      onClose();
      return;
    }
    // Shared Drive person with no Hub account yet: create it, then assign. They pick it up at first sign-in.
    setBusyEmail(person.email);
    try {
      const response = await fetch("/api/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: person.email, fullName: person.fullName })
      });
      const data = (await response.json()) as { userId?: string; message?: string };
      if (!response.ok || !data.userId) throw new Error(data.message || "That person could not be added.");
      onPick({ userId: data.userId, fullName: person.fullName });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That person could not be added.");
    } finally {
      setBusyEmail(null);
    }
  }

  const rows = people.filter((person) => !person.userId || !excludeUserIds.includes(person.userId));

  return (
    <div className="pp" ref={box} role="dialog" aria-label={label}>
      <style>{ppCss}</style>
      <input
        ref={field}
        className="pp-field"
        value={query}
        placeholder="Type a name or email"
        aria-label={label}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && rows.length) { event.preventDefault(); choose(rows[0]); } }}
      />
      {error ? <p className="pp-msg pp-msg--bad">{error}</p> : null}
      <div className="pp-list" role="listbox">
        {rows.map((person) => (
          <button
            key={person.email}
            type="button"
            role="option"
            aria-selected="false"
            className="pp-row"
            disabled={busyEmail === person.email}
            onClick={() => choose(person)}
          >
            <span className="pp-avatar">{initials(person.fullName)}</span>
            <span className="pp-who">
              <strong>{person.fullName}</strong>
              <small>{person.dutyTitle ? person.dutyTitle + " · " + person.email : person.email}</small>
            </span>
            {busyEmail === person.email ? <span className="pp-tag">Adding…</span>
              : person.source === "drive" ? <span className="pp-tag">Has Drive access</span>
              : person.pending ? <span className="pp-tag">Not signed in yet</span>
              : null}
          </button>
        ))}
        {!rows.length && !loading ? <p className="pp-msg">Nobody matches that. Check the spelling, or ask command staff to give them Shared Drive access.</p> : null}
        {loading && !rows.length ? <p className="pp-msg">Looking…</p> : null}
      </div>
      {note ? <p className="pp-foot">{note}</p> : null}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

const ppCss = [
  ".pp{position:absolute;z-index:70;width:min(340px,86vw);background:var(--cu-bg,#fff);border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;box-shadow:0 18px 44px rgba(9,20,44,.22);padding:10px;text-align:left}",
  "html[data-theme=dark] .pp{background:#25262a;border-color:#3a3d44}",
  ".pp .pp-field{width:100%;box-sizing:border-box;font:inherit;font-size:14px;min-height:38px;padding:0 10px;border:1px solid var(--cu-border,#d5d8de);border-radius:8px;background:#fff;color:#0b0b0b}",
  "html[data-theme=dark] .pp .pp-field{background:#1d1e21;border-color:#3a3d44;color:#f3f4f6}",
  ".pp-list{max-height:280px;overflow:auto;margin-top:8px;display:flex;flex-direction:column;gap:2px}",
  ".pp-row{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:none;font:inherit;color:inherit;cursor:pointer;text-align:left}",
  ".pp-row:hover,.pp-row:focus-visible{background:rgba(123,104,238,.12)}",
  ".pp-row:disabled{opacity:.6;cursor:default}",
  ".pp-avatar{flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:#7b68ee;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}",
  ".pp-who{display:flex;flex-direction:column;min-width:0;flex:1}",
  ".pp-who strong{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".pp-who small{font-size:11.5px;color:var(--cu-muted,#656f7d);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".pp-tag{flex:0 0 auto;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;background:rgba(42,120,214,.14);color:#1c5cab}",
  "html[data-theme=dark] .pp-tag{background:rgba(57,135,229,.2);color:#9ec5f4}",
  ".pp-msg{margin:8px 2px 2px;font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.45}",
  ".pp-msg--bad{color:#c03030}",
  ".pp-foot{margin:8px 2px 0;padding-top:8px;border-top:1px solid var(--cu-border,#e4e6eb);font-size:11.5px;color:var(--cu-muted,#656f7d);line-height:1.45}",
  "@media (max-width:760px){.pp{width:min(320px,90vw)}.pp-list{max-height:220px}}"
].join("");
