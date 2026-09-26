import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { assertSameOrigin } from "@/lib/security/origin";

// Dictation for browsers whose own speech service will not answer.
//
// Chrome, Edge and Safari each have one, use it for free, and never involve the Hub. Firefox has none, and
// the Chromium browsers that are not Chrome have the API without the key it needs. Those record the audio
// and send it here.
//
// It has to cost the squadron nothing, and that is enforced rather than hoped for. Cloudflare gives every
// account 10,000 Neurons a day at no charge; Whisper costs 41.14 Neurons per audio minute, so the free
// allowance is about 243 minutes a day. The Hub keeps its own budget well below that and refuses politely
// when it is reached - because past the allowance a Free plan starts failing and a Paid plan starts
// charging, and a squadron should never discover either by accident.
//
// Where the squadron runs its own transcription service, that is used instead and none of this applies.

const MAX_BYTES = 2_500_000;
const MAX_CLIP_SECONDS = 60;
/** 180 minutes against an allowance of roughly 243, leaving room for anything else that uses Workers AI. */
const DAILY_BUDGET_SECONDS = 180 * 60;
const MODEL = "@cf/openai/whisper";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function secondsUsedToday(): Promise<number> {
  try {
    const row = await getDatabase()
      .prepare("SELECT audio_seconds FROM ai_usage WHERE day = ?")
      .bind(today())
      .first<{ audio_seconds: number }>();
    return row?.audio_seconds ?? 0;
  } catch {
    // No table means no migration yet. Counting nothing would make the budget meaningless, so this refuses
    // instead: better to have dictation off for a day than to spend money nobody agreed to.
    return Number.POSITIVE_INFINITY;
  }
}

async function addSeconds(seconds: number): Promise<void> {
  try {
    await getDatabase()
      .prepare(
        "INSERT INTO ai_usage (day, audio_seconds, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(day) DO UPDATE SET audio_seconds = audio_seconds + excluded.audio_seconds, updated_at = excluded.updated_at"
      )
      .bind(today(), Math.max(1, Math.round(seconds)), new Date().toISOString())
      .run();
  } catch { /* the budget is best effort; the caps above are the hard stop */ }
}

/**
 * How long the clip was, erring upwards.
 *
 * The browser says, and the bytes give a second opinion: Opus at the rates MediaRecorder uses runs around
 * 3 KB a second. The larger of the two is counted, because a budget that undercounts is not a budget.
 */
function clipSeconds(request: Request, byteLength: number): number {
  const claimed = Number(request.headers.get("x-clip-seconds") ?? "0");
  const fromHeader = Number.isFinite(claimed) ? Math.min(MAX_CLIP_SECONDS, Math.max(0, claimed)) : 0;
  const fromBytes = byteLength / 3000;
  return Math.min(MAX_CLIP_SECONDS, Math.max(1, fromHeader, fromBytes));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

    const env = getCloudflareEnv();
    const audio = await request.arrayBuffer();
    if (!audio.byteLength) return NextResponse.json({ message: "Nothing was recorded." }, { status: 400 });
    if (audio.byteLength > MAX_BYTES) {
      return NextResponse.json({ message: "That recording is too long. Say it in shorter pieces." }, { status: 413 });
    }

    const contentType = request.headers.get("content-type") ?? "audio/webm";

    // The squadron's own hardware first, where there is any: free, private, and no allowance to watch.
    if (env.LOCAL_TRANSCRIBE_URL) {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: contentType }), "clip.webm");
      form.append("response_format", "json");
      const response = await fetch(env.LOCAL_TRANSCRIBE_URL, { method: "POST", body: form });
      if (!response.ok) {
        return NextResponse.json({ message: "The squadron's transcription service did not answer." }, { status: 502 });
      }
      const data = (await response.json().catch(() => ({}))) as { text?: string };
      const said = typeof data.text === "string" ? data.text.trim() : "";
      return NextResponse.json({ text: said, message: said ? undefined : "Nothing could be made out of that." });
    }

    if (!env.AI) {
      return NextResponse.json(
        {
          unavailable: true,
          message: "This browser cannot do speech itself, and the Hub has nothing to transcribe with. Chrome, Edge or Safari will work."
        },
        { status: 503 }
      );
    }

    const seconds = clipSeconds(request, audio.byteLength);
    const used = await secondsUsedToday();
    if (used + seconds > DAILY_BUDGET_SECONDS) {
      // Deliberately not an error. The squadron has used its free allowance for the day and the Hub is not
      // going to spend money to carry on.
      return NextResponse.json(
        {
          unavailable: true,
          message: "The squadron has used today's free transcription. It resets overnight, and Chrome or Edge will work in the meantime."
        },
        { status: 503 }
      );
    }

    const result = await env.AI.run(MODEL, { audio: [...new Uint8Array(audio)] });
    const text = typeof result?.text === "string" ? result.text.trim() : "";

    // Counted whether or not anything came back, because the audio minute was spent either way.
    await addSeconds(seconds);

    return NextResponse.json({ text, message: text ? undefined : "Nothing could be made out of that." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "That could not be transcribed." }, { status: 500 });
  }
}
