import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  BookOpenCheck,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ContactRound,
  FileBarChart,
  FileText,
  FolderCog,
  Gauge,
  GraduationCap,
  History,
  House,
  Megaphone,
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
    label: "Operations",
    items: [
      { label: "Command Center", href: "/", icon: House },
      { label: "Tasks & Assignments", href: "/tasks", icon: ClipboardCheck, badge: "18" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Meetings", href: "/meetings", icon: NotebookTabs },
      { label: "Reports", href: "/reports", icon: FileBarChart },
      { label: "Inspections", href: "/inspections", icon: ShieldCheck },
      { label: "Readiness", href: "/readiness", icon: Gauge },
      { label: "Connected Apps", href: "/communications", icon: Boxes, badge: "NEW" }
    ]
  },
  {
    label: "Staff Sections",
    items: [
      { label: "Administration", href: "/staff", icon: Users },
      { label: "Personnel", href: "/admin/users", icon: UserCog },
      { label: "Finance", href: "/finance", icon: BadgeDollarSign },
      { label: "Logistics", href: "/logistics", icon: PackageCheck },
      { label: "Safety", href: "/safety", icon: ShieldCheck },
      { label: "Aerospace Education", href: "/aerospace", icon: GraduationCap },
      { label: "Cadet Programs", href: "/cadet-programs", icon: Sparkles },
      { label: "Emergency Services", href: "/emergency-services", icon: Siren },
      { label: "Communications", href: "/communications", icon: Radio },
      { label: "IT / Systems", href: "/settings", icon: FolderCog },
      { label: "Public Affairs", href: "/public-affairs", icon: Megaphone },
      { label: "Recruiting & Retention", href: "/recruiting", icon: Building2 }
    ]
  },
  {
    label: "Resources",
    items: [
      { label: "Document Library", href: "/documents", icon: FileText },
      { label: "Process Library", href: "/processes", icon: Workflow },
      { label: "Forms & Templates", href: "/documents", icon: BookOpenCheck },
      { label: "Contacts Directory", href: "/staff", icon: ContactRound },
      { label: "Equipment & Supply", href: "/logistics", icon: Boxes }
    ]
  }
];

export const utilityNavigation: NavigationItem[] = [
  { label: "Audit Log", href: "/audit", icon: History },
  { label: "Notifications", href: "/notifications", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings }
];
