"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, HelpCircle, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { navigationGroups, utilityNavigation } from "@/lib/navigation";
import type { AuthenticatedUser } from "@/lib/auth/types";

export function AppShell({ children, user }: { children: ReactNode; user: AuthenticatedUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
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
        <nav aria-label="Primary navigation">
          <Link href="/" className={`hub-nav-item ${pathname === "/" ? "is-active" : ""}`} onClick={() => setMobileOpen(false)}>
            {(() => { const HomeIcon = navigationGroups[0].items[0].icon; return <HomeIcon size={18} />; })()}<span>Home</span>
          </Link>
          {navigationGroups.slice(1).map((group) => (
            <section className="hub-nav-group" key={group.label}>
              <p>{group.label === "Staff Sections" ? "Operations" : group.label}</p>
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

function ShieldMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5.1-3.2 9.2-8 11-4.8-1.8-8-5.9-8-11V5l8-3Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatRole(role: string): string {
  return role.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
