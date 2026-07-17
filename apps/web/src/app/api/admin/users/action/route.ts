import { NextResponse } from "next/server";
import { z } from "zod";
import {
  countActiveApprovers,
  countActiveSystemOwners,
  createApprovedUserFromRequest,
  findAccessRequestById,
  findUserById,
  rejectAccessRequest,
  updateUserRole,
  updateUserStatus
} from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts, canManageOwners, type GlobalRole } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { sendApprovalEmail } from "@/lib/email/mailgun";
import { assertSameOrigin } from "@/lib/security/origin";

const schema = z.object({
  action: z.enum(["APPROVE_REQUEST", "REJECT_REQUEST", "SET_ROLE", "SUSPEND", "REACTIVATE", "ARCHIVE"]),
  targetId: z.string().uuid(),
  role: z.enum(["SYSTEM_OWNER", "ACCOUNT_APPROVER", "ADMINISTRATOR", "STAFF_MEMBER", "READ_ONLY"]).optional(),
  note: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || !canApproveAccounts(actor.globalRole)) {
      return NextResponse.json({ message: "You are not authorized to manage accounts." }, { status: 403 });
    }
    const input = schema.parse(await request.json());

    if (input.action === "APPROVE_REQUEST") {
      const accessRequest = await findAccessRequestById(input.targetId);
      if (!accessRequest || accessRequest.status !== "PENDING") {
        return NextResponse.json({ message: "That access request is no longer pending." }, { status: 409 });
      }
      const user = await createApprovedUserFromRequest({ request: accessRequest, approverId: actor.id });
      await recordAuditEvent({
        actorUserId: actor.id,
        action: "USER_APPROVED",
        entityType: "user",
        entityId: user.id,
        summary: `${actor.fullName} approved ${user.fullName}`,
        metadata: { email: user.email, role: user.globalRole }
      });
      await sendApprovalEmail({ to: user.email, name: user.fullName });
      return NextResponse.json({ message: `${user.fullName} was approved.` });
    }

    if (input.action === "REJECT_REQUEST") {
      const accessRequest = await findAccessRequestById(input.targetId);
      if (!accessRequest || accessRequest.status !== "PENDING") {
        return NextResponse.json({ message: "That access request is no longer pending." }, { status: 409 });
      }
      await rejectAccessRequest(input.targetId, actor.id, input.note);
      await recordAuditEvent({
        actorUserId: actor.id,
        action: "ACCESS_REQUEST_REJECTED",
        entityType: "access_request",
        entityId: input.targetId,
        summary: `${actor.fullName} rejected the access request from ${accessRequest.fullName}`
      });
      return NextResponse.json({ message: "The access request was rejected." });
    }

    const target = await findUserById(input.targetId);
    if (!target) return NextResponse.json({ message: "User not found." }, { status: 404 });

    if (input.action === "SET_ROLE") {
      if (!canManageOwners(actor.globalRole)) {
        return NextResponse.json({ message: "Only a system owner may change global privileges." }, { status: 403 });
      }
      if (!input.role) return NextResponse.json({ message: "Select a role." }, { status: 400 });
      if (target.id === actor.id && input.role !== "SYSTEM_OWNER") {
        return NextResponse.json({ message: "You cannot demote your own system-owner account." }, { status: 400 });
      }
      if (target.globalRole === "SYSTEM_OWNER" && input.role !== "SYSTEM_OWNER" && (await countActiveSystemOwners()) <= 1) {
        return NextResponse.json({ message: "The final active system owner cannot be removed." }, { status: 400 });
      }
      if (
        ["SYSTEM_OWNER", "ACCOUNT_APPROVER"].includes(target.globalRole) &&
        !["SYSTEM_OWNER", "ACCOUNT_APPROVER"].includes(input.role) &&
        (await countActiveApprovers()) <= 1
      ) {
        return NextResponse.json({ message: "At least one active account approver must remain." }, { status: 400 });
      }
      const previousRole = target.globalRole;
      await updateUserRole(target.id, input.role as GlobalRole);
      await recordAuditEvent({
        actorUserId: actor.id,
        action: "USER_ROLE_CHANGED",
        entityType: "user",
        entityId: target.id,
        summary: `${actor.fullName} changed ${target.fullName} from ${previousRole} to ${input.role}`,
        metadata: { previousRole, newRole: input.role }
      });
      return NextResponse.json({ message: `${target.fullName}'s privileges were updated.` });
    }

    if (target.id === actor.id && input.action !== "REACTIVATE") {
      return NextResponse.json({ message: "You cannot suspend or archive your own account." }, { status: 400 });
    }
    if (target.globalRole === "SYSTEM_OWNER" && input.action !== "REACTIVATE" && (await countActiveSystemOwners()) <= 1) {
      return NextResponse.json({ message: "The final active system owner cannot be disabled." }, { status: 400 });
    }
    if (
      ["SYSTEM_OWNER", "ACCOUNT_APPROVER"].includes(target.globalRole) &&
      input.action !== "REACTIVATE" &&
      (await countActiveApprovers()) <= 1
    ) {
      return NextResponse.json({ message: "At least one active account approver must remain." }, { status: 400 });
    }

    const newStatus = input.action === "SUSPEND" ? "SUSPENDED" : input.action === "ARCHIVE" ? "ARCHIVED" : "APPROVED";
    await updateUserStatus(target.id, newStatus, actor.id);
    await recordAuditEvent({
      actorUserId: actor.id,
      action: `USER_${newStatus}`,
      entityType: "user",
      entityId: target.id,
      summary: `${actor.fullName} set ${target.fullName}'s status to ${newStatus}`
    });
    return NextResponse.json({ message: `${target.fullName} is now ${newStatus.toLowerCase()}.` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "The account action was invalid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "The account action could not be completed." }, { status: 500 });
  }
}
