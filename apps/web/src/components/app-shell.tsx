"use client";

import { operationsExperienceCss } from "@/components/operations-experience";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  Eye,
  FileText,
  Grid3x3,
  Home,
  ListChecks,
  Menu,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Target,
  Users,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AssistantPanel } from "@/components/ai/assistant-panel";
import { CommandPalette } from "@/components/command-palette";
import { ConfirmButton } from "@/components/confirm-button";
import { PulseWidget } from "@/components/assist/pulse-widget";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { breadcrumbFor, sidebar, sidebarFooter, sidebarTools, type SidebarEntry } from "@/lib/navigation";
import { hubDesignCss } from "@/components/hub-design";
import { hubPagesCss } from "@/components/hub-pages";
import type { AuthenticatedUser } from "@/lib/auth/types";
import type { SpaceNode } from "@/lib/work/types";

export interface WorkspaceSummary {
  id: string;
  name: string;
  shortName: string;
}

const defaultWorkspaces: WorkspaceSummary[] = [{ id: "tn-170", name: "TN-170 Oak Ridge", shortName: "170" }];

export function AppShell({ children, user, workspaces, spaces, agents }: {
  children: ReactNode;
  user: AuthenticatedUser;
  workspaces?: WorkspaceSummary[];
  spaces?: SpaceNode[];
  agents?: Array<{ id: string; name: string; emoji: string; purpose: string | null; shared: boolean }>;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString() ? "?" + params.toString() : "";
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  // A task dragged from a list can be dropped on any other list here, which is the obvious way to move
  // something filed in the wrong place - and was the thing people reached for first.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Right-clicking a department or list gives the menu people expect from every other tool: rename it,
  // remove it. Without it the only way to tidy the sidebar was to go and find another page.
  const [menu, setMenu] = useState<{ kind: "space" | "list"; id: string; name: string; x: number; y: number } | null>(null);
  const [menuForm, setMenuForm] = useState<"rename" | "list" | null>(null);
  const [addingSpace, setAddingSpace] = useState(false);

  // Come back to where you were.
  //
  // The app scrolls inside its main column rather than the window, so the browser's own scroll memory does
  // nothing for it. Clicking the last thing on a long dashboard and pressing back put somebody at the top
  // again, with the thing they were reading a screen and a half below.
  useEffect(() => {
    const main = document.querySelector(".cu-main");
    if (!main) return;
    const key = "hub-scroll:" + pathname;

    try {
      const saved = sessionStorage.getItem(key);
      // After the page has drawn, or it is scrolled before there is anything to scroll.
      if (saved) window.requestAnimationFrame(() => { main.scrollTop = Number(saved) || 0; });
    } catch { /* a page that opens at the top is not a failure */ }

    let pending = 0;
    const remember = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        try { sessionStorage.setItem(key, String(main.scrollTop)); } catch { /* fine */ }
      }, 150);
    };
    main.addEventListener("scroll", remember, { passive: true });
    return () => {
      window.clearTimeout(pending);
      main.removeEventListener("scroll", remember);
      try { sessionStorage.setItem(key, String(main.scrollTop)); } catch { /* fine */ }
    };
  }, [pathname]);
  // Dragging a whole department to a new place in the sidebar. `spaceDrop` is where it would land, and
  // which side of that department the line is drawn on.
  const [spaceDrop, setSpaceDrop] = useState<{ id: string; below: boolean } | null>(null);
  // The app's own right-click, everywhere the app has something better to offer than the browser does.
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number; href: string | null; label: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);

  // Chrome's menu is for a web page: back, forward, view source, cast, translate. None of it is any use
  // here. It is kept for the two things it does that this app cannot do for itself - editing text in a
  // field, and copying a selection - and replaced everywhere else.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("input, textarea, select, [contenteditable=true], [contenteditable='']")) return;
      if (window.getSelection()?.toString().trim()) return;

      event.preventDefault();
      const link = target.closest("a[href]") as HTMLAnchorElement | null;
      setMenu(null);
      setPageMenu({
        x: Math.min(event.clientX, window.innerWidth - 230),
        y: Math.min(event.clientY, window.innerHeight - 210),
        href: link?.getAttribute("href") ?? null,
        label: (link?.textContent || document.title || "This page").trim().slice(0, 60)
      });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    if (!pageMenu) return;
    // Ask whether the press landed inside the menu, rather than trusting stopPropagation to keep it out
    // of here. Both listeners sit on the same node, and stopPropagation does not stop a sibling listener
    // on that node - so the menu closed on the way down and its own buttons never saw a click at all.
    const close = (event: MouseEvent) => {
      if (pageMenuRef.current?.contains(event.target as Node)) return;
      setPageMenu(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPageMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [pageMenu]);

  function openMenu(event: React.MouseEvent, kind: "space" | "list", id: string, name: string) {
    event.preventDefault();
    event.stopPropagation(); // a department or a list has its own menu; the general one must not also open
    setPageMenu(null);
    setMenuForm(null);
    // Kept inside the window, so a right-click near the bottom does not open a menu nobody can reach.
    setMenu({ kind, id, name, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 190) });
  }

  async function structure(body: Record<string, unknown>, done: string) {
    try {
      const response = await fetch("/api/work/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!response.ok) throw new Error(data.message || "That could not be done.");
      setMenu(null);
      setMenuForm(null);
      setMoveNote(data.message ?? done);
      window.setTimeout(() => setMoveNote(null), 4000);
      router.refresh();
      if (body.action === "create" && body.kind === "list" && data.id) router.push("/lists/" + data.id);
    } catch (caught) {
      setMoveNote(caught instanceof Error ? caught.message : "That could not be done.");
      window.setTimeout(() => setMoveNote(null), 4000);
    }
  }

  async function dropOnList(event: React.DragEvent, listId: string, listName: string) {
    event.preventDefault();
    setDropTarget(null);
    const itemId = event.dataTransfer.getData("application/x-hub-item");
    if (!itemId) return;
    try {
      const response = await fetch("/api/work/items/" + encodeURIComponent(itemId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId })
      });
      if (!response.ok) throw new Error("no");
      setMoveNote("Moved to " + listName + ".");
      window.setTimeout(() => setMoveNote(null), 4000);
      router.refresh();
    } catch {
      setMoveNote("That could not be moved.");
      window.setTimeout(() => setMoveNote(null), 4000);
    }
  }
  // Folded unless somebody opens it: a dozen agents must not push the squadron's lists off the screen.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ agents: true });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const workspaceList = workspaces?.length ? workspaces : defaultWorkspaces;
  const currentWorkspace = workspaceList[0];
  const spaceTree = spaces ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hub-collapsed");
      // Merged over the defaults, never in place of them. Replacing them dropped the Agents default, which
      // left it neither open nor closed - and a section in that state took two presses to open.
      if (saved) setCollapsed((current) => ({ ...current, ...(JSON.parse(saved) as Record<string, boolean>) }));
    } catch {
      // A browser with site data blocked still gets a working sidebar, just not a remembered one.
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("hub-collapsed", JSON.stringify(collapsed)); } catch { /* not worth failing over */ }
  }, [collapsed]);

  useEffect(() => {
    const saved = localStorage.getItem("hub-theme");
    const nextTheme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    if (!menu) return;
    // Closing on any document click raced the menu's own buttons: the first press of a two-step delete
    // could close the menu before the second one existed, so deleting appeared to do nothing at all.
    // Only a press that lands outside the menu closes it.
    const onDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  useEffect(() => {
    setNewOpen(false);
    setMobileOpen(false);
    setMeOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("hub-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  const toggle = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  // With a department per functional area, everything open at once is a sidebar nobody can read. One
  // press folds the lot; the same press opens them again if they are already folded.
  const everyCollapsed = spaceTree.length > 0 && spaceTree.every((space) => collapsed[space.id]);
  function toggleAllSpaces() {
    setCollapsed((current) => {
      const next = { ...current };
      for (const space of spaceTree) next[space.id] = !everyCollapsed;
      return next;
    });
  }
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  const navLink = (href: string, label: string, icon: ReactNode, count?: number | string, listId?: string) => (
    <Link
      key={href + label}
      href={href}
      className={"cu-link" + (active(href) ? " is-active" : "") + (dropTarget === listId ? " is-drop" : "")}
      onContextMenu={listId ? (event) => openMenu(event, "list", listId, label) : undefined}
      draggable={Boolean(listId)}
      onDragStart={listId ? (event) => {
        event.dataTransfer.setData("application/x-hub-list", listId);
        event.dataTransfer.setData("text/plain", label);
        event.dataTransfer.effectAllowed = "move";
      } : undefined}
      onDragOver={listId ? (event) => {
        if (!event.dataTransfer.types.includes("application/x-hub-item")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(listId);
      } : undefined}
      onDragLeave={listId ? () => setDropTarget((current) => (current === listId ? null : current)) : undefined}
      onDrop={listId ? (event) => dropOnList(event, listId, label) : undefined}
    >
      <span className="cu-link-icon">{icon}</span>
      <span className="cu-link-label">{label}</span>
      {count !== undefined && count !== 0 ? <span className="cu-count">{count}</span> : null}
    </Link>
  );

  // Read-only members see the departments and open the lists, but are not offered renaming, removing or
  // dragging: the server refused all of it anyway, so the controls only ever led to an error.
  const canArrange = user.globalRole !== "READ_ONLY";

  // The squadron's own departments and lists, inside the Departments group. Dragging, dropping and the
  // right-click menu are unchanged: they are how people tidy the structure and nobody should lose them.
  const spacesSection = (
    <div className="hub-spaces">
      <div className="hub-spaces-head">
        <span>Departments</span>
        <span className="cu-head-actions">
          <button
            type="button"
            aria-label={everyCollapsed ? "Expand every department" : "Collapse every department"}
            title={everyCollapsed ? "Expand all" : "Collapse all"}
            onClick={toggleAllSpaces}
          >
            {everyCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
          {canArrange ? (
            <button type="button" aria-label="New department" title="New department" onClick={() => setAddingSpace((open) => !open)}>
              <Plus size={14} />
            </button>
          ) : null}
        </span>
      </div>
      {addingSpace ? (
        <form
          className="cu-side-new"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("name");
            const name = typeof value === "string" ? value.trim() : "";
            if (!name) { setAddingSpace(false); return; }
            setAddingSpace(false);
            structure({ action: "create", kind: "space", name }, "Created.");
          }}
        >
          <input name="name" placeholder="Department name" maxLength={80} aria-label="New department name" autoFocus />
          <button type="submit">Create</button>
        </form>
      ) : null}
      {spaceTree.map((space) => (
        <div key={space.id}>
          <button
            type="button"
            className={
              "cu-link cu-space" +
              (dropTarget === space.id ? " is-drop" : "") +
              (spaceDrop?.id === space.id ? (spaceDrop.below ? " is-order-after" : " is-order-before") : "")
            }
            onClick={() => toggle(space.id)}
            onContextMenu={canArrange ? (event) => openMenu(event, "space", space.id, space.name) : undefined}
            draggable={canArrange}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-hub-space", space.id);
              event.dataTransfer.setData("text/plain", space.name);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setSpaceDrop(null)}
            onDragOver={(event) => {
              const types = event.dataTransfer.types;
              if (types.includes("application/x-hub-space")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                // Which half of the row the pointer is over decides whether it lands above or below.
                const box = event.currentTarget.getBoundingClientRect();
                setSpaceDrop({ id: space.id, below: event.clientY > box.top + box.height / 2 });
                return;
              }
              if (!types.includes("application/x-hub-list")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTarget(space.id);
            }}
            onDragLeave={() => {
              setDropTarget((current) => (current === space.id ? null : current));
              setSpaceDrop((current) => (current?.id === space.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const movingSpace = event.dataTransfer.getData("application/x-hub-space");
              if (movingSpace) {
                const below = spaceDrop?.id === space.id ? spaceDrop.below : false;
                setSpaceDrop(null);
                if (movingSpace === space.id) return;
                const order = spaceTree.map((entry) => entry.id).filter((id) => id !== movingSpace);
                const at = order.indexOf(space.id);
                if (at < 0) return;
                order.splice(below ? at + 1 : at, 0, movingSpace);
                structure({ action: "reorder", kind: "space", ids: order }, "Order saved.");
                return;
              }
              setDropTarget(null);
              const listId = event.dataTransfer.getData("application/x-hub-list");
              if (!listId) return;
              if (space.lists.some((list) => list.id === listId)) return; // already filed here
              structure({ action: "move", kind: "list", id: listId, spaceId: space.id }, "Moved.");
            }}
          >
            <span className="cu-space-avatar">{space.name.slice(0, 1).toUpperCase()}</span>
            <span className="cu-link-label">{space.name}</span>
            {collapsed[space.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          {collapsed[space.id] ? null : (
            <div className="cu-tree">
              {space.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems, canArrange ? list.id : undefined))}
              {space.folders.map((folder) => (
                <div key={folder.id}>
                  <button type="button" className="cu-link" onClick={() => toggle(folder.id)}>
                    <span className="cu-link-icon">{collapsed[folder.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                    <span className="cu-link-label">{folder.name}</span>
                  </button>
                  {collapsed[folder.id] ? null : (
                    <div className="cu-tree">
                      {folder.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems, canArrange ? list.id : undefined))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {spaceTree.length === 0 ? <p className="cu-empty">No departments yet.</p> : null}
    </div>
  );

  // The squadron's agents, inside the AI Assistant group.
  const agentsSection = agents && agents.length ? (
    <div className="hub-spaces">
      {agents.map((agent) => (
        <Link
          key={agent.id}
          href={"/?agent=" + agent.id}
          className="cu-link cu-agent"
          title={agent.purpose ?? agent.name}
        >
          <span className="cu-agent-face" aria-hidden="true">
            {agent.emoji}
            <i className="cu-agent-dot" />
          </span>
          <span className="cu-link-label cu-agent-name">{agent.name}</span>
          {agent.shared ? null : <span className="cu-agent-tag" title="Yours only">you</span>}
        </Link>
      ))}
    </div>
  ) : null;

  const itemHere = (href: string) => {
    const [path, query] = href.split("#")[0].split("?");
    if (path !== pathname) return false;
    return !query || "?" + query === search;
  };

  /**
   * One line of the sidebar: a plain destination, a group that opens in place, or both - a place whose name
   * goes there and whose arrow opens what is inside it.
   *
   * A group holding the page somebody is on opens by itself, so the way back is always in sight; after
   * that it opens and folds as they choose, and the choice is remembered. Items meant for particular roles
   * are only shown to them; the pages still check for themselves.
   */
  const sidebarEntry = (entry: SidebarEntry) => {
    const Icon = entry.icon;
    const items = (entry.items ?? []).filter((item) => !item.roles || item.roles.includes(user.globalRole));
    if (entry.href && !items.length && !entry.dynamic) {
      const here = active(entry.href);
      return (
        <Link
          key={entry.key}
          href={entry.href}
          className={"hub-nav" + (here ? " is-active" : "")}
          aria-current={here ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{entry.label}</span>
        </Link>
      );
    }
    const holds = items.some((item) => itemHere(item.href))
      || (entry.dynamic === "spaces" && pathname.startsWith("/lists/"));
    const choice = collapsed["nav-" + entry.key];
    const open = choice === undefined ? holds : !choice;
    const toggle = () => setCollapsed((current) => ({ ...current, ["nav-" + entry.key]: open }));
    const here = entry.href ? active(entry.href) : false;
    return (
      <div key={entry.key} className={"hub-group" + (open ? " is-open" : "")}>
        {entry.href ? (
          <div className={"hub-nav-row" + (here ? " is-active" : holds ? " is-within" : "")}>
            <Link
              href={entry.href}
              className="hub-nav"
              aria-current={here ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{entry.label}</span>
            </Link>
            <button
              type="button"
              className="hub-nav-toggle"
              aria-expanded={open}
              aria-label={(open ? "Hide what is in " : "Show what is in ") + entry.label}
              onClick={toggle}
            >
              <ChevronRight size={15} className="hub-chevron" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={"hub-nav" + (holds ? " is-within" : "")}
            aria-expanded={open}
            onClick={toggle}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{entry.label}</span>
            <ChevronRight size={15} className="hub-chevron" aria-hidden="true" />
          </button>
        )}
        {open ? (
          <div className="hub-sub">
            {entry.action === "assistant" ? (
              <button
                type="button"
                className="cu-link cu-nav-item"
                onClick={() => { setMobileOpen(false); window.dispatchEvent(new CustomEvent("hub:ask")); }}
              >
                <span className="cu-link-icon"><Sparkles size={15} /></span>
                <span className="cu-nav-text"><span className="cu-link-label">Ask the assistant</span><small>Tasks, people, documents</small></span>
              </button>
            ) : null}
            {items.map((item) => {
              const ItemIcon = item.icon;
              const itemIsHere = itemHere(item.href);
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className={"cu-link cu-nav-item" + (itemIsHere ? " is-active" : "")}
                  aria-current={itemIsHere ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="cu-link-icon">{ItemIcon ? <ItemIcon size={15} /> : null}</span>
                  <span className="cu-nav-text">
                    <span className="cu-link-label">{item.label}</span>
                    {item.hint ? <small>{item.hint}</small> : null}
                  </span>
                </Link>
              );
            })}
            {entry.dynamic === "spaces" ? spacesSection : null}
            {entry.dynamic === "agents" ? agentsSection : null}
          </div>
        ) : null}
      </div>
    );
  };

  const allLists = spaceTree.flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)]);

  return (
    <div className="cu-shell hub-v3">
      <style>{shellCss}</style>
      <style>{operationsExperienceCss}</style>
      <style>{hubDesignCss}</style>
      <style>{hubPagesCss}</style>

      <aside className={"cu-sidebar" + (mobileOpen ? " is-open" : "")} aria-label="Navigation">
        <div className="hub-logo">
          <Link href="/" className="hub-logo-link" aria-label="TN-170 Operations Hub home" onClick={() => setMobileOpen(false)}>
            <HubMark />
            <span className="hub-logo-text">
              <strong>TN-170</strong>
              <span>Operations Hub</span>
              <small>{currentWorkspace.name}</small>
            </span>
          </Link>
          <button className="cu-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav className="hub-nav-list" aria-label="Main">
          {sidebar.map(sidebarEntry)}
          <p className="hub-nav-heading">Tools</p>
          {sidebarTools.map(sidebarEntry)}
        </nav>
        <nav className="hub-nav-foot" aria-label="Settings and help">
          {sidebarFooter.map(sidebarEntry)}
        </nav>
      </aside>

      <header className="cu-topbar">
        <button className="cu-mobile" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <Link href="/" className="hub-top-brand" aria-label="TN-170 Operations Hub home">
          <HubMark />
          <span><strong>TN-170</strong><small>Operations Hub</small></span>
        </Link>
        <CommandPalette lists={allLists.map((list) => ({ id: list.id, name: list.name, openItems: list.openItems }))} />
        {/* Opened from the sidebar, the home page and the widget in the corner. */}
        <AssistantPanel hideLauncher />
        <div className="cu-top-actions">
          <div className="hub-new">
            <button
              type="button"
              className="hub-new-button"
              aria-haspopup="menu"
              aria-expanded={newOpen}
              onClick={() => { setNewOpen((open) => !open); setMeOpen(false); }}
            >
              <Plus size={17} aria-hidden="true" /><span>New</span>
            </button>
            {newOpen ? (
              <div className="cu-menu hub-new-menu" role="menu">
                {/* A task always lives in a list, so "new task" means choosing which one. */}
                <p>Add a task to</p>
                {allLists.slice(0, 6).map((list) => (
                  <Link key={list.id} href={"/lists/" + list.id} role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}>
                    <ListChecks size={14} /><span>{list.name}</span>
                  </Link>
                ))}
                {allLists.length > 6 ? (
                  <Link href="/spaces" role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}><Grid3x3 size={14} /><span>Every list…</span></Link>
                ) : null}
                <div className="cu-menu-divider" />
                <Link href="/spaces" role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}><Grid3x3 size={14} /><span>Department or list</span></Link>
                <Link href="/documents" role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}><FileText size={14} /><span>Document</span></Link>
                <Link href="/staff" role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}><Users size={14} /><span>Person</span></Link>
                <Link href="/goals" role="menuitem" className="cu-menu-item" onClick={() => setNewOpen(false)}><Target size={14} /><span>Goal</span></Link>
              </div>
            ) : null}
          </div>
          <button type="button" className="hub-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <NotificationBell />
          <div className="cu-me">
            <button
              type="button"
              className="hub-me"
              title={user.fullName}
              aria-haspopup="menu"
              aria-expanded={meOpen}
              onClick={() => { setMeOpen(!meOpen); setNewOpen(false); }}
            >
              <span className="cu-avatar" aria-hidden="true">{initials(user.fullName)}</span>
              <span className="hub-me-text"><strong>{user.fullName}</strong><small>{roleLabel(user)}</small></span>
              <ChevronDown size={15} className="hub-me-chevron" aria-hidden="true" />
            </button>
            {meOpen ? (
              <div className="cu-me-menu" role="menu">
                <div className="cu-me-who">
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                </div>
                <Link href="/connections" role="menuitem" className="cu-menu-item" onClick={() => setMeOpen(false)}>My connections</Link>
                <Link href="/notifications" role="menuitem" className="cu-menu-item" onClick={() => setMeOpen(false)}>Notifications</Link>
                <Link href="/settings" role="menuitem" className="cu-menu-item" onClick={() => setMeOpen(false)}>Settings</Link>
                {/* Here as well as in the top bar, because a phone has no room for the top-bar switch. */}
                <button type="button" role="menuitem" className="cu-menu-item" onClick={() => { toggleTheme(); setMeOpen(false); }}>
                  {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
                  <span>{theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}</span>
                </button>
                {/* A real form post, so signing out works the same whether or not JavaScript is having a good day. */}
                <form method="post" action="/api/auth/logout">
                  <button type="submit" role="menuitem" className="cu-menu-item cu-menu-item--danger">Sign out</button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* On every page, because an assistant somebody has to navigate to is not helping. */}
      <PulseWidget />

      {moveNote ? <div className="cu-move-note" role="status">{moveNote}</div> : null}

      {pageMenu ? (
        <div
          className="cu-ctx"
          ref={pageMenuRef}
          style={{ left: pageMenu.x, top: pageMenu.y }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          <p className="cu-ctx-title">{pageMenu.label}</p>
          {pageMenu.href ? (
            <>
              <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => { router.push(pageMenu.href as string); setPageMenu(null); }}>Open</button>
              <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => { window.open(pageMenu.href as string, "_blank", "noopener"); setPageMenu(null); }}>Open in a new tab</button>
              <button
                type="button"
                role="menuitem"
                className="cu-ctx-item"
                onClick={() => {
                  navigator.clipboard?.writeText(new URL(pageMenu.href as string, window.location.origin).toString()).catch(() => undefined);
                  setPageMenu(null);
                  setMoveNote("Link copied.");
                  window.setTimeout(() => setMoveNote(null), 3000);
                }}
              >
                Copy link
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="cu-ctx-item"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                setPageMenu(null);
                setMoveNote("Link copied.");
                window.setTimeout(() => setMoveNote(null), 3000);
              }}
            >
              Copy link to this page
            </button>
          )}
          {canArrange ? <button
            type="button"
            role="menuitem"
            className="cu-ctx-item"
            onClick={() => {
              setPageMenu(null);
              // The form lives in the Squadron group, so open it where it can be seen.
              setCollapsed((current) => ({ ...current, "nav-squadron": false }));
              setAddingSpace(true);
            }}
          >
            New department
          </button> : null}
          <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => { setPageMenu(null); router.refresh(); }}>Refresh</button>
        </div>
      ) : null}

      {menu ? (
        <div
          className="cu-ctx"
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <p className="cu-ctx-title">{menu.name}</p>
          {menuForm ? (
            <form
              className="cu-ctx-rename"
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("name");
                const name = typeof value === "string" ? value.trim() : "";
                if (!name) { setMenu(null); return; }
                if (menuForm === "list") {
                  structure({ action: "create", kind: "list", spaceId: menu.id, name }, "Created.");
                  return;
                }
                if (name === menu.name) { setMenu(null); return; }
                structure({ action: "rename", kind: menu.kind, id: menu.id, name }, "Renamed.");
              }}
            >
              <input
                name="name"
                defaultValue={menuForm === "rename" ? menu.name : ""}
                placeholder={menuForm === "list" ? "List name" : undefined}
                maxLength={80}
                aria-label={menuForm === "list" ? "New list name" : "New name"}
                autoFocus
              />
              <button type="submit" className="cu-ctx-item cu-ctx-item--go">{menuForm === "list" ? "Create" : "Save"}</button>
            </form>
          ) : (
            <>
              <Link
                role="menuitem"
                className="cu-ctx-item"
                href={menu.kind === "list" ? "/lists/" + menu.id : "/spaces"}
                onClick={() => setMenu(null)}
              >
                Open
              </Link>
              <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => setMenuForm("rename")}>Rename</button>
              {menu.kind === "space" ? (
                <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => setMenuForm("list")}>Add a list</button>
              ) : null}
              <ConfirmButton
                className="cu-ctx-item cu-ctx-item--danger"
                question={menu.kind === "space" ? "Remove it and its lists?" : "Remove this list?"}
                onConfirm={() => structure({ action: "archive", kind: menu.kind, id: menu.id }, "Removed.")}
              >
                Delete
              </ConfirmButton>
            </>
          )}
        </div>
      ) : null}

      {mobileOpen ? <button className="cu-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
      <main className="cu-main">
        {/* Say it, rather than letting somebody wonder why their buttons are missing.
            A read-only account has every Add, Assign and Save quietly absent, which reads as the app being
            broken on their device. One line, at the top of every page, naming the reason and the fix. */}
        {user.globalRole === "READ_ONLY" ? (
          <p className="cu-readonly" role="status">
            <Eye size={14} aria-hidden="true" />
            <span>
              You can read everything here but not change it yet. Ask command staff to share the squadron
              Google Drive with you, then sign in again.
            </span>
          </p>
        ) : null}
        {/* Where you are, and the way back to the part of the app it belongs to. */}
        {pathname !== "/" && !pathname.startsWith("/lists/") ? (
          <nav className="cu-crumbs" aria-label="Breadcrumb">
            {breadcrumbFor(pathname, search).map((crumb, index, all) => (
              <span key={crumb.href + crumb.label}>
                {index < all.length - 1
                  ? <><Link href={crumb.href}>{crumb.label}</Link><i aria-hidden="true">/</i></>
                  : <strong aria-current="page">{crumb.label}</strong>}
              </span>
            ))}
          </nav>
        ) : null}
        {children}
      </main>

      {/* Five destinations chosen for quick navigation; notifications and account remain in the header. */}
      <nav className="cu-bottom" aria-label="Mobile navigation">
        <Link href="/" className={"cu-bottom-item" + (pathname === "/" ? " is-active" : "")}
          aria-current={pathname === "/" ? "page" : undefined}>
          <Home size={21} /><span>Home</span>
        </Link>
        <Link href="/tasks" className={"cu-bottom-item" + (pathname === "/tasks" ? " is-active" : "")}
          aria-current={pathname === "/tasks" ? "page" : undefined}>
          <ClipboardCheck size={21} /><span>My Work</span>
        </Link>
        <Link href="/calendar" className={"cu-bottom-item" + (active("/calendar") ? " is-active" : "")}
          aria-current={active("/calendar") ? "page" : undefined}>
          <CalendarDays size={21} /><span>Calendar</span>
        </Link>
        <Link href="/staff" className={"cu-bottom-item" + (active("/staff") ? " is-active" : "")}
          aria-current={active("/staff") ? "page" : undefined}>
          <Users size={21} /><span>Squadron</span>
        </Link>
        <button type="button" className={"cu-bottom-item" + (mobileOpen ? " is-active" : "")}
          onClick={() => setMobileOpen(true)} aria-label="Open all features" aria-expanded={mobileOpen}>
          <Menu size={21} /><span>More</span>
        </button>
      </nav>
    </div>
  );
}

/** The Hub's own mark: an aircraft seen from above. Not an insignia, and not anybody else's logo. */
function HubMark() {
  return (
    <span className="hub-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          fill="currentColor"
          d="M12 1.8c.9 0 1.5 1.3 1.5 3.2v4.1l8.1 4.6v2.1l-8.1-2.4v4.5l2.3 1.7V21L12 20.1 8.2 21v-1.4l2.3-1.7v-4.5l-8.1 2.4v-2.1l8.1-4.6V5c0-1.9.6-3.2 1.5-3.2Z"
        />
      </svg>
    </span>
  );
}

/** What somebody does here, under their name: their duty title if the roster has one, else their access. */
function roleLabel(user: AuthenticatedUser): string {
  if (user.dutyTitle?.trim()) return user.dutyTitle.trim();
  const labels: Record<AuthenticatedUser["globalRole"], string> = {
    SYSTEM_OWNER: "Hub owner",
    ACCOUNT_APPROVER: "Account approver",
    ADMINISTRATOR: "Administrator",
    STAFF_MEMBER: "Staff member",
    READ_ONLY: "Read only"
  };
  return labels[user.globalRole] ?? "Member";
}

const shellCss = [
  ".cu-shell{--cu-bg:#ffffff;--cu-side:#f7f8f9;--cu-rail:#f0f1f3;--cu-top:#ffffff;--cu-border:#e4e6eb;--cu-text:#292d34;--cu-muted:#656f7d;--cu-hover:rgba(15,23,42,.06);--cu-active:rgba(123,104,238,.14);--cu-accent:#7b68ee}",
  "html[data-theme=dark] .cu-shell{--cu-bg:#1b1c1f;--cu-side:#1e1f22;--cu-rail:#141517;--cu-top:#141517;--cu-border:#2c2e33;--cu-text:#e3e4e6;--cu-muted:#9ba1a9;--cu-hover:rgba(255,255,255,.06);--cu-active:rgba(123,104,238,.24)}",
  ".cu-shell{display:grid;grid-template-columns:64px 264px minmax(0,1fr);grid-template-rows:44px minmax(0,1fr);height:100vh;overflow:hidden;background:var(--cu-bg);color:var(--cu-text)}",
  ".cu-topbar{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:0 12px;background:var(--cu-top);border-bottom:1px solid var(--cu-border)}",
  ".cu-mobile,.cu-close{display:none;border:0;background:none;color:inherit;cursor:pointer}",
  ".cu-brand{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;padding-right:10px;border-right:1px solid var(--cu-border)}",
  ".cu-brand img{width:30px;height:30px;object-fit:contain;flex:none}",
  ".cu-brand-text{display:grid;line-height:1.1}.cu-brand-text strong{font-size:13px}.cu-brand-text small{font-size:10px;color:var(--cu-muted)}",
  ".cu-ws{position:relative}",
  ".cu-ws-button{display:flex;align-items:center;gap:8px;border:0;background:none;color:inherit;cursor:pointer;padding:4px 8px;border-radius:6px;font:inherit;font-size:13px}",
  ".cu-ws-button:hover{background:var(--cu-hover)}",
  ".cu-ws-avatar{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:linear-gradient(135deg,#7b68ee,#fd71af);color:#fff;font-size:10px;font-weight:800}",
  ".cu-ws-avatar--sm{width:20px;height:20px;font-size:9px}",
  ".cu-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:240px;z-index:80;display:grid;gap:2px;padding:6px;border:1px solid var(--cu-border);border-radius:8px;background:var(--cu-bg);box-shadow:0 12px 32px rgba(0,0,0,.25)}",
  ".cu-menu p{margin:4px 8px;font-size:11px;color:var(--cu-muted);text-transform:uppercase;letter-spacing:.04em}",
  ".cu-menu-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;color:inherit;text-decoration:none;font-size:13px}.cu-menu-item span:nth-child(2){flex:1}",
  ".cu-menu-item:hover{background:var(--cu-hover)}.cu-menu-divider{height:1px;background:var(--cu-border);margin:4px 0}",
  ".cu-search{flex:0 1 420px;margin:0 auto;display:flex;align-items:center;gap:8px;height:30px;padding:0 10px;border:1px solid var(--cu-border);border-radius:8px;background:var(--cu-side);color:var(--cu-muted)}",
  ".cu-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--cu-text);font:inherit;font-size:13px;outline:none;padding:0;box-shadow:none}",
  ".cu-search kbd{font-size:11px;color:var(--cu-muted);font-family:inherit}",
  ".cu-top-actions{display:flex;align-items:center;gap:6px}",
  ".cu-top-actions button,.cu-top-actions a{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:6px;background:none;color:var(--cu-muted);cursor:pointer}",
  ".cu-top-actions button:hover,.cu-top-actions a:hover{background:var(--cu-hover);color:var(--cu-text)}",
  ".cu-ctx{position:fixed;z-index:95;min-width:200px;padding:6px;border-radius:11px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);box-shadow:0 16px 40px rgba(9,20,44,.28)}",
  "html[data-theme=dark] .cu-ctx{background:#25262a;border-color:#3a3d44}",
  ".cu-ctx-title{margin:4px 8px 6px;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--cu-muted,#8b93a1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cu-ctx-item{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;font-size:13.5px;padding:7px 9px;border-radius:7px;cursor:pointer;text-decoration:none}",
  ".cu-ctx-item:hover{background:rgba(123,104,238,.12)}",
  ".cu-ctx-item--danger{color:#d03b3b;font-weight:600}",
  ".cu-ctx-item--go{background:#7b68ee;color:#fff;font-weight:600;text-align:center}",
  ".cu-ctx-rename{display:flex;flex-direction:column;gap:6px;padding:2px}",
  ".cu-ctx-rename input{font:inherit;font-size:13.5px;min-height:32px;padding:0 8px;border-radius:7px;border:1px solid var(--cu-border,#d5d8de);width:100%;box-sizing:border-box}",
  ".cu-link.is-drop{background:rgba(123,104,238,.22);outline:2px dashed #7b68ee;outline-offset:-2px}",
  ".cu-move-note{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:90;padding:10px 16px;border-radius:10px;background:#7b68ee;color:#fff;font-size:13.5px;font-weight:600;box-shadow:0 12px 30px rgba(9,20,44,.28)}",
  ".cu-avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#5f55ee;color:#fff;font-size:11px;font-weight:700;border:0;cursor:pointer;font-family:inherit}",
  ".cu-me{position:relative}",
  ".cu-me-menu{position:absolute;top:36px;right:0;z-index:80;min-width:220px;padding:6px;border-radius:11px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);box-shadow:0 16px 40px rgba(9,20,44,.2)}",
  "html[data-theme=dark] .cu-me-menu{background:#25262a;border-color:#3a3d44}",
  ".cu-me-who{padding:8px 10px 10px;border-bottom:1px solid var(--cu-border,#eef0f3);margin-bottom:4px;display:flex;flex-direction:column;gap:2px}",
  "html[data-theme=dark] .cu-me-who{border-color:#33363c}",
  ".cu-me-who strong{font-size:13.5px}.cu-me-who small{font-size:11.5px;color:var(--cu-muted,#656f7d);word-break:break-all}",
  ".cu-me-menu form{margin:0}",
  ".cu-me-menu .cu-menu-item{width:100%;text-align:left;border:0;background:none;font:inherit;font-size:13.5px;cursor:pointer}",
  ".cu-menu-item--danger{color:#d03b3b;font-weight:600}",
  ".cu-rail{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0;background:var(--cu-rail);border-right:1px solid var(--cu-border);overflow-y:auto}",
  ".cu-rail-item{display:flex;flex-direction:column;align-items:center;gap:3px;width:56px;padding:5px 0;border-radius:8px;color:var(--cu-muted);text-decoration:none;font-size:10px;font-weight:600}",
  ".cu-rail-icon{display:grid;place-items:center;width:32px;height:28px;border-radius:8px}",
  ".cu-rail-item:hover{color:var(--cu-text)}.cu-rail-item:hover .cu-rail-icon{background:var(--cu-hover)}",
  ".cu-rail-item.is-active{color:var(--cu-text)}.cu-rail-item.is-active .cu-rail-icon{background:var(--cu-active);color:var(--cu-accent)}",
  ".cu-rail-spacer{flex:1}",
  ".cu-sidebar{display:flex;flex-direction:column;min-height:0;background:var(--cu-side);border-right:1px solid var(--cu-border)}",
  ".cu-sidebar-head{display:flex;align-items:center;gap:8px;padding:12px 12px 8px}",
  ".cu-sidebar-head h2{flex:1;margin:0;font-size:15px;font-weight:600;color:var(--cu-text)}",
  ".cu-new{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--cu-border);border-radius:6px;color:inherit}",
  ".cu-sidebar-body{flex:1;overflow-y:auto;padding:0 8px 16px}",
  ".cu-section{padding:6px 0;border-bottom:1px solid var(--cu-border)}.cu-section:last-child{border-bottom:0}",
  ".cu-section-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 4px}",
  ".cu-section-head button{border:0;background:none;color:var(--cu-muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:0}",
  ".cu-section-head a{display:grid;place-items:center;color:var(--cu-muted)}",
  ".cu-link{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--cu-text);font:inherit;font-size:13px;text-align:left;text-decoration:none;cursor:pointer}",
  ".cu-link:hover{background:var(--cu-hover)}.cu-link.is-active{background:var(--cu-active);font-weight:600}",
  ".cu-link-icon{display:grid;place-items:center;width:18px;color:var(--cu-muted);flex:none}",
  ".cu-link-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cu-count{font-size:11px;color:var(--cu-muted)}",
  ".cu-space-avatar{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;background:#7b68ee;color:#fff;font-size:10px;font-weight:800;flex:none}",
  ".cu-tree{padding-left:14px}",
  ".cu-space[draggable=true]{cursor:grab}.cu-space[draggable=true]:active{cursor:grabbing}",
  ".cu-space.is-order-before{box-shadow:inset 0 2px 0 #7b68ee}",
  ".cu-space.is-order-after{box-shadow:inset 0 -2px 0 #7b68ee}",
  ".cu-head-actions{display:flex;align-items:center;gap:2px}",
  ".cu-head-actions button{display:grid;place-items:center;padding:3px;border-radius:5px}",
  ".cu-head-actions button:hover{background:rgba(123,104,238,.16);color:var(--cu-text)}",
  ".cu-link--quiet{opacity:.65;font-size:12.5px}",
  ".cu-sections{display:none}",
  ".cu-blurb{margin:2px 10px 10px;font-size:11.5px;line-height:1.45;color:var(--cu-muted)}",
  ".cu-group-toggle{display:flex;align-items:center;gap:5px}",
  ".cu-nav-item{align-items:flex-start;padding-top:6px;padding-bottom:6px;min-height:auto}",
  ".cu-nav-item .cu-link-icon{margin-top:1px}",
  ".cu-nav-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}",
  ".cu-nav-text small{font-size:10.5px;line-height:1.35;color:var(--cu-muted);white-space:normal}",
  ".cu-nav-item.is-active .cu-nav-text small{color:inherit;opacity:.75}",
  ".cu-readonly{display:flex;align-items:flex-start;gap:8px;margin:0 0 14px;padding:9px 12px;border:1px solid var(--cu-border);border-radius:8px;background:var(--cu-surface-2,transparent);font-size:12.5px;line-height:1.5;color:var(--cu-muted);min-width:0}",
  ".cu-readonly svg{flex:0 0 auto;margin-top:2px}",
  ".cu-crumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 14px;font-size:12.5px;color:var(--cu-muted)}",
  ".cu-crumbs a{color:inherit;text-decoration:none}",
  ".cu-crumbs a:hover{color:#7b68ee;text-decoration:underline}",
  ".cu-crumbs i{font-style:normal;opacity:.45;margin-left:6px}",
  ".cu-crumbs strong{color:var(--cu-text);font-weight:600}",
  ".cu-agent{gap:10px;min-height:34px}",
  ".cu-agent-face{position:relative;flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:linear-gradient(135deg,#7b68ee,#b06ab3);box-shadow:0 1px 3px rgba(9,20,44,.3)}",
  ".cu-agent-dot{position:absolute;right:-1px;bottom:-1px;width:8px;height:8px;border-radius:50%;background:#2ecc71;border:2px solid var(--cu-side)}",
  ".cu-agent-name{font-weight:600}",
  ".cu-agent-tag{flex:none;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 6px;border-radius:999px;background:rgba(123,104,238,.2);color:var(--cu-text)}",
  ".cu-side-new{display:flex;gap:6px;padding:4px 8px 8px}",
  ".cu-side-new input{flex:1;min-width:0;font:inherit;font-size:13px;min-height:30px;padding:0 8px;border-radius:7px;border:1px solid var(--cu-border);background:var(--cu-bg);color:var(--cu-text)}",
  ".cu-side-new button{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:0 10px;border-radius:7px;cursor:pointer}",
  ".cu-empty{margin:4px 8px;font-size:12px;color:var(--cu-muted)}",
  ".cu-main{min-width:0;min-height:0;overflow-y:auto;padding:20px 24px;background:var(--cu-bg)}",
  ".cu-backdrop{display:none}",
  ".cu-bottom{display:none}",
  ".cu-bottom-item{border:0;background:none;font:inherit;cursor:pointer}",
  ".cu-bottom-avatar{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#5f55ee;color:#fff;font-size:9px;font-weight:700}",
  "@media (max-width:900px){",
  ".cu-shell{grid-template-columns:minmax(0,1fr)}",
  ".cu-rail{display:none}",
  ".cu-mobile,.cu-close{display:grid;place-items:center}",
  ".cu-ws-button strong,.cu-search kbd,.cu-brand-text{display:none}",
  ".cu-brand{border-right:0;padding-right:0}",
  ".cu-sidebar{position:fixed;top:0;bottom:0;left:0;width:min(300px,86vw);z-index:90;transform:translateX(-105%);transition:transform .18s ease}",
  ".cu-sidebar.is-open{transform:none}",
  ".cu-backdrop{display:block;position:fixed;inset:0;z-index:85;border:0;background:rgba(0,0,0,.4)}",
  ".cu-main{padding:16px 14px 96px;min-width:0;max-width:100vw;overflow-x:hidden;-webkit-overflow-scrolling:touch}",
  ".cu-main table{display:block;overflow-x:auto;max-width:100%}",
  "/* Floating menus are sheets on a phone. Anchoring a 340px menu to a narrow button leaves a strip too",
  "   thin to read, and capping it at its parent - which is what a blanket max-width did - makes it worse. */",
  "html body .pp,html body .ip-pop,html body .mb-list,html body .lw-pop,html body .lw-rowmenu,html body .cu-ctx{",
  "  position:fixed;left:8px;right:8px;top:auto;bottom:calc(84px + env(safe-area-inset-bottom));",
  "  width:auto;min-width:0;max-width:none;max-height:56vh;overflow-y:auto;border-radius:14px}",
  "html body .pp-row,html body .ip-item,html body .mb-option,html body .lw-rowmenu-item,html body .cu-ctx-item{min-height:46px;font-size:15px}",
  "html body .pp-search,html body .mb-list input,html body .pp input{font-size:16px;min-height:44px;width:100%;box-sizing:border-box}",
  "html body .pp-list{max-height:40vh}",
  "/* Five things across a narrow phone: smaller labels rather than one falling off the edge. */",
  ".cu-bottom-item{font-size:9.5px;padding:6px 1px;gap:2px}",
  ".cu-bottom-item span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  "body{font-size:15px}",
  ".page-stack{gap:16px}",
  ".cu-main h1{font-size:21px;line-height:1.25}",
  ".cu-main h2{font-size:17px}",
  ".cu-main h3{font-size:15px}",
  ".cu-main button,.cu-main a[class],.cu-main select,.cu-main input,.cu-main textarea{min-height:42px;font-size:15px}",
  ".cu-main input,.cu-main textarea,.cu-main select{font-size:16px}",
  ".cu-link{min-height:44px;font-size:14.5px}",
  ".cu-bottom-item{min-height:56px}",
  ".cu-topbar{gap:8px;padding:0 10px}",
  ".cu-brand img{width:26px;height:26px}",
  ".cu-search{flex:1 1 auto;min-width:0;margin:0}",
  ".cu-search input::placeholder{font-size:12px}",
  ".cu-top-actions{flex:none}",
  ".cu-ask{padding:0 10px}",
  ".cu-bottom{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:70;background:var(--cu-side);border-top:1px solid var(--cu-border);padding:6px 4px calc(6px + env(safe-area-inset-bottom));}",
  ".cu-bottom-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:10px;color:var(--cu-muted);text-decoration:none;font-size:11px;font-weight:600;min-height:52px;justify-content:center}",
  ".cu-bottom-item.is-active{color:#7b68ee;background:var(--cu-active)}",
  ".cu-bottom-label{display:none}",
  ".cu-sections{display:flex;gap:6px;overflow-x:auto;padding:4px 10px 10px;margin-bottom:6px;border-bottom:1px solid var(--cu-border);scrollbar-width:none}",
  ".cu-sections::-webkit-scrollbar{display:none}",
  ".cu-section-chip{display:flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid var(--cu-border);background:none;color:var(--cu-muted);font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;min-height:38px}",
  ".cu-section-chip.is-active{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".cu-me-menu{position:fixed;top:auto;left:8px;right:8px;bottom:calc(72px + env(safe-area-inset-bottom));min-width:0;max-height:60vh;overflow-y:auto}",
  ".cu-me-menu .cu-menu-item,.cu-me-menu button{min-height:44px}",
  "}"
].join("\n");

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
