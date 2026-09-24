"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Grid3x3,
  HelpCircle,
  Home,
  Inbox,
  LayoutDashboard,
  Bot,
  Target,
  ListChecks,
  Menu,
  Moon,
  NotebookTabs,
  Plug,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Settings,
  Star,
  Sun,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AssistantPanel } from "@/components/ai/assistant-panel";
import { CommandPalette } from "@/components/command-palette";
import { ConfirmButton } from "@/components/confirm-button";
import { PulseWidget } from "@/components/assist/pulse-widget";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { navigationGroups, utilityNavigation } from "@/lib/navigation";
import type { AuthenticatedUser } from "@/lib/auth/types";
import type { SpaceNode } from "@/lib/work/types";

export interface WorkspaceSummary {
  id: string;
  name: string;
  shortName: string;
}

const defaultWorkspaces: WorkspaceSummary[] = [{ id: "tn-170", name: "TN-170 Oak Ridge", shortName: "170" }];

type RailKey = "home" | "spaces" | "planner" | "goals" | "ai" | "docs" | "dashboards" | "more";

const railItems: Array<{ key: RailKey; label: string; href: string; icon: typeof Home }> = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "spaces", label: "Spaces", href: "/spaces", icon: Grid3x3 },
  { key: "planner", label: "Planner", href: "/calendar", icon: CalendarDays },
  { key: "goals", label: "Goals", href: "/goals", icon: Target },
  { key: "ai", label: "AI", href: "/agents", icon: Bot },
  { key: "docs", label: "Docs", href: "/documents", icon: FileText },
  { key: "dashboards", label: "Dashboard", href: "/dashboards", icon: LayoutDashboard },
  { key: "more", label: "More", href: "/staff", icon: NotebookTabs }
];

function railFor(pathname: string): RailKey {
  if (pathname.startsWith("/spaces") || pathname.startsWith("/lists")) return "spaces";
  if (pathname.startsWith("/calendar")) return "planner";
  if (pathname.startsWith("/goals")) return "goals";
  if (pathname.startsWith("/agents")) return "ai";
  if (pathname.startsWith("/documents")) return "docs";
  if (pathname.startsWith("/dashboards") || pathname.startsWith("/readiness")) return "dashboards";
  return "home";
}

export function AppShell({ children, user, workspaces, spaces, agents }: {
  children: ReactNode;
  user: AuthenticatedUser;
  workspaces?: WorkspaceSummary[];
  spaces?: SpaceNode[];
  agents?: Array<{ id: string; name: string; emoji: string; purpose: string | null; shared: boolean }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  // A task dragged from a list can be dropped on any other list here, which is the obvious way to move
  // something filed in the wrong place - and was the thing people reached for first.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Right-clicking a department or list gives the menu people expect from every other tool: rename it,
  // remove it. Without it the only way to tidy the sidebar was to go and find another page.
  const [menu, setMenu] = useState<{ kind: "space" | "list"; id: string; name: string; x: number; y: number } | null>(null);
  const [menuForm, setMenuForm] = useState<"rename" | "list" | null>(null);
  const [addingSpace, setAddingSpace] = useState(false);
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
  const [rail, setRail] = useState<RailKey>(railFor(pathname));
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
    setRail(railFor(pathname));
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
  const railTitle = railItems.find((item) => item.key === rail)?.label ?? "Home";

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

  const spacesSection = (
    <section className="cu-section">
      <div className="cu-section-head">
        <button type="button" onClick={() => toggle("spaces")}>Spaces</button>
        <span className="cu-head-actions">
          <button
            type="button"
            aria-label={everyCollapsed ? "Expand every department" : "Collapse every department"}
            title={everyCollapsed ? "Expand all" : "Collapse all"}
            onClick={toggleAllSpaces}
          >
            {everyCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
          <button type="button" aria-label="New department" title="New department" onClick={() => setAddingSpace((open) => !open)}>
            <Plus size={14} />
          </button>
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
      {collapsed.spaces ? null : (
        <>
          {navLink("/tasks", "All Tasks", <ListChecks size={15} />)}
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
                onContextMenu={(event) => openMenu(event, "space", space.id, space.name)}
                draggable
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
                  {space.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems, list.id))}
                  {space.folders.map((folder) => (
                    <div key={folder.id}>
                      <button type="button" className="cu-link" onClick={() => toggle(folder.id)}>
                        <span className="cu-link-icon">{collapsed[folder.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                        <span className="cu-link-label">{folder.name}</span>
                      </button>
                      {collapsed[folder.id] ? null : (
                        <div className="cu-tree">
                          {folder.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems, list.id))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {spaceTree.length === 0 ? <p className="cu-empty">No spaces yet.</p> : null}
        </>
      )}
    </section>
  );

  // Agents live in the sidebar the way people do, but folded away by default: a squadron with a dozen of
  // them should not lose its lists behind a wall of faces.
  // Folded by default in the sidebar, but never on the AI rail: opening AI to be shown a heading and
  // nothing else is the whole point of that rail missed.
  const agentsFolded = rail !== "ai" && (collapsed.agents ?? true);
  const agentsSection = agents && agents.length ? (
    <section className="cu-section">
      <div className="cu-section-head">
        <button type="button" onClick={() => toggle("agents")}>Agents</button>
        <span className="cu-head-actions">
          <Link href="/agents" aria-label="Manage agents" title="Manage agents"><Plus size={14} /></Link>
        </span>
      </div>
      {agentsFolded ? null : (
        <>
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
          <Link href="/agents" className="cu-link cu-link--quiet"><span className="cu-link-icon">⚙</span><span className="cu-link-label">Manage agents</span></Link>
        </>
      )}
    </section>
  ) : null;

  const hubSections = navigationGroups.map((group) => (
    <section className="cu-section" key={group.label}>
      <div className="cu-section-head">
        <button type="button" onClick={() => toggle("group-" + group.label)}>{group.label}</button>
      </div>
      {collapsed["group-" + group.label] ? null : group.items.map((item) => {
        const Icon = item.icon;
        return navLink(item.href, item.label, <Icon size={15} />);
      })}
    </section>
  ));

  return (
    <div className="cu-shell">
      <style>{shellCss}</style>

      <header className="cu-topbar">
        <button className="cu-mobile" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={18} /></button>
        <Link href="/" className="cu-brand" aria-label="TN-170 Squadron Operations Hub home">
          <Image src="/tn170-logo.png" alt="TN-170 emblem" width={30} height={30} priority />
          <span className="cu-brand-text"><strong>TN-170</strong><small>Operations Hub</small></span>
        </Link>
        <div className="cu-ws">
          <button type="button" className="cu-ws-button" onClick={() => setWorkspaceMenuOpen((open) => !open)} aria-expanded={workspaceMenuOpen} aria-haspopup="menu">
            <span className="cu-ws-avatar">{currentWorkspace.shortName}</span>
            <strong>{currentWorkspace.name}</strong>
            <ChevronDown size={14} />
          </button>
          {workspaceMenuOpen ? (
            <div className="cu-menu" role="menu">
              <p>Workspaces</p>
              {workspaceList.map((workspace) => (
                <Link key={workspace.id} href="/" role="menuitem" className="cu-menu-item" onClick={() => setWorkspaceMenuOpen(false)}>
                  <span className="cu-ws-avatar cu-ws-avatar--sm">{workspace.shortName}</span>
                  <span>{workspace.name}</span>
                  {workspace.id === currentWorkspace.id ? <Check size={14} /> : null}
                </Link>
              ))}
              <div className="cu-menu-divider" />
              <Link href="/integrations" role="menuitem" className="cu-menu-item" onClick={() => setWorkspaceMenuOpen(false)}><Plug size={14} /><span>Integrations</span></Link>
              <Link href="/settings" role="menuitem" className="cu-menu-item" onClick={() => setWorkspaceMenuOpen(false)}><Settings size={14} /><span>Settings</span></Link>
            </div>
          ) : null}
        </div>
        <CommandPalette lists={spaceTree.flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)]).map((list) => ({ id: list.id, name: list.name, openItems: list.openItems }))} />
        <AssistantPanel />
        <div className="cu-top-actions">
          <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <NotificationBell />
          <div className="cu-me">
            <button
              type="button"
              className="cu-avatar"
              title={user.fullName}
              aria-haspopup="menu"
              aria-expanded={meOpen}
              onClick={() => setMeOpen(!meOpen)}
            >
              {initials(user.fullName)}
            </button>
            {meOpen ? (
              <div className="cu-me-menu" role="menu">
                <div className="cu-me-who">
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                </div>
                <Link href="/connections" role="menuitem" className="cu-menu-item" onClick={() => setMeOpen(false)}>My connections</Link>
                <Link href="/notifications" role="menuitem" className="cu-menu-item" onClick={() => setMeOpen(false)}>Notifications</Link>
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
          <button type="button" role="menuitem" className="cu-ctx-item" onClick={() => { setPageMenu(null); setAddingSpace(true); }}>New department</button>
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

      <nav className="cu-rail" aria-label="Apps">
        {railItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className={"cu-rail-item" + (rail === item.key ? " is-active" : "")} onClick={() => setRail(item.key)}>
              <span className="cu-rail-icon"><Icon size={18} /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="cu-rail-spacer" />
        <Link href="/connections" className={"cu-rail-item" + (active("/connections") ? " is-active" : "")} title="Connect your email, files and AI">
          <span className="cu-rail-icon"><Plug size={18} /></span><span>Connect</span>
        </Link>
        <Link href="/settings" className={"cu-rail-item" + (active("/settings") ? " is-active" : "")}>
          <span className="cu-rail-icon"><Settings size={18} /></span><span>Settings</span>
        </Link>
      </nav>

      <aside className={"cu-sidebar" + (mobileOpen ? " is-open" : "")}>
        <div className="cu-sidebar-head">
          <h2>{railTitle}</h2>
          <Link href="/spaces" className="cu-new" aria-label="Create"><Plus size={14} /></Link>
          <button className="cu-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={16} /></button>
        </div>
        <div className="cu-sidebar-body">
          {rail === "home" ? (
            <>
              <section className="cu-section">
                {navLink("/notifications", "Notifications", <Inbox size={15} />)}
                {navLink("/tasks", "My tasks", <ClipboardCheck size={15} />)}
                {navLink("/calendar", "Calendar", <CalendarDays size={15} />)}
                {navLink("/start-here", "New here? Start here", <HelpCircle size={15} />)}
              </section>
              <section className="cu-section">
                <div className="cu-section-head"><button type="button" onClick={() => toggle("favorites")}>Favorites</button></div>
                {collapsed.favorites ? null : (
                  <>
                    {navLink("/", "Squadron Overview", <Star size={15} />)}
                    {spaceTree[0]?.lists[0] ? navLink("/lists/" + spaceTree[0].lists[0].id, spaceTree[0].lists[0].name, <Star size={15} />, spaceTree[0].lists[0].openItems) : null}
                  </>
                )}
              </section>
              {spacesSection}
              {agentsSection}
            </>
          ) : null}
          {rail === "spaces" ? <>{spacesSection}{agentsSection}</> : null}
          {rail === "goals" ? (
            <section className="cu-section">
              {navLink("/goals", "All goals", <Target size={15} />)}
              {navLink("/dashboards", "Squadron health", <LayoutDashboard size={15} />)}
            </section>
          ) : null}
          {rail === "ai" ? agentsSection ?? <p className="cu-empty">No agents yet. Make one on the Agents page.</p> : null}
          {rail === "planner" ? (
            <section className="cu-section">
              {navLink("/calendar", "Calendar", <CalendarDays size={15} />)}
              {navLink("/tasks", "My tasks", <ClipboardCheck size={15} />)}
            </section>
          ) : null}
          {rail === "docs" ? hubSections.filter((_, index) => navigationGroups[index].label === "The squadron") : null}
          {rail === "dashboards" ? (
            <section className="cu-section">
              {navLink("/dashboards", "Command dashboard", <LayoutDashboard size={15} />)}
              {navLink("/", "Squadron overview", <LayoutDashboard size={15} />)}
              {navLink("/readiness", "Readiness", <LayoutDashboard size={15} />)}
            </section>
          ) : null}
          {rail === "more" ? hubSections : null}
          <section className="cu-section cu-section--utility">
            {utilityNavigation.map((item) => {
              const Icon = item.icon;
              return navLink(item.href, item.label, <Icon size={15} />);
            })}
          </section>
        </div>
      </aside>

      {mobileOpen ? <button className="cu-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
      <main className="cu-main">{children}</main>

      {/* Phone navigation: the four places members actually go, always within thumb reach. */}
      <nav className="cu-bottom" aria-label="Main sections">
        <Link href="/" className={"cu-bottom-item" + (pathname === "/" ? " is-active" : "")}><Home size={20} /><span>Home</span></Link>
        <Link href="/tasks" className={"cu-bottom-item" + (active("/tasks") ? " is-active" : "")}><ClipboardCheck size={20} /><span>My Tasks</span></Link>
        <Link href="/spaces" className={"cu-bottom-item" + (active("/spaces") || active("/lists") ? " is-active" : "")}><Grid3x3 size={20} /><span>Lists</span></Link>
        <Link href="/dashboards" className={"cu-bottom-item" + (active("/dashboards") ? " is-active" : "")}><LayoutDashboard size={20} /><span>Dashboard</span></Link>
      </nav>
    </div>
  );
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
  "@media (max-width:900px){",
  ".cu-shell{grid-template-columns:minmax(0,1fr)}",
  ".cu-rail{display:none}",
  ".cu-mobile,.cu-close{display:grid;place-items:center}",
  ".cu-ws-button strong,.cu-search kbd,.cu-brand-text{display:none}",
  ".cu-brand{border-right:0;padding-right:0}",
  ".cu-sidebar{position:fixed;top:0;bottom:0;left:0;width:min(300px,86vw);z-index:90;transform:translateX(-105%);transition:transform .18s ease}",
  ".cu-sidebar.is-open{transform:none}",
  ".cu-backdrop{display:block;position:fixed;inset:0;z-index:85;border:0;background:rgba(0,0,0,.4)}",
  ".cu-main{padding:16px 16px 84px}",
  ".cu-topbar{gap:8px;padding:0 10px}",
  ".cu-brand img{width:26px;height:26px}",
  ".cu-search{flex:1 1 auto;margin:0}",
  ".cu-bottom{display:grid;grid-template-columns:repeat(4,1fr);position:fixed;left:0;right:0;bottom:0;z-index:70;background:var(--cu-side);border-top:1px solid var(--cu-border);padding:6px 4px calc(6px + env(safe-area-inset-bottom));}",
  ".cu-bottom-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:10px;color:var(--cu-muted);text-decoration:none;font-size:11px;font-weight:600;min-height:52px;justify-content:center}",
  ".cu-bottom-item.is-active{color:#7b68ee;background:var(--cu-active)}",
  "}"
].join("\n");

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
