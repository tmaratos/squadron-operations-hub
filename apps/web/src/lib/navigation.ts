import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Compass,
  FileText,
  Gauge,
  Grid3x3,
  History,
  Home,
  LayoutDashboard,
  Link2,
  Plug,
  Settings,
  ShieldCheck,
  Target,
  UserCog,
  Users
} from "lucide-react";

// The one map of the app.
//
// Everything a member can reach appears here exactly once, with one name and one address. That is the whole
// point: the Hub previously offered "All lists" and "Spaces" for the same page, "Squadron health" and
// "Dashboard" for another, and put People and Compliance inside Docs - so nobody could say where anything
// lived, only where they happened to have found it once.
//
// A capability may still be linked from a card, a search result or a breadcrumb. What it may not have is a
// second home in this menu.

export type SectionKey =
  | "home"
  | "spaces"
  | "planner"
  | "goals"
  | "ai"
  | "docs"
  | "command"
  | "squadron"
  | "connect"
  | "settings";

export interface NavigationItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Said in the sidebar, so somebody can tell the difference without opening it first. */
  hint?: string;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export interface Section {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  /** Where the section itself goes when its icon is pressed. */
  href: string;
  /** One line, shown at the top of the section, answering "what is this part of the app for". */
  blurb: string;
  groups: NavigationGroup[];
  /** Spaces and AI grow their own trees from the squadron's data. */
  dynamic?: "spaces" | "agents";
}

export const sections: Section[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    href: "/",
    blurb: "Your own work and what is coming up.",
    groups: [
      {
        label: "Yours",
        items: [
          { label: "Overview", href: "/", icon: Home, hint: "What needs you today" },
          { label: "My tasks", href: "/tasks", icon: ClipboardCheck, hint: "Everything assigned to you" },
          { label: "Notifications", href: "/notifications", icon: Bell, hint: "What the Hub told you" },
          { label: "Start here", href: "/start-here", icon: Compass, hint: "New to the Hub" }
        ]
      }
    ]
  },
  {
    key: "spaces",
    label: "Spaces",
    icon: Grid3x3,
    href: "/spaces",
    blurb: "The squadron's work, by department and list.",
    dynamic: "spaces",
    groups: [
      {
        label: "All work",
        items: [
          { label: "All tasks", href: "/tasks", icon: ClipboardCheck, hint: "Across every list" },
          { label: "Departments and lists", href: "/spaces", icon: Grid3x3, hint: "Add, rename, reorganise" }
        ]
      }
    ]
  },
  {
    key: "planner",
    label: "Planner",
    icon: CalendarDays,
    href: "/calendar",
    blurb: "When things happen, and what repeats.",
    groups: [
      {
        label: "Dates",
        items: [
          { label: "Calendar", href: "/calendar", icon: CalendarDays, hint: "Work by date" },
          { label: "Deadlines", href: "/tasks?due=next14", icon: ClipboardCheck, hint: "Due in the next fortnight" },
          { label: "Overdue", href: "/tasks?due=overdue", icon: ClipboardCheck, hint: "Past its date and still open" }
        ]
      }
    ]
  },
  {
    key: "goals",
    label: "Goals",
    icon: Target,
    href: "/goals",
    blurb: "What the squadron is trying to achieve.",
    groups: [
      {
        label: "Goals",
        items: [{ label: "All goals", href: "/goals", icon: Target, hint: "This year and beyond" }]
      }
    ]
  },
  {
    key: "ai",
    label: "AI",
    icon: Bot,
    href: "/agents",
    blurb: "Assistants the squadron keeps.",
    dynamic: "agents",
    groups: [
      {
        label: "Assistants",
        items: [{ label: "Manage agents", href: "/agents", icon: Bot, hint: "Shared and personal" }]
      }
    ]
  },
  {
    key: "docs",
    label: "Docs",
    icon: FileText,
    href: "/documents",
    blurb: "How the squadron does things, and the papers it does them with.",
    groups: [
      {
        label: "Documents",
        items: [
          { label: "Squadron files", href: "/documents", icon: FileText, hint: "The shared drive" },
          { label: "CAP references", href: "/documents?folder=references", icon: FileText, hint: "Regulations and forms" }
        ]
      }
    ]
  },
  {
    key: "command",
    label: "Command",
    icon: LayoutDashboard,
    href: "/dashboards",
    blurb: "How the squadron is doing, and whether it would pass.",
    groups: [
      {
        label: "Command view",
        items: [
          { label: "Command dashboard", href: "/dashboards", icon: LayoutDashboard, hint: "Open work, overdue, unowned" },
          { label: "Readiness", href: "/readiness", icon: Gauge, hint: "How each functional area is scoring" },
          { label: "Compliance", href: "/compliance", icon: ShieldCheck, hint: "Requirements and the evidence for them" },
          { label: "Announcements", href: "/communications", icon: Bell, hint: "What has been said to the squadron" }
        ]
      }
    ]
  },
  {
    key: "squadron",
    label: "Squadron",
    icon: Users,
    href: "/staff",
    blurb: "Who is here, and who owns what.",
    groups: [
      {
        label: "People",
        items: [
          { label: "People and positions", href: "/staff", icon: Users, hint: "The organisation chart" },
          { label: "Who does what", href: "/duties", icon: ClipboardCheck, hint: "Recurring duties by role" },
          { label: "Committees", href: "/staff#committees", icon: Users, hint: "Finance, awards, membership" },
          { label: "Professional development", href: "/development", icon: Gauge, hint: "Levels and what comes next" }
        ]
      }
    ]
  },
  {
    key: "connect",
    label: "Connect",
    icon: Plug,
    href: "/connections",
    blurb: "What the Hub is joined to.",
    groups: [
      {
        label: "Connections",
        items: [
          { label: "My connections", href: "/connections", icon: Link2, hint: "Gmail, Drive, and what they are used for" },
          { label: "Integrations", href: "/integrations", icon: Plug, hint: "What the squadron has switched on" }
        ]
      }
    ]
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
    blurb: "The Hub itself.",
    groups: [
      {
        label: "Running the Hub",
        items: [
          { label: "Settings", href: "/settings", icon: Settings, hint: "Preferences and behaviour" },
          { label: "Members and access", href: "/admin/users", icon: UserCog, hint: "Who may sign in, and as what" },
          { label: "History", href: "/audit", icon: History, hint: "What changed, and who changed it" }
        ]
      }
    ]
  }
];

/**
 * Which section a path belongs to.
 *
 * Longest match wins, so /staff does not claim /start-here. Readiness belongs to Command and not to the
 * dashboard: it used to light up "Dashboard" in the rail while showing the Readiness page, which reads as
 * having been redirected somewhere you did not ask for.
 */
export function sectionFor(pathname: string): SectionKey {
  const routes: Array<[string, SectionKey]> = [
    ["/tasks", "home"],
    ["/notifications", "home"],
    ["/start-here", "home"],
    ["/spaces", "spaces"],
    ["/lists", "spaces"],
    ["/calendar", "planner"],
    ["/goals", "goals"],
    ["/agents", "ai"],
    ["/documents", "docs"],
    ["/dashboards", "command"],
    ["/readiness", "command"],
    ["/compliance", "command"],
    ["/communications", "command"],
    ["/staff", "squadron"],
    ["/duties", "squadron"],
    ["/development", "squadron"],
    ["/connections", "connect"],
    ["/integrations", "connect"],
    ["/settings", "settings"],
    ["/admin", "settings"],
    ["/audit", "settings"]
  ];
  const hit = routes
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?"))
    .sort((left, right) => right[0].length - left[0].length)[0];
  return hit ? hit[1] : "home";
}

export function sectionByKey(key: SectionKey): Section {
  return sections.find((section) => section.key === key) ?? sections[0];
}

/** The trail to where somebody is, for the line above the page. */
export function breadcrumbFor(pathname: string): Array<{ label: string; href: string }> {
  const section = sectionByKey(sectionFor(pathname));
  const trail: Array<{ label: string; href: string }> = [{ label: section.label, href: section.href }];
  const item = section.groups
    .flatMap((group) => group.items)
    .find((entry) => entry.href.split("?")[0] === pathname);
  if (item && item.href !== section.href) trail.push({ label: item.label, href: item.href });
  return trail;
}

// Kept so older imports keep working while the shell is moved across.
export const navigationGroups: NavigationGroup[] = sections.flatMap((section) => section.groups);
export const utilityNavigation: NavigationItem[] = [];
