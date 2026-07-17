export type Permission =
  | "command.view"
  | "command.manage"
  | "tasks.view"
  | "tasks.manage"
  | "staff.view"
  | "staff.manage"
  | "meetings.view"
  | "meetings.manage"
  | "documents.view"
  | "documents.manage"
  | "processes.view"
  | "processes.manage"
  | "compliance.view"
  | "compliance.manage"
  | "finance.view"
  | "finance.manage"
  | "logistics.view"
  | "logistics.manage"
  | "safety.view"
  | "safety.manage"
  | "aerospace.view"
  | "aerospace.manage"
  | "cadetPrograms.view"
  | "cadetPrograms.manage"
  | "emergencyServices.view"
  | "emergencyServices.manage"
  | "communications.view"
  | "communications.manage"
  | "discord.view"
  | "discord.manage"
  | "inspections.view"
  | "inspections.manage"
  | "reports.view"
  | "reports.manage"
  | "settings.manage"
  | "audit.view";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  squadronId: string;
  permissions: Permission[];
}

export function hasPermission(user: AuthenticatedUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function hasAnyPermission(user: AuthenticatedUser, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}
