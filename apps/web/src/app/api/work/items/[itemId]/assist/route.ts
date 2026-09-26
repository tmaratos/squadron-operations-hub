import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonReply } from "@/lib/ai/local";
import { aiChatFor, AiUnavailableError, sourceForUser } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { listTaskTags } from "@/lib/operations/tasks";
import { assertSameOrigin } from "@/lib/security/origin";
import { getItemDetail } from "@/lib/work/items";

// Squadron AI task helpers. Suggestions only: nothing is saved until a member chooses to use a suggestion.
const requestSchema = z.object({ action: z.enum(["summarize", "tags", "subtasks"]) });

function clip(value: string | null | undefined, max: number): string {
  const text = (value ?? "").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json(await sourceForUser(user.id));
}

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const { action } = requestSchema.parse(await request.json());
    const { itemId } = await params;
    const item = await getItemDetail(itemId);
    if (!item) return NextResponse.json({ message: "Task not found." }, { status: 404 });

    const task = "Task title: " + item.title + "\n\nTask details:\n" + (clip(item.description, 3500) || "(no details)");

    if (action === "summarize") {
      const summary = await aiChatFor(user.id, [
        { role: "system", content: "You summarize Civil Air Patrol squadron tasks for busy volunteers. Write 2 or 3 short sentences in plain English: what the task is, what is still open, and any date. No preamble, no lists." },
        { role: "user", content: task }
      ], { maxTokens: 160 });
      return NextResponse.json({ summary });
    }

    if (action === "tags") {
      const allowed = (await listTaskTags()).map((tag) => tag.label.toLowerCase());
      const reply = await aiChatFor(user.id, [
        { role: "system", content: "Choose up to 4 tags that fit the task, using ONLY tags from the allowed list. Reply with JSON only, like {\"tags\": [\"tag one\", \"tag two\"]}." },
        { role: "user", content: "Allowed tags: " + allowed.join(", ") + "\n\n" + task }
      ], { json: true, maxTokens: 80 });
      const current = new Set(item.tags.map((tag) => tag.label.toLowerCase()));
      const tags = parseJsonReply<{ tags?: unknown }>(reply, {}).tags;
      const suggestions = (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag).trim().toLowerCase())
        .filter((tag, index, list) => allowed.includes(tag) && !current.has(tag) && list.indexOf(tag) === index)
        .slice(0, 4);
      return NextResponse.json({ tags: suggestions });
    }

    const reply = await aiChatFor(user.id, [
      { role: "system", content: "Break the task into 3 to 6 short, concrete next steps a volunteer could do. Each step under 12 words, starting with a verb. Reply with JSON only, like {\"subtasks\": [\"Call the facility manager\", \"Email the finance committee\"]}." },
      { role: "user", content: task + (item.children.length ? "\n\nExisting subtasks (do not repeat): " + item.children.map((child) => child.title).join("; ") : "") }
    ], { json: true, maxTokens: 220 });
    const steps = parseJsonReply<{ subtasks?: unknown }>(reply, {}).subtasks;
    const subtasks = (Array.isArray(steps) ? steps : [])
      .map((step) => String(step).trim().replace(/^[-*\d.\s]+/, ""))
      .filter((step) => step.length > 2)
      .map((step) => step.slice(0, 120))
      .slice(0, 6);
    return NextResponse.json({ subtasks });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    if (error instanceof AiUnavailableError) return NextResponse.json({ message: error.message }, { status: 503 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error && /timed out|abort/i.test(error.message) ? "The assistant took too long to answer. Try again in a minute." : "The assistant couldn't answer right now. Try again in a minute." }, { status: 502 });
  }
}
