"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type TaskHit = { id: string; title: string; listId: string; listName: string; dueOn: string | null; statusName: string | null; statusColor: string | null; closed: boolean };
type Entry = { key: string; group: string; label: string; hint?: string; color?: string | null; href: string; closed?: boolean };

const PAGES: Array<{ label: string; href: string; hint: string }> = [
  { label: "My tasks", href: "/tasks", hint: "Work" },
  { label: "All lists", href: "/spaces", hint: "Work" },
  { label: "Calendar", href: "/calendar", hint: "Work" },
  { label: "Command dashboard", href: "/dashboards", hint: "Work" },
  { label: "People", href: "/staff", hint: "Squadron" },
  { label: "Who does what", href: "/duties", hint: "Squadron" },
  { label: "Files", href: "/documents", hint: "Squadron" },
  { label: "Notifications", href: "/notifications", hint: "Yours" },
  { label: "My connections", href: "/connections", hint: "Yours" },
  { label: "Members and access", href: "/admin/users", hint: "Running the Hub" },
  { label: "History", href: "/audit", hint: "Running the Hub" }
];

function relativeDue(value: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(value + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
  if (diff < 0) return Math.abs(diff) + "d overdue";
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  if (diff <= 7) return "due in " + diff + "d";
  return "due " + new Date(value + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CommandPalette({ lists }: { lists: Array<{ id: string; name: string; openItems: number }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch("/api/work/search?q=" + encodeURIComponent(query.trim()))
        .then((response) => response.json() as Promise<{ tasks?: TaskHit[] }>)
        .then((data) => {
          if (!cancelled) {
            setTasks(data.tasks ?? []);
            setActive(0);
          }
        })
        .catch(() => {
          if (!cancelled) setTasks([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const matchedLists = lists.filter((list) => !needle || list.name.toLowerCase().includes(needle)).slice(0, 6);
    const matchedPages = PAGES.filter((page) => !needle || page.label.toLowerCase().includes(needle)).slice(0, 4);
    return [
      ...tasks.map((task) => ({
        key: "t-" + task.id,
        group: needle ? "Tasks" : "Up next",
        label: task.title,
        hint: task.listName + (task.dueOn ? " · " + relativeDue(task.dueOn) : ""),
        color: task.statusColor,
        closed: task.closed,
        href: "/lists/" + task.listId + "?item=" + encodeURIComponent(task.id)
      })),
      ...matchedLists.map((list) => ({ key: "l-" + list.id, group: "Lists", label: list.name, hint: list.openItems + " open", href: "/lists/" + list.id })),
      ...matchedPages.map((page) => ({ key: "p-" + page.href, group: "Go to", label: page.label, hint: page.hint, href: page.href }))
    ];
  }, [tasks, lists, query]);

  useEffect(() => {
    resultsRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  }

  return (
    <>
      <style>{cpCss}</style>
      <button type="button" className="cu-search cp-trigger" onClick={() => setOpen(true)} aria-label="Search tasks, lists and pages" aria-keyshortcuts="Control+K /">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" /></svg>
        <span className="cp-trigger-text">Search tasks, lists, pages…</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open ? (
        <div className="cp-overlay" onMouseDown={() => setOpen(false)}>
          <div className="cp" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(event) => event.stopPropagation()}>
            <div className="cp-input-row">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" /></svg>
              <input
                ref={inputRef}
                className="cp-input"
                value={query}
                placeholder="Search tasks, lists and pages"
                aria-label="Search"
                role="combobox"
                aria-expanded="true"
                aria-controls="cp-results"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((current) => Math.min(entries.length - 1, current + 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((current) => Math.max(0, current - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(entries[active]);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                  }
                }}
              />
              {loading ? <span className="cp-spinner" aria-hidden="true" /> : <kbd>Esc</kbd>}
            </div>
            <div className="cp-results" id="cp-results" role="listbox" ref={resultsRef}>
              {entries.length === 0 && !loading ? <p className="cp-empty">Nothing matches “{query}”.</p> : null}
              {entries.map((entry, index) => (
                <Fragment key={entry.key}>
                  {index === 0 || entries[index - 1].group !== entry.group ? <div className="cp-group">{entry.group}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    className={"cp-item" + (index === active ? " is-active" : "")}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(entry)}
                  >
                    <span className={"cp-dot cp-dot--" + entry.group.replace(/\s+/g, "-").toLowerCase()} style={entry.color ? { background: entry.color } : undefined} />
                    <span className={"cp-label" + (entry.closed ? " cp-label--closed" : "")}>{entry.label}</span>
                    {entry.hint ? <span className="cp-hint">{entry.hint}</span> : null}
                    <span className="cp-enter" aria-hidden="true">↵</span>
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="cp-foot">
              <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
              <span><kbd>Enter</kbd> open</span>
              <span><kbd>Esc</kbd> close</span>
              <span className="cp-foot-tip">Press <kbd>/</kbd> anywhere to search</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const cpCss = [
  ".cp-trigger{cursor:pointer;font:inherit;text-align:left}",
  ".cp-trigger-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--cu-muted,#656f7d)}",
  ".cp-trigger:hover{border-color:#7b68ee}",
  ".cp-overlay{position:fixed;inset:0;z-index:120;background:rgba(10,12,20,.45);backdrop-filter:blur(2px);display:flex;justify-content:center;align-items:flex-start;padding:12vh 16px 16px}",
  ".cp{width:min(640px,100%);max-height:70vh;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#ffffff;color:#292d34;border:1px solid #e4e6eb;box-shadow:0 24px 60px rgba(0,0,0,.35)}",
  "html[data-theme=dark] .cp{background:#1f2023;color:#e3e4e6;border-color:#34363b}",
  ".cp-input-row{display:flex;align-items:center;gap:10px;padding:0 16px;height:54px;border-bottom:1px solid #e4e6eb;color:#656f7d}",
  "html[data-theme=dark] .cp-input-row{border-color:#34363b;color:#9ba1a9}",
  "html .cp .cp-input{flex:1;min-width:0;border:0;outline:none;background:transparent;color:inherit;font:inherit;font-size:16px;box-shadow:none;padding:0}",
  "html[data-theme=dark] .cp .cp-input{color:#e3e4e6}",
  ".cp kbd{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:4px;border:1px solid rgba(135,144,158,.4);font:inherit;font-size:11px;color:#656f7d;margin-right:3px}",
  "html[data-theme=dark] .cp kbd{color:#9ba1a9}",
  ".cp-results{overflow-y:auto;padding:6px}",
  ".cp-group{padding:10px 10px 4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#656f7d}",
  "html[data-theme=dark] .cp-group{color:#9ba1a9}",
  ".cp-item{display:grid;grid-template-columns:10px minmax(0,1fr) auto 16px;gap:10px;align-items:center;width:100%;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;padding:9px 10px;border-radius:8px;cursor:pointer}",
  ".cp-item.is-active{background:rgba(123,104,238,.14)}",
  ".cp-dot{width:9px;height:9px;border-radius:3px;background:#87909e}",
  ".cp-dot--lists{background:#7b68ee}.cp-dot--go-to{background:transparent;border:1.5px solid #87909e}",
  ".cp-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cp-label--closed{text-decoration:line-through;opacity:.6}",
  ".cp-hint{font-size:12px;color:#656f7d;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}",
  "html[data-theme=dark] .cp-hint{color:#9ba1a9}",
  ".cp-enter{opacity:0;color:#7b68ee;font-size:13px}.cp-item.is-active .cp-enter{opacity:1}",
  ".cp-empty{margin:0;padding:24px 12px;text-align:center;color:#656f7d;font-size:14px}",
  ".cp-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(123,104,238,.25);border-top-color:#7b68ee;animation:cp-spin .7s linear infinite}",
  "@keyframes cp-spin{to{transform:rotate(360deg)}}",
  ".cp-foot{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding:9px 16px;border-top:1px solid #e4e6eb;font-size:12px;color:#656f7d}",
  "html[data-theme=dark] .cp-foot{border-color:#34363b;color:#9ba1a9}",
  ".cp-foot-tip{margin-left:auto}",
  "@media (max-width:600px){.cp-overlay{padding-top:8px}.cp-hint,.cp-foot-tip,.cp-trigger kbd{display:none}.cp-item{grid-template-columns:10px minmax(0,1fr) 16px}}"
].join("");
