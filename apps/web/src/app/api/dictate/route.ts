import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { assertSameOrigin } from "@/lib/security/origin";

// Dictation for the browsers that cannot do it themselves.
//
// Chrome, Edge and Safari each have a speech service and use it for free, and nothing here is involved. But
// the Web Speech API needs a key that only those browsers ship, so Firefox has none at all and the other
// Chromium browsers - DuckDuckGo, Brave, Vivaldi - have the API and no key, which fails in a way that looks
// like the Hub is broken. Those fall back to here: the browser records, the Hub transcribes.
//
// This one is billed to the squadron's Cloudflare account, which the browser's own service is not. So it is
// hedged in three directions - a size limit, a length limit, and a daily count per member - because the
// failure worth designing against is not somebody dictating too much, it is a microphone left running.

const MAX_BYTES = 2_500_000; // roughly two minutes of Opus, and a hard stop well before anything runs away
const MAX_PER_DAY = 120;
const MODEL = "@cf/openai/whisper";

/** How many clips this member has already had transcribed today. Counted, not estimated. */
async function usedToday(userId: string): Promise<{ key: string; count: number }> {
  const key = "dictate_" + new Date().toISOString().slice(0, 10);
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
      .bind(userId, key)
      .first<{ value: string }>();
    return { key, count: Number(row?.value ?? 0) || 0 };
  } catch {
    return { key, count: 0 };
  }
}

async function recordUse(userId: string, key: string, count: number): Promise<void> {
  try {
    await getDatabase()
      .prepare(
        "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(userId, key, String(count + 1), new Date().toISOString())
      .run();
  } catch { /* a counter that cannot be written is not a reason to refuse the transcription */ }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

    const env = getCloudflareEnv();
    if (!env.AI) {
      return NextResponse.json(
        { message: "Dictation is not switched on for this Hub. Use Chrome, Edge or Safari, where the browser does it itself." },
        { status: 503 }
      );
    }

    const { key, count } = await usedToday(user.id);
    if (count >= MAX_PER_DAY) {
      return NextResponse.json(
        { message: "That is a lot of dictation for one day. It will work again tomorrow, or use Chrome or Edge, where it is free." },
        { status: 429 }
      );
    }

    const audio = await request.arrayBuffer();
    if (!audio.byteLength) return NextResponse.json({ message: "Nothing was recorded." }, { status: 400 });
    if (audio.byteLength > MAX_BYTES) {
      return NextResponse.json({ message: "That recording is too long. Say it in shorter pieces." }, { status: 413 });
    }

    // Whisper takes the bytes as numbers. Plain and dull, and the format the model expects.
    const result = await env.AI.run(MODEL, { audio: [...new Uint8Array(audio)] });
    const text = typeof result?.text === "string" ? result.text.trim() : "";

    // Only count what actually worked. A failed transcription should not use up somebody's allowance.
    if (text) await recordUse(user.id, key, count);

    return NextResponse.json({
      text,
      message: text ? undefined : "Nothing could be made out of that."
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "That could not be transcribed." }, { status: 500 });
  }
}
