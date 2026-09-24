import { aiChatFor } from "@/lib/ai/provider";
import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { listDriveFiles, uploadDriveFile } from "@/lib/drive/google-drive";
import { loadDashboardItems } from "@/lib/work/dashboards";

// Drafting next month's meeting schedule.
//
// The squadron writes one Google Doc per month, named "September 2026", in TN-170 Meeting Schedules/<year>.
// Writing the next one is a recurring job somebody has to remember, and the material for it already exists:
// the shape of the last few months, and the events already recorded in the Hub.
//
// Nothing here publishes anything. A draft is written as a separate document with DRAFT in its name, into
// the same folder, and a task is raised for the people who review it. Renaming it is how it becomes real -
// which keeps the decision to publish with a person.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOC = "application/vnd.google-apps.document";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface ScheduleFolder {
  id: string;
  year: number;
  /** Documents already in it, newest month first. */
  existing: Array<{ id: string; name: string; month: number | null; isDraft: boolean }>;
}

function monthOf(name: string): number | null {
  const index = MONTHS.findIndex((month) => name.toLowerCase().startsWith(month.toLowerCase()));
  return index < 0 ? null : index + 1;
}

/**
 * Finds the folder the squadron actually keeps its schedules in, by walking to it rather than by holding
 * an id in configuration that goes stale the first time somebody reorganises the drive.
 */
export async function findScheduleFolder(userId: string, year: number): Promise<ScheduleFolder | null> {
  const byName = async (name: string, parentId?: string) => {
    const result = await listDriveFiles({ userId, search: name, parentId });
    return result.files.find((file) => file.mimeType === "application/vnd.google-apps.folder" && file.name.trim().toLowerCase() === name.toLowerCase());
  };

  const schedules = await byName("TN-170 Meeting Schedules");
  if (!schedules) return null;
  const yearFolder = await byName(String(year), schedules.id);
  if (!yearFolder) return null;

  const contents = await listDriveFiles({ userId, parentId: yearFolder.id });
  const existing = contents.files
    .filter((file) => file.mimeType === GOOGLE_DOC)
    .map((file) => ({
      id: file.id,
      name: file.name,
      month: monthOf(file.name),
      isDraft: /draft/i.test(file.name)
    }))
    .sort((left, right) => (right.month ?? 0) - (left.month ?? 0));

  return { id: yearFolder.id, year, existing };
}

/** Which months of the year have a published schedule, and which do not. */
export function missingMonths(folder: ScheduleFolder): number[] {
  const held = new Set(folder.existing.filter((file) => !file.isDraft && file.month).map((file) => file.month as number));
  return MONTHS.map((_, index) => index + 1).filter((month) => !held.has(month));
}

async function docText(userId: string, fileId: string): Promise<string> {
  const token = await getUserGoogleAccessToken(userId);
  const response = await fetch(DRIVE_API + "/files/" + fileId + "/export?mimeType=text/plain&supportsAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) return "";
  return (await response.text()).slice(0, 6000);
}

/** What the Hub already knows is happening in a month, so the draft is not invented from nothing. */
async function eventsIn(year: number, month: number): Promise<string[]> {
  const items = await loadDashboardItems().catch(() => []);
  const prefix = year + "-" + String(month).padStart(2, "0");
  return items
    .filter((item) => item.dueOn?.startsWith(prefix))
    .map((item) => item.dueOn + " — " + item.title + " [" + item.listName + "]")
    .sort();
}

export interface DraftProposal {
  month: number;
  year: number;
  name: string;
  text: string;
  builtFrom: string[];
  events: string[];
}

/**
 * Writes the draft text. Reads the last few published months for the shape, and the Hub's own dated work
 * for what actually happens that month.
 */
export async function proposeSchedule(userId: string, folder: ScheduleFolder, month: number, year: number): Promise<DraftProposal> {
  const samples = folder.existing.filter((file) => !file.isDraft && file.month).slice(0, 3);
  const bodies: string[] = [];
  for (const sample of samples) {
    const text = await docText(userId, sample.id);
    if (text.trim()) bodies.push("=== " + sample.name + " ===\n" + text);
  }

  const events = await eventsIn(year, month);
  const label = MONTHS[month - 1] + " " + year;

  const system = [
    "You draft a Civil Air Patrol squadron's monthly meeting schedule for TN-170 Oak Ridge.",
    "Follow the layout, headings, section order and tone of the example months exactly. This is the squadron's own format.",
    "Weekly meetings fall on the same weekday as in the examples. Work out the correct dates for the month being drafted.",
    "Use the squadron's recorded events where they fall. Put them on their real dates.",
    "Never invent a guest speaker, a deadline, an activity or a name that is not in the examples as a recurring item or in the recorded events.",
    "Where something is normally decided by a person and you do not know it, write [TO CONFIRM] rather than guessing.",
    "Return the document body as plain text. No preamble, no explanation, no markdown fences."
  ].join("\n");

  const prompt = [
    "Draft the schedule for " + label + ".",
    bodies.length ? "Recent published months, for format and recurring items:\n\n" + bodies.join("\n\n") : "No prior months could be read. Use a plain weekly layout and mark everything [TO CONFIRM].",
    events.length ? "\nRecorded events and deadlines in " + label + ":\n" + events.join("\n") : "\nThe Hub has nothing recorded for " + label + "."
  ].join("\n\n");

  const text = await aiChatFor(userId, [
    { role: "system", content: system },
    { role: "user", content: prompt }
  ], { maxTokens: 1800 });

  return {
    month,
    year,
    name: label + " (DRAFT)",
    text: text.trim(),
    builtFrom: samples.map((sample) => sample.name),
    events
  };
}

/** Puts the draft in the folder beside the published months. Returns the new document. */
export async function writeDraft(userId: string, folder: ScheduleFolder, proposal: DraftProposal) {
  const header = [
    proposal.name,
    "",
    "DRAFT for review — not the published schedule.",
    "Drafted by the Squadron Operations Hub on " + new Date().toISOString().slice(0, 10) + ".",
    proposal.builtFrom.length ? "Based on the format of: " + proposal.builtFrom.join(", ") + "." : "",
    "Anything marked [TO CONFIRM] needs a person to decide it.",
    "Rename this document to \"" + MONTHS[proposal.month - 1] + " " + proposal.year + "\" to publish it.",
    "",
    "----------------------------------------",
    ""
  ].filter((line) => line !== null).join("\n");

  // Uploaded as plain text with the Google Doc type, so Drive converts it into an editable document
  // rather than an attachment nobody can edit in place.
  return uploadDriveFile({
    userId,
    name: proposal.name,
    mimeType: "text/plain",
    bytes: new TextEncoder().encode(header + proposal.text).buffer as ArrayBuffer,
    parentId: folder.id,
    convertTo: GOOGLE_DOC
  });
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}
