import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  BookOpenCheck,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  FileText,
  Gauge,
  GraduationCap,
  HandCoins,
  History,
  House,
  Megaphone,
  MessageSquareText,
  NotebookTabs,
  PackageCheck,
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
    label: "Command",
    items: [
      { label: "Command Center", href: "/", icon: House },
      { label: "Tasks and Suspenses", href: "/tasks", icon: ClipboardCheck, badge: "23" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Meetings", href: "/meetings", icon: NotebookTabs },
      { label: "Readiness", href: "/readiness", icon: Gauge },
      { label: "Inspections", href: "/inspections", icon: ShieldCheck },
      { label: "Reports", href: "/reports", icon: FileBarChart }
    ]
  },
  {
    label: "People and continuity",
    items: [
      { label: "Staff", href: "/staff", icon: Users },
      { label: "Compliance", href: "/compliance", icon: BookOpenCheck },
      { label: "Documents", href: "/documents", icon: FileText },
      { label: "Process Library", href: "/processes", icon: Workflow },
      { label: "Audit Log", href: "/audit", icon: History }
    ]
  },
  {
    label: "Staff sections",
    items: [
      { label: "Finance and Funding", href: "/finance", icon: BadgeDollarSign },
      { label: "Logistics", href: "/logistics", icon: PackageCheck },
      { label: "Safety", href: "/safety", icon: ShieldCheck },
      { label: "Aerospace Education", href: "/aerospace", icon: GraduationCap },
      { label: "Cadet Programs", href: "/cadet-programs", icon: Sparkles },
      { label: "Emergency Services", href: "/emergency-services", icon: Siren },
      { label: "Communications", href: "/communications", icon: Radio },
      { label: "Public Affairs", href: "/public-affairs", icon: Megaphone },
      { label: "Recruiting", href: "/recruiting", icon: Building2 }
    ]
  }
];

export const utilityNavigation: NavigationItem[] = [
  { label: "User Administration", href: "/admin/users", icon: UserCog },
  { label: "Notifications", href: "/notifications", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings }
];
