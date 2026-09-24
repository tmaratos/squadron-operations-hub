"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { SpaceNode } from "@/lib/work/types";

// Tidying the workspace: renaming a department or a list, and removing the ones that should not be there.
//
// The assistant can create departments, which means it can also create two called the same thing - and
// until now nothing in the app could remove either of them.

export function SpaceManager({ spaces: initialSpaces, canEdit }: { spaces: SpaceNode[]; canEdit: boolean }) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // a space id, or "space" for a new department
  const router = useRouter();

  async function send(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch("/api/work/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { spaces?: SpaceNode[]; message?: string };
      if (!response.ok) throw new Error(data.message || "That change could not be saved.");
      if (data.spaces) setSpaces(data.spaces);
      setRenaming(null);
      setAdding(null);
      setNote(data.message ?? "Saved.");
      router.refresh(); // the sidebar is rendered elsewhere and has to hear about this too
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  function rename(kind: "space" | "list", id: string, current: string) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("name");
      const name = typeof value === "string" ? value.trim() : "";
      if (!name || name === current) { setRenaming(null); return; }
      send({ action: "rename", kind, id, name }, id);
    };
  }

  function create(kind: "space" | "list", spaceId?: string) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const value = new FormData(form).get("name");
      const name = typeof value === "string" ? value.trim() : "";
      if (!name) return;
      form.reset();
      send({ action: "create", kind, name, ...(spaceId ? { spaceId } : {}) }, spaceId ?? "space");
    };
  }

  return (
    <div className="sm">
      <style>{smCss}</style>
      {note ? <p className="sm-note" role="status">{note}</p> : null}

      {canEdit ? (
        <div className="sm-new">
          {adding === "space" ? (
            <form onSubmit={create("space")} className="sm-rename">
              <input name="name" placeholder="Department name, e.g. Emergency Services" maxLength={80} aria-label="New department name" autoFocus />
              <button type="submit" className="sm-btn sm-btn--primary" disabled={busy === "space"}>
                {busy === "space" ? "Creating…" : "Create"}
              </button>
              <button type="button" className="sm-btn" onClick={() => setAdding(null)}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="sm-btn sm-btn--primary" onClick={() => setAdding("space")}>New department</button>
          )}
        </div>
      ) : null}

      {spaces.length === 0 ? <p className="sm-empty">No departments yet.</p> : null}

      <div className="spaces-grid">
        {spaces.map((space) => (
          <section className="spaces-card" key={space.id}>
            <header>
              <span className="spaces-avatar">{space.name.slice(0, 1).toUpperCase()}</span>
              <div className="sm-head">
                {renaming === space.id ? (
                  <form onSubmit={rename("space", space.id, space.name)} className="sm-rename">
                    <input name="name" defaultValue={space.name} maxLength={80} aria-label="Department name" autoFocus />
                    <button type="submit" className="sm-btn sm-btn--primary" disabled={busy === space.id}>Save</button>
                    <button type="button" className="sm-btn" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <h2>{space.name}</h2>
                    {space.description ? <p>{space.description}</p> : null}
                  </>
                )}
              </div>
              {canEdit && renaming !== space.id ? (
                <div className="sm-actions">
                  <button type="button" className="sm-btn" onClick={() => setRenaming(space.id)}>Rename</button>
                  <ConfirmButton
                    className="sm-btn sm-btn--danger"
                    disabled={busy === space.id}
                    question="Remove this department and its lists?"
                    onConfirm={() => send({ action: "archive", kind: "space", id: space.id }, space.id)}
                  >
                    Remove
                  </ConfirmButton>
                </div>
              ) : null}
            </header>

            {space.lists.map((list) => (
              <div className="sm-list" key={list.id}>
                {renaming === list.id ? (
                  <form onSubmit={rename("list", list.id, list.name)} className="sm-rename">
                    <input name="name" defaultValue={list.name} maxLength={80} aria-label="List name" autoFocus />
                    <button type="submit" className="sm-btn sm-btn--primary" disabled={busy === list.id}>Save</button>
                    <button type="button" className="sm-btn" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <Link className="spaces-list" href={"/lists/" + list.id}>
                      <span className="spaces-dot" />
                      <span className="spaces-name">{list.name}</span>
                      <span className="spaces-count">{list.openItems}</span>
                    </Link>
                    {canEdit ? (
                      <span className="sm-actions">
                        {/* The sidebar takes a dragged list; this is the same move for anybody on a
                            touchscreen, where there is nothing to drag with. */}
                        {spaces.length > 1 ? (
                          <select
                            className="sm-btn sm-move"
                            value=""
                            aria-label={"Move " + list.name + " to another department"}
                            disabled={busy === list.id}
                            onChange={(event) => {
                              if (event.target.value) send({ action: "move", kind: "list", id: list.id, spaceId: event.target.value }, list.id);
                            }}
                          >
                            <option value="">Move to…</option>
                            {spaces.filter((entry) => entry.id !== space.id).map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.name}</option>
                            ))}
                          </select>
                        ) : null}
                        <button type="button" className="sm-btn" onClick={() => setRenaming(list.id)}>Rename</button>
                        <ConfirmButton
                          className="sm-btn sm-btn--danger"
                          disabled={busy === list.id}
                          question={list.openItems ? "Remove it and its " + list.openItems + " open tasks?" : "Remove this list?"}
                          onConfirm={() => send({ action: "archive", kind: "list", id: list.id }, list.id)}
                        >
                          Remove
                        </ConfirmButton>
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            ))}

            {space.folders.map((folder) => (
              <div className="spaces-folder" key={folder.id}>
                <h3>{folder.name}</h3>
                {folder.lists.map((list) => (
                  <Link className="spaces-list" key={list.id} href={"/lists/" + list.id}>
                    <span className="spaces-dot" />
                    <span className="spaces-name">{list.name}</span>
                    <span className="spaces-count">{list.openItems}</span>
                  </Link>
                ))}
              </div>
            ))}
            {canEdit ? (
              adding === space.id ? (
                <form onSubmit={create("list", space.id)} className="sm-rename sm-add">
                  <input name="name" placeholder="List name" maxLength={80} aria-label={"New list in " + space.name} autoFocus />
                  <button type="submit" className="sm-btn sm-btn--primary" disabled={busy === space.id}>
                    {busy === space.id ? "Creating…" : "Create"}
                  </button>
                  <button type="button" className="sm-btn" onClick={() => setAdding(null)}>Cancel</button>
                </form>
              ) : (
                <button type="button" className="sm-btn sm-add" onClick={() => setAdding(space.id)}>+ Add a list</button>
              )
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

const smCss = [
  ".sm-head{flex:1;min-width:0}",
  ".sm-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
  ".sm-btn{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".sm-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".sm-btn--danger{color:#d03b3b}.sm-btn--danger:hover{border-color:#d03b3b}",
  ".sm-btn:disabled{opacity:.55;cursor:default}",
  ".sm-rename{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
  ".sm-rename input{font:inherit;font-size:14px;min-height:32px;padding:0 8px;border-radius:7px;border:1px solid var(--border,#d5d8de);min-width:0;flex:1 1 140px}",
  ".sm-list{display:flex;align-items:center;gap:8px;justify-content:space-between}",
  ".sm-list .spaces-list{flex:1;min-width:0}",
  ".sm-note{margin:0 0 14px;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(123,104,238,.12)}",
  ".sm-empty{font-size:14px;color:var(--muted,#656f7d)}",
  ".sm-new{margin:0 0 16px}",
  ".sm-move{cursor:pointer;max-width:130px}",
  ".sm-add{margin-top:8px;align-self:flex-start}"
].join("");
