"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, MessageSquareText, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { navigationGroups, utilityNavigation } from "@/lib/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const currentLabel = useMemo(() => {
    const items = [...navigationGroups.flatMap((group) => group.items), ...utilityNavigation];
    return items.find((item) => item.href === pathname)?.label ?? "Command Center";
  }, [pathname]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="brand-mark">170</div>
          <div>
            <strong>TN-170 Oak Ridge</strong>
            <span>Squadron Operations Hub</span>
          </div>
          <button className="icon-button sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${active ? "nav-item--active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.badge ? <b>{item.badge}</b> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          {utilityNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="nav-item" onClick={() => setMobileOpen(false)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <small>Independent operational support tool</small>
        </div>
      </aside>

      {mobileOpen ? <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}

      <div className="app-shell__main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <div className="topbar__context">
              <small>TN-170</small>
              <strong>{currentLabel}</strong>
            </div>
          </div>

          <label className="global-search">
            <Search size={17} />
            <input placeholder="Search tasks, documents, people..." />
            <kbd>Ctrl K</kbd>
          </label>

          <div className="topbar__actions">
            <button className="button button--primary topbar__quick" onClick={() => setQuickAddOpen(true)}>
              <Plus size={17} />
              <span>Quick add</span>
            </button>
            <button className="icon-button icon-button--badged" aria-label="Messages">
              <MessageSquareText size={20} />
              <span>3</span>
            </button>
            <button className="icon-button icon-button--badged" aria-label="Notifications">
              <Bell size={20} />
              <span>7</span>
            </button>
            <button className="profile-button">
              <span className="profile-button__avatar">TM</span>
              <span className="profile-button__text">
                <strong>2d Lt. Maratos</strong>
                <small>Aerospace Education</small>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>

      {quickAddOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setQuickAddOpen(false)}>
          <section className="quick-add-modal" role="dialog" aria-modal="true" aria-label="Quick add" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}>
            <header>
              <div>
                <p>New operational item</p>
                <h2>Quick add</h2>
              </div>
              <button className="icon-button" onClick={() => setQuickAddOpen(false)} aria-label="Close quick add">
                <X size={20} />
              </button>
            </header>
            <div className="quick-add-grid">
              {[
                ["Task", "Assign work with a due date"],
                ["Meeting", "Build an agenda and action list"],
                ["Document", "Upload or create a controlled file"],
                ["Requirement", "Add a recurring compliance item"],
                ["Discord action", "Capture a message as work"],
                ["Funding lead", "Track a donor or grant opportunity"]
              ].map(([title, detail]) => (
                <button type="button" key={title} onClick={() => setQuickAddOpen(false)}>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
