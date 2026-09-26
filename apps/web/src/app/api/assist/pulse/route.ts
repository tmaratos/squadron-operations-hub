import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/auth/session";
import { listOffers } from "@/lib/ai/offers";
import { checkMail, dueForCheck, openSuggestions } from "@/lib/google/mail-inbox";
import { runDueAgents, unreadByAgent } from "@/lib/ai/agent-runs";
import { listDriveFiles } from "@/lib/drive/google-drive";
import { loadDashboardItems } from "@/lib/work/dashboards";

// What the Hub has noticed, gathered in one place, while somebody has it open.
//
// The pieces already existed and each was somewhere different: offers on the home page, mail suggestions
// behind a connection screen, an agent's findings only if you opened that agent. An assistant nobody
// happens to navigate to is a stagnant one.
//
// The expensive parts are rate-limited by the things that do them - mail is read at most every ninety
// minutes, agents run at most once a day - so this is safe to call on a timer. What it returns is always
// a suggestion. Nothing here changes the squadron's work.

interface Noticed {
  id: string;
  kind: "offer" | "mail" | "agent" | "drive";
  title: string;
  detail: string | null;
  href: string | null;
  /** Opening this would leave the Hub, so it opens in its own tab instead. */
  external?: boolean;
  /** Only offers can be acted on from the widget; the rest lead somewhere. */
  actionable: boolean;
  /** Everything the offers API needs to actually make the thing. Without it, "Do it" did nothing. */
  accept?: { id: string; listId?: string; title?: string; dueOn?: string | null; suggestionId?: string };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const noticed: Noticed[] = [];

  // Reading mail and running agents outlive this request, so the page is not held waiting for them.
  if (deep) {
    try {
      const context = getCloudflareContext();
      context.ctx.waitUntil((async () => {
        if (await dueForCheck(user.id).catch(() => false)) await checkMail(user.id).catch(() => 0);
        await runDueAgents().catch(() => ({ ran: 0, said: 0 }));
      })());
    } catch {
      // Outside the Cloudflare runtime this simply does not happen in the background.
    }
  }

  const [offers, mail, unread] = await Promise.all([
    listOffers(user.id).catch(() => []),
    openSuggestions(user.id, 4).catch(() => []),
    unreadByAgent(user.id).catch(() => ({} as Record<string, number>))
  ]);

  offers.forEach((offer) => noticed.push({
    id: "offer:" + offer.id,
    kind: "offer",
    title: offer.title,
    detail: offer.because ?? null,
    href: offer.listId ? "/lists/" + offer.listId : null,
    // Only offer to do it when there is something to make. An offer to look at a list is a Look, not a Do.
    actionable: Boolean(offer.create),
    accept: {
      id: offer.id,
      ...(offer.create ? { listId: offer.listId, title: offer.create.title, dueOn: offer.create.dueOn } : {}),
      ...(offer.suggestionId ? { suggestionId: offer.suggestionId } : {})
    }
  }));

  // Say where it came from and when. "I found this in your mail" is only useful if it says which mail.
  mail.forEach((suggestion) => {
    const who = (suggestion.from ?? "").replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
    const said = suggestion.because ? "“" + suggestion.because.slice(0, 140) + "”" : null;
    noticed.push({
      id: "mail:" + suggestion.id,
      kind: "mail",
      title: suggestion.title,
      detail: [
        who ? "From " + who : "From your mail",
        suggestion.subject ? "about “" + suggestion.subject.slice(0, 60) + "”" : null,
        suggestion.dueOn ? "· due " + suggestion.dueOn : null
      ].filter(Boolean).join(" ") + (said ? " — it says " + said : ""),
      // Where the suggestion actually is, rather than the settings page it happens to live under.
      href: "/connections#mail",
      actionable: false
    });
  });

  const unreadTotal = Object.values(unread).reduce((sum, count) => sum + count, 0);
  if (unreadTotal) {
    noticed.push({
      id: "agent:unread",
      kind: "agent",
      title: unreadTotal === 1 ? "An agent has something for you" : unreadTotal + " things from your agents",
      detail: "They looked without being asked.",
      href: "/agents",
      actionable: false
    });
  }

  // Squadron documents changed recently that nothing in the Hub refers to. A quiet, cheap check: names
  // only, never contents, and it never guesses what the file is about.
  if (deep) {
    try {
      const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      const [drive, items] = await Promise.all([
        listDriveFiles({ userId: user.id }),
        loadDashboardItems().catch(() => [])
      ]);
      const mentioned = items.map((item) => item.title.toLowerCase());
      drive.files
        .filter((file) => file.mimeType !== "application/vnd.google-apps.folder")
        .filter((file) => (file.modifiedTime ?? "").slice(0, 10) >= since)
        .filter((file) => !mentioned.some((title) => title.includes(file.name.toLowerCase().slice(0, 18))))
        .slice(0, 2)
        .forEach((file) => noticed.push({
          id: "drive:" + file.id,
          kind: "drive",
          title: file.name + " changed in the drive",
          detail: "Nothing in the Hub refers to it. Worth a task?",
          href: file.webViewLink ?? "/documents",
          external: Boolean(file.webViewLink),
          actionable: false
        }));
    } catch {
      // No Drive connection, or Drive is unhappy. Neither is worth an error in a widget.
    }
  }

  return NextResponse.json({ noticed, checkedAt: new Date().toISOString() });
}
