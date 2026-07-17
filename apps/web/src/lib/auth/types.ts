export type UserStatus = "PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED" | "ARCHIVED";

export type GlobalRole =
  | "SYSTEM_OWNER"
  | "ACCOUNT_APPROVER"
  | "ADMINISTRATOR"
  | "STAFF_MEMBER"
  | "READ_ONLY";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  capid: string | null;
  dutyTitle: string | null;
  status: UserStatus;
  globalRole: GlobalRole;
}

export interface AccessRequestRecord {
  id: string;
  email: string;
  fullName: string;
  capid: string | null;
  dutyTitle: string | null;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

export interface UserRecord extends AuthenticatedUser {
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  suspendedAt: string | null;
  suspendedBy: string | null;
}

export function canApproveAccounts(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ACCOUNT_APPROVER";
}

export function canManageOwners(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER";
}
