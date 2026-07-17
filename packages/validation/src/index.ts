import { z } from "zod";

export const taskStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "CANCELLED"
]);

export const taskPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

export const createTaskSchema = z.object({
  squadronId: z.string().min(1),
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.default("NORMAL"),
  dueAt: z.coerce.date().optional(),
  ownerUserId: z.string().optional(),
  functionalAreaId: z.string().optional(),
  sourceType: z.string().max(60).optional(),
  sourceReference: z.string().max(1000).optional()
});

export const createMeetingSchema = z.object({
  squadronId: z.string().min(1),
  title: z.string().min(3).max(180),
  description: z.string().max(5000).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  location: z.string().max(240).optional()
}).refine((value) => !value.endsAt || value.endsAt > value.startsAt, {
  message: "Meeting end time must be after the start time",
  path: ["endsAt"]
});

export const createComplianceRequirementSchema = z.object({
  squadronId: z.string().min(1),
  name: z.string().min(3).max(180),
  description: z.string().max(5000).optional(),
  governingSource: z.string().max(240).optional(),
  responsibleRole: z.string().max(100).optional(),
  recurrenceRule: z.string().max(500).optional(),
  leadTimeDays: z.number().int().min(0).max(365).default(14),
  nextDueAt: z.coerce.date().optional(),
  approvalAuthority: z.string().max(120).optional(),
  requiredEvidence: z.array(z.string().min(1).max(240)).default([])
});

export const createDocumentSchema = z.object({
  squadronId: z.string().min(1),
  title: z.string().min(3).max(180),
  category: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  storageKey: z.string().min(1).max(1000),
  ownerUserId: z.string().optional(),
  governingSource: z.string().max(240).optional(),
  reviewDueAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional()
});

export const createInventoryItemSchema = z.object({
  squadronId: z.string().min(1),
  assetTag: z.string().max(100).optional(),
  name: z.string().min(2).max(180),
  category: z.string().max(100).optional(),
  quantity: z.number().int().min(0).default(1),
  reorderPoint: z.number().int().min(0).optional(),
  location: z.string().max(180).optional(),
  assignedUserId: z.string().optional(),
  notes: z.string().max(5000).optional()
});

export const createFundingOpportunitySchema = z.object({
  squadronId: z.string().min(1),
  name: z.string().min(3).max(180),
  type: z.string().max(100).optional(),
  source: z.string().max(240).optional(),
  description: z.string().max(5000).optional(),
  amountCents: z.number().int().min(0).optional(),
  nextAction: z.string().max(500).optional(),
  nextActionAt: z.coerce.date().optional(),
  applicationDueAt: z.coerce.date().optional(),
  contactId: z.string().optional()
});

export const linkDiscordChannelSchema = z.object({
  squadronId: z.string().min(1),
  guildId: z.string().min(1).max(40),
  channelId: z.string().min(1).max(40),
  displayName: z.string().min(1).max(100),
  purpose: z.enum([
    "STAFF",
    "ANNOUNCEMENTS",
    "CADET_STAFF",
    "PARENTS",
    "LOGISTICS",
    "OTHER"
  ])
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type CreateComplianceRequirementInput = z.infer<typeof createComplianceRequirementSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type CreateFundingOpportunityInput = z.infer<typeof createFundingOpportunitySchema>;
export type LinkDiscordChannelInput = z.infer<typeof linkDiscordChannelSchema>;
