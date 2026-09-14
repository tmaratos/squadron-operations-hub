"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Check, ChevronDown, ChevronsUpDown, Compass, HelpCircle, LayoutDashboard, Menu, Moon, Plug, Search, Settings, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { navigationGroups, utilityNavigation } from "@/lib/navigation";
import type { AuthenticatedUser } from "@/lib/auth/types";

export interface WorkspaceSummary {
  id: string;
  name: string;
  shortName: string;
}

const defaultWorkspaces: WorkspaceSummary[] = [{ id: "tn-170", name: "TN-170 Oak Ridge", shortName: "170" }];

export function AppShell({ children, user, workspaces }: { children: ReactNode; user: AuthenticatedUser; workspaces?: WorkspaceSummary[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceList = workspaces?.length ? workspaces : defaultWorkspaces;
  const currentWorkspace = workspaceList[0];
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("hub-theme");
    const nextTheme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function selectTheme(nextTheme: "light" | "dark") {
    setTheme(nextTheme);
    localStorage.setItem("hub-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  return (
    <div className="app-shell hub-shell">
      <style>{workspaceCss}</style>
      <header className="hub-topbar">
        <button className="hub-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
        <Link className="hub-brand" href="/">
          <Image src="/tn170-logo.png" alt="TN-170 emblem" width={46} height={46} priority />
          <span><strong>TN-170 Oak Ridge Composite SQ</strong><small>Squadron Operations Hub</small></span>
        </Link>
        <label className="hub-search"><Search size={19} /><input aria-label="Search Hub" placeholder="Search documents, forms, contacts, and more..." /><kbd>Ctrl + K</kbd></label>
        <div className="hub-top-actions">
          <div className="theme-switch" role="group" aria-label="Color theme">
            <button className={theme === "light" ? "is-active" : ""} onClick={() => selectTheme("light")} aria-pressed={theme === "light"}>Light</button>
            <span>{theme === "light" ? <Sun size={16} /> : <Moon size={15} />}</span>
            <button className={theme === "dark" ? "is-active" : ""} onClick={() => selectTheme("dark")} aria-pressed={theme === "dark"}>Dark</button>
          </div>
          <Link href="/notifications" className="hub-alert" aria-label="Notifications"><Bell size={21} /><b>3</b></Link>
          <button className="hub-profile">
            <span>{initials(user.fullName)}</span>
            <span><strong>{user.fullName}</strong><small>{user.dutyTitle || formatRole(user.globalRole)}</small></span>
            <ChevronDown size={16} />
          </button>
        </div>
      </header>

      <aside className={`hub-sidebar ${mobileOpen ? "hub-sidebar--open" : ""}`}>
        <button className="hub-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        <div className="ws-switcher">
          <button type="button" className="ws-switcher__button" onClick={() => setWorkspaceMenuOpen((open) => !open)} aria-expanded={workspaceMenuOpen} aria-haspopup="menu">
            <span className="ws-avatar">{currentWorkspace.shortName}</span>
            <span className="ws-switcher__name"><strong>{currentWorkspace.name}</strong><small>Workspace</small></span>
            <ChevronsUpDown size={15} />
          </button>
          {workspaceMenuOpen ? (
            <div className="ws-menu" role="menu">
              <p>Workspaces</p>
              {workspaceList.map((workspace) => (
                <Link key={workspace.id} href="/" role="menuitem" className={"ws-menu__item" + (workspace.id === currentWorkspace.id ? " is-active" : "")} onClick={() => setWorkspaceMenuOpen(false)}>
                  <span className="ws-avatar ws-avatar--sm">{workspace.shortName}</span><span>{workspace.name}</span>{workspace.id === currentWorkspace.id ? <Check size={14} /> : null}
                </Link>
              ))}
              <div className="ws-menu__divider" />
              <Link href="/integrations" role="menuitem" className="ws-menu__item" onClick={() => setWorkspaceMenuOpen(false)}><Plug size={14} /><span>Integrations</span></Link>
              <Link href="/settings" role="menuitem" className="ws-menu__item" onClick={() => setWorkspaceMenuOpen(false)}><Settings size={14} /><span>Workspace settings</span></Link>
            </div>
          ) : null}
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/" className={`hub-nav-item ${pathname === "/" ? "is-active" : ""}`} onClick={() => setMobileOpen(false)}>
            <LayoutDashboard size={18} /><span>Squadron Overview</span>
          </Link>
          <Link href="/start-here" className={`hub-nav-item ${pathname === "/start-here" ? "is-active" : ""}`} onClick={() => setMobileOpen(false)}>
            <Compass size={18} /><span>Start Here</span>
          </Link>
          {navigationGroups.map((group) => (
            <section className="hub-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link href={item.href} key={`${group.label}-${item.label}`} className={`hub-nav-item ${pathname === item.href ? "is-active" : ""}`} onClick={() => setMobileOpen(false)}>
                    <Icon size={16} /><span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
          <div className="hub-nav-divider" />
          {utilityNavigation.map((item) => {
            const Icon = item.icon;
            return <Link href={item.href} key={item.href} className={`hub-nav-item ${pathname === item.href ? "is-active" : ""}`}><Icon size={16} /><span>{item.label}</span></Link>;
          })}
          <Link href="/settings" className="hub-nav-item"><HelpCircle size={16} /><span>Help & Support</span></Link>
        </nav>
        <div className="hub-sidebar-status">
          <ShieldMark />
          <span><strong>TN-170 v2.0.0</strong><small>Together • Prepared • Successful</small></span>
        </div>
      </aside>

      {mobileOpen ? <button className="hub-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
      <main className="hub-main">{children}</main>
    </div>
  );
}

const workspaceCss = [
  ".ws-switcher{position:relative;margin:0 0 12px}",
  ".ws-switcher__button{width:100%;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 8px;border:1px solid var(--border-soft);border-radius:10px;background:var(--surface);color:inherit;text-align:left;cursor:pointer}",
  ".ws-switcher__button:hover{background:var(--surface-high)}",
  ".ws-avatar{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(135deg,#0969f0,#6d4aff);color:#fff;font-size:11px;font-weight:800}",
  ".ws-avatar--sm{width:24px;height:24px;border-radius:6px;font-size:9px}",
  ".ws-switcher__name{min-width:0;display:grid;gap:2px}.ws-switcher__name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.ws-switcher__name small{color:var(--muted);font-size:10px}",
  ".ws-menu{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:70;display:grid;gap:2px;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow)}",
  ".ws-menu p{margin:2px 6px 6px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}",
  ".ws-menu__item{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:7px;color:inherit;font-size:12px}.ws-menu__item span:nth-child(2){flex:1}.ws-menu__item:hover,.ws-menu__item.is-active{background:var(--surface-high)}",
  ".ws-menu__divider{height:1px;margin:6px 2px;background:var(--border-soft)}"
].join("\n");

function ShieldMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5.1-3.2 9.2-8 11-4.8-1.8-8-5.9-8-11V5l8-3Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatRole(role: string): string {
  return role.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
