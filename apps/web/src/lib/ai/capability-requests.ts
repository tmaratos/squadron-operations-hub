import { getDatabase } from "@/lib/cloudflare";

// When the Hub cannot do what was asked, that is worth knowing. The assistant records it rather than
// inventing a half-measure, and whoever maintains the Hub gets a list of what the squadron actually wants.

export interface CapabilityRequest {
  id: string;
  request: string;
  interpretation: string | null;
  status: "OPEN" | "PLANNED" | "BUILT" | "DECLINED";
  note: string | null;
  askedBy: string | null;
  createdAt: string;
}

export async function recordCapabilityRequest(input: { userId: string; request: string; interpretation?: string | null }): Promise<void> {
  try {
    await getDatabase()
      .prepare("INSERT INTO capability_requests (id, asked_by, request, interpretation, status, created_at) VALUES (?, ?, ?, ?, 'OPEN', ?)")
      .bind(crypto.randomUUID(), input.userId, input.request.slice(0, 2000), input.interpretation?.slice(0, 1000) ?? null, new Date().toISOString())
      .run();
  } catch (error) {
    console.error(error);
  }
}

export async function listCapabilityRequests(includeClosed = false): Promise<CapabilityRequest[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT c.id, c.request, c.interpretation, c.status, c.note, c.created_at, u.full_name AS asked_by " +
        "FROM capability_requests c LEFT JOIN users u ON u.id = c.asked_by " +
        (includeClosed ? "" : "WHERE c.status IN ('OPEN','PLANNED') ") +
        "ORDER BY c.created_at DESC LIMIT 100"
      )
      .all<{ id: string; request: string; interpretation: string | null; status: CapabilityRequest["status"]; note: string | null; created_at: string; asked_by: string | null }>();
    return rows.results.map((row) => ({
      id: row.id,
      request: row.request,
      interpretation: row.interpretation,
      status: row.status,
      note: row.note,
      askedBy: row.asked_by,
      createdAt: row.created_at
    }));
  } catch {
    return [];
  }
}

export async function reviewCapabilityRequest(input: { id: string; status: CapabilityRequest["status"]; note?: string | null; reviewerId: string }): Promise<void> {
  await getDatabase()
    .prepare("UPDATE capability_requests SET status = ?, note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .bind(input.status, input.note?.slice(0, 1000) ?? null, input.reviewerId, new Date().toISOString(), input.id)
    .run();
}

export async function logBuild(input: { userId: string; prompt: string; stepType: string; label: string; ok: boolean; targetKind?: string | null; targetId?: string | null }): Promise<void> {
  try {
    await getDatabase()
      .prepare("INSERT INTO ai_build_log (id, user_id, prompt, step_type, label, target_kind, target_id, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.prompt.slice(0, 1000),
        input.stepType,
        input.label.slice(0, 500),
        input.targetKind ?? null,
        input.targetId ?? null,
        input.ok ? 1 : 0,
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.error(error);
  }
}
