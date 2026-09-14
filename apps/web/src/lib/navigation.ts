import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  FileText,
  Gauge,
  GraduationCap,
  History,
  LayoutGrid,
  Megaphone,
  NotebookTabs,
  PackageCheck,
  Plug,
  Radio,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  UserCog,
  Users,
  Workflow
} from "lucide-react";

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
      { label: "Spaces & Lists", href: "/spaces", icon: LayoutGrid },
      { label: "Tasks & Assignments", href: "/tasks", icon: ClipboardCheck, badge: "18" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Meetings", href: "/meetings", icon: NotebookTabs },
      { label: "Reports", href: "/reports", icon: FileBarChart },
      { label: "Inspections", href: "/inspections", icon: ShieldCheck },
      { label: "Readiness", href: "/readiness", icon: Gauge }
    ]
  },
  {
    label: "People & Programs",
    items: [
      { label: "People & Roles", href: "/staff", icon: Users },
      { label: "Aerospace Education", href: "/aerospace", icon: GraduationCap },
      { label: "Cadet Programs", href: "/cadet-programs", icon: Sparkles },
      { label: "Emergency Services", href: "/emergency-services", icon: Siren },
      { label: "Safety", href: "/safety", icon: ShieldCheck },
      { label: "Communications", href: "/communications", icon: Radio },
      { label: "Public Affairs", href: "/public-affairs", icon: Megaphone },
      { label: "Recruiting & Retention", href: "/recruiting", icon: Building2 }
    ]
  },
  {
    label: "Administration",
    items: [
      { label: "Finance", href: "/finance", icon: BadgeDollarSign },
      { label: "Logistics", href: "/logistics", icon: PackageCheck },
      { label: "Member Access", href: "/admin/users", icon: UserCog }
    ]
  },
  {
    label: "Knowledge",
    items: [
      { label: "Document Library", href: "/documents", icon: FileText },
      { label: "Process Library", href: "/processes", icon: Workflow },
      { label: "Forms & Templates", href: "/documents", icon: BookOpenCheck }
    ]
  }
];

export const utilityNavigation: NavigationItem[] = [
  { label: "Action Center", href: "/notifications", icon: Activity },
  { label: "Integrations", href: "/integrations", icon: Plug },
  { label: "History", href: "/audit", icon: History },
  { label: "System Settings", href: "/settings", icon: Settings }
];
