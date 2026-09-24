import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Settings,
  ShieldCheck,
  UserCog,
  Users
} from "lucide-react";

// Every entry here goes somewhere real. Departments are not listed: they are spaces in the sidebar, made by
// the squadron, so this menu does not have to be edited every time the squadron organises itself differently.

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Work",
    items: [
      { label: "My tasks", href: "/tasks", icon: ClipboardCheck },
      { label: "All lists", href: "/spaces", icon: LayoutGrid },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Squadron health", href: "/dashboards", icon: LayoutDashboard }
    ]
  },
  {
    label: "The squadron",
    items: [
      { label: "People and positions", href: "/staff", icon: Users },
      { label: "Who does what", href: "/duties", icon: ClipboardCheck },
      { label: "Professional development", href: "/development", icon: Gauge },
      { label: "Readiness", href: "/readiness", icon: Gauge },
      { label: "Compliance", href: "/compliance", icon: ShieldCheck },
      { label: "Files", href: "/documents", icon: FileText }
    ]
  },
  {
    label: "Yours",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "My connections", href: "/connections", icon: Link2 }
    ]
  },
  {
    label: "Running the Hub",
    items: [
      { label: "Members and access", href: "/admin/users", icon: UserCog },
      { label: "History", href: "/audit", icon: History },
      { label: "Settings", href: "/settings", icon: Settings }
    ]
  }
];

export const utilityNavigation: NavigationItem[] = [];
