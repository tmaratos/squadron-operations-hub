#!/usr/bin/env node
/**
 * TN-170 source-level feature parity guard.
 * This is NOT a substitute for authenticated browser/API tests: it prevents
 * routes and critical UI/API entrypoints from silently disappearing during a redesign.
 *
 * No network, credentials or live squadron records are accessed.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passes = 0;
let failures = 0;
const results = [];

function verify(label, file, tokens = []) {
  const abs = path.join(root, file);
  if (!existsSync(abs)) {
    results.push({ label, state: "FAIL", reason: "Missing source: " + file });
    failures++;
    return;
  }
  const content = readFileSync(abs, "utf8");
  const missing = tokens.filter((token) => !content.includes(token));
  if (missing.length) {
    results.push({ label, state: "FAIL", reason: "Missing entrypoint(s): " + missing.join(", ") });
    failures++;
  } else {
    results.push({ label, state: "PASS", reason: file });
    passes++;
  }
}

const app = "src/app/(app)/";
const routes = [
  ["Home", "", ["CommandDashboard"]],
  ["My tasks", "tasks", ["MyTasks"]],
  ["Workspaces", "spaces", ["SpaceManager"]],
  ["Task detail", "lists/[listId]", ["ListWorkspace"]],
  ["Task calendar", "calendar", ["CalendarPage"]],
  ["Goals", "goals", ["GoalsBoard"]],
  ["AI agents", "agents", ["AgentsBoard"]],
  ["Documents", "documents", ["DocumentsPage"]],
  ["Command dashboards", "dashboards", ["DashboardEditor"]],
  ["Readiness", "readiness", ["Readiness"]],
  ["Compliance", "compliance", ["CompliancePage"]],
  ["Communications", "communications", ["CommunicationsPage"]],
  ["Squadron members", "staff", ["StaffPage"]],
  ["Duties", "duties", ["DutiesBoard"]],
  ["Professional development", "development", ["DevelopmentBoard"]],
  ["Assets", "assets", ["AssetsPage"]],
  ["Finance", "finance", ["FinanceTracker"]],
  ["Connections", "connections", ["ConnectionsBoard"]],
  ["Integrations", "integrations", ["IntegrationsBoard", "CapwatchCard"]],
  ["Settings", "settings", ["SquadronEmail", "DriveServiceAccount"]],
  ["Audit history", "audit", ["AuditPage"]],
  ["User administration", "admin/users", ["UserAdministration"]],
  ["Notifications", "notifications", ["NotificationsPage"]],
  ["New member onboarding", "start-here", ["PageHeader"]]
];

for (const [label, route, tokens] of routes) {
  verify("Route: " + label, app + (route ? route + "/" : "") + "page.tsx", tokens);
}

const capabilities = [
  ["Personal work and inline edits", "src/components/work/my-tasks.tsx", ["InlinePriority", "InlineAssignee", "picked", "search"]],
  ["Task details and subtasks", "src/components/work/list-workspace.tsx", ["Subtasks", "Description", "tp-props"]],
  ["Google Drive file CRUD", "src/components/drive/drive-browser.tsx", ["createFolder(", "rename(", "remove(", "/api/drive/files", "/api/drive/download/"]],
  ["Compliance automation controls", "src/modules/compliance/components/compliance-page.tsx", ["createRequirement(", "setStatus(", "ACTIVE", "PAUSED"]],
  ["Finance ledger and approvals", "src/components/finance/finance-tracker.tsx", ["ledger", "owed", "budget", "committee"]],
  ["Squadron roster and member search", "src/modules/staff/components/staff-page.tsx", ["memberSearch", "matchingMembers"]],
  ["CAPWATCH sync/credential security", "src/components/integrations/capwatch-card.tsx", ["/api/capwatch/sync", "/api/integrations/capwatch", "type={showTyped ?"]],
  ["Account role management", "src/components/admin/user-administration.tsx", ["SET_ROLE", "statusFilter", "visibleUsers"]],
  ["Development progression", "src/components/work/development-board.tsx", ["/api/development", "matchingMembers", "removeStep"]],
  ["Audit read-only explorer", "src/modules/audit/components/audit-explorer.tsx", ["filter(", "read-only", "search"]],
  ["Command editor preserved", "src/app/(app)/dashboards/page.tsx", ["DashboardEditor", "cd-kpis", "cd-switch"]],
  ["AI assistant preserved", "src/components/app-shell.tsx", ["Assistant"]],
  ["Authentication gates", "src/lib/auth/session.ts", ["requireUser()", "requireRole(", "getCurrentUser()"]],
  ["Notifications settings", "src/components/settings/squadron-email.tsx", ["/api/settings/notifications"]],
  ["Mobile and desktop shell", "src/components/operations-experience.ts", ["max-width: 900px", "cu-sidebar", "cu-bottom"]],
  ["Task-based navigation", "src/lib/navigation.ts", ["sections:", "SectionKey", "NavigationItem"]]
];

for (const [label, file, tokens] of capabilities) verify("Capability: " + label, file, tokens);

// Every canonical in-app route linked from the navigation map must resolve.
// External links, local anchors and dynamic item links are checked separately.
const nav = readFileSync(path.join(root, "src/lib/navigation.ts"), "utf8");
const hrefs = [...nav.matchAll(/\bhref:\s*"(\/[^"]*)"/g)].map((m) => m[1]);
for (const href of new Set(hrefs)) {
  const base = href.split(/[?#]/)[0];
  const route = base === "/" ? "" : base.slice(1);
  verify("Navigation target: " + href, app + (route ? route + "/" : "") + "page.tsx");
}

const output = {
  scope: "static-route-and-entrypoint-guard",
  checked: passes + failures,
  passed: passes,
  failed: failures,
  results
};
if (process.env.TN170_TEST_JSON === "1") console.log(JSON.stringify(output, null, 2));
else {
  for (const result of results) console.log((result.state === "PASS" ? "✓ " : "✗ ") + result.label + (result.state === "FAIL" ? ": " + result.reason : ""));
  console.log("\n" + passes + "/" + (passes + failures) + " checks passed.");
}
if (failures) {
  console.error("Feature-parity source guard failed. Restore or remap missing capabilities before merging.");
  process.exitCode = 1;
}
