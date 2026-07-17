import { z } from "zod";

export const createTaskSchema = z.object({
  squadronId: z.string().min(1),
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  dueAt: z.coerce.date().optional(),
  ownerUserId: z.string().optional(),
  functionalAreaId: z.string().optional()
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
