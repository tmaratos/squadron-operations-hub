"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ListChecks,
  Menu,
  Moon,
  NotebookTabs,
  Plug,
  Plus,
  Settings,
  Star,
  Sun,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AssistantPanel } from "@/components/ai/assistant-panel";
import { CommandPalette } from "@/components/command-palette";
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

type RailKey = "home" | "spaces" | "planner" | "docs" | "dashboards" | "more";

const railItems: Array<{ key: RailKey; label: string; href: string; icon: typeof Home }> = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "spaces", label: "Spaces", href: "/spaces", icon: Grid3x3 },
  { key: "planner", label: "Planner", href: "/calendar", icon: CalendarDays },
  { key: "docs", label: "Docs", href: "/documents", icon: FileText },
  { key: "dashboards", label: "Dashboard", href: "/dashboards", icon: LayoutDashboard },
  { key: "more", label: "More", href: "/staff", icon: NotebookTabs }
];

function railFor(pathname: string): RailKey {
  if (pathname.startsWith("/spaces") || pathname.startsWith("/lists")) return "spaces";
  if (pathname.startsWith("/calendar")) return "planner";
  if (pathname.startsWith("/documents")) return "docs";
  if (pathname.startsWith("/dashboards") || pathname.startsWith("/readiness")) return "dashboards";
  return "home";
}

export function AppShell({ children, user, workspaces, spaces }: { children: ReactNode; user: AuthenticatedUser; workspaces?: WorkspaceSummary[]; spaces?: SpaceNode[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [rail, setRail] = useState<RailKey>(railFor(pathname));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const workspaceList = workspaces?.length ? workspaces : defaultWorkspaces;
  const currentWorkspace = workspaceList[0];
  const spaceTree = spaces ?? [];

  useEffect(() => {
    const saved = localStorage.getItem("hub-theme");
    const nextTheme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    setRail(railFor(pathname));
    setMobileOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("hub-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  const toggle = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const railTitle = railItems.find((item) => item.key === rail)?.label ?? "Home";

  const navLink = (href: string, label: string, icon: ReactNode, count?: number | string) => (
    <Link key={href + label} href={href} className={"cu-link" + (active(href) ? " is-active" : "")}>
      <span className="cu-link-icon">{icon}</span>
      <span className="cu-link-label">{label}</span>
      {count !== undefined && count !== 0 ? <span className="cu-count">{count}</span> : null}
    </Link>
  );

  const spacesSection = (
    <section className="cu-section">
      <div className="cu-section-head">
        <button type="button" onClick={() => toggle("spaces")}>Spaces</button>
        <Link href="/spaces" aria-label="Manage spaces"><Plus size={14} /></Link>
      </div>
      {collapsed.spaces ? null : (
        <>
          {navLink("/tasks", "All Tasks", <ListChecks size={15} />)}
          {spaceTree.map((space) => (
            <div key={space.id}>
              <button type="button" className="cu-link cu-space" onClick={() => toggle(space.id)}>
                <span className="cu-space-avatar">{space.name.slice(0, 1).toUpperCase()}</span>
                <span className="cu-link-label">{space.name}</span>
                {collapsed[space.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
              {collapsed[space.id] ? null : (
                <div className="cu-tree">
                  {space.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems))}
                  {space.folders.map((folder) => (
                    <div key={folder.id}>
                      <button type="button" className="cu-link" onClick={() => toggle(folder.id)}>
                        <span className="cu-link-icon">{collapsed[folder.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                        <span className="cu-link-label">{folder.name}</span>
                      </button>
                      {collapsed[folder.id] ? null : (
                        <div className="cu-tree">
                          {folder.lists.map((list) => navLink("/lists/" + list.id, list.name, <ListChecks size={14} />, list.openItems))}
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
          <span className="cu-avatar" title={user.fullName}>{initials(user.fullName)}</span>
        </div>
      </header>

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
            </>
          ) : null}
          {rail === "spaces" ? spacesSection : null}
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
  ".cu-avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#5f55ee;color:#fff;font-size:11px;font-weight:700}",
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
