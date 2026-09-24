import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import type { ItemDetail } from "@/lib/work/types";
import { notify } from "./notifications";

// The moments worth telling someone about. Each one names the person who caused it, so a notice reads
// "Tristan gave you..." rather than "an update occurred", and nobody is ever told about their own action.

function itemUrl(item: { id: string; listId: string }): string {
  const base = (getCloudflareEnv().APP_URL || "").replace(/\/+$/, "");
  return base + "/lists/" + item.listId + "?item=" + item.id;
}

/** Everyone who should hear about activity on an item: whoever it is assigned to, plus whoever raised it. */
async function interestedIn(item: ItemDetail): Promise<string[]> {
  const people = new Set(item.assignees.map((person) => person.id));
  try {
    const row = await getDatabase().prepare("SELECT created_by FROM items WHERE id = ?").bind(item.id).first<{ created_by: string | null }>();
    if (row?.created_by) people.add(row.created_by);
  } catch {
    // The assignees alone are enough to be useful.
  }
  return [...people];
}

export async function notifyAssigned(input: { item: ItemDetail; addedUserIds: string[]; actor: { id: string; fullName: string } }): Promise<void> {
  if (!input.addedUserIds.length) return;
  const due = input.item.dueOn ? " Due " + input.item.dueOn + "." : "";
  await notify(
    input.addedUserIds.map((userId) => ({
      userId,
      kind: "ASSIGNED" as const,
      title: input.actor.fullName + " gave you: " + input.item.title,
      body: "In " + input.item.listName + "." + due,
      itemId: input.item.id,
      listId: input.item.listId,
      url: itemUrl(input.item),
      actorUserId: input.actor.id
    }))
  );
}

export async function notifyComment(input: { item: ItemDetail; comment: string; actor: { id: string; fullName: string } }): Promise<void> {
  // Somebody named in the comment gets the mention instead, so one comment is never two emails.
  const named = new Set(mentionedIn(input.comment));
  const audience = (await interestedIn(input.item)).filter((userId) => !named.has(userId));
  await notify(
    audience.map((userId) => ({
      userId,
      kind: "COMMENT" as const,
      title: input.actor.fullName + " commented on " + input.item.title,
      body: plainMentions(input.comment).slice(0, 400),
      itemId: input.item.id,
      listId: input.item.listId,
      url: itemUrl(input.item),
      actorUserId: input.actor.id
    }))
  );
}

/**
 * Everyone named in a comment, in the form the editor writes: @[Full Name](user id).
 *
 * Kept separate from the comment notice on purpose. A comment tells the people already involved that
 * something was said; naming somebody is asking them specifically, and reaches them whether or not they
 * had anything to do with the task before.
 */
export function mentionedIn(comment: string): string[] {
  const found = new Set<string>();
  const pattern = /@\[[^\]]{1,80}\]\(([A-Za-z0-9_-]{1,80})\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(comment)) !== null) found.add(match[1]);
  return [...found];
}

/** Strips the mention markup back to plain names, for an email or a notification body. */
export function plainMentions(comment: string): string {
  return comment.replace(/@\[([^\]]{1,80})\]\([A-Za-z0-9_-]{1,80}\)/g, "@$1");
}

export async function notifyMentions(input: { item: ItemDetail; comment: string; actor: { id: string; fullName: string } }): Promise<void> {
  const named = mentionedIn(input.comment).filter((userId) => userId !== input.actor.id);
  if (!named.length) return;
  await notify(
    named.map((userId) => ({
      userId,
      kind: "MENTION" as const,
      title: input.actor.fullName + " mentioned you on " + input.item.title,
      body: plainMentions(input.comment).slice(0, 400),
      itemId: input.item.id,
      listId: input.item.listId,
      url: itemUrl(input.item),
      actorUserId: input.actor.id
    }))
  );
}

export async function notifyStatus(input: { item: ItemDetail; statusName: string; actor: { id: string; fullName: string } }): Promise<void> {
  const audience = await interestedIn(input.item);
  await notify(
    audience.map((userId) => ({
      userId,
      kind: "STATUS" as const,
      title: input.item.title + " is now " + input.statusName,
      body: "Changed by " + input.actor.fullName + " in " + input.item.listName + ".",
      itemId: input.item.id,
      listId: input.item.listId,
      url: itemUrl(input.item),
      actorUserId: input.actor.id
    }))
  );
}
