export type Permission =
  | "command.view"
  | "command.manage"
  | "tasks.view"
  | "tasks.manage"
  | "documents.view"
  | "documents.manage"
  | "compliance.view"
  | "compliance.manage"
  | "discord.view"
  | "discord.manage"
  | "audit.view";

export interface AuthenticatedUser {
  id: string;
  email: string;
  squadronId: string;
  permissions: Permission[];
}

export function hasPermission(
  user: AuthenticatedUser,
  permission: Permission
): boolean {
  return user.permissions.includes(permission);
}
