import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { assertSameOrigin } from "@/lib/security/origin";

// Dictation for browsers whose own speech service will not answer.
//
// Chrome, Edge and Safari each have one, use it for free, and never involve the Hub at all. Firefox has
// none, and the Chromium browsers that are not Chrome have the API without the key it needs. Those browsers
// record the audio and send it here.
//
// This costs the squadron nothing, and that is a constraint rather than a happy accident. It transcribes
// only on hardware the squadron already owns - the same server the assistant runs on, with a Whisper
// service beside it - and where no such service is configured it says so plainly rather than quietly
// reaching for something that bills. A paid transcription service is not an acceptable fallback for a
// volunteer unit, and a feature that silently costs money is worse than a feature that is missing.

const MAX_BYTES = 2_500_000;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

    const env = getCloudflareEnv();
    const endpoint = env.LOCAL_TRANSCRIBE_URL;
    if (!endpoint) {
      return NextResponse.json(
        {
          unavailable: true,
          message: "This browser cannot do speech itself, and the squadron has no transcription service of its own. Chrome, Edge or Safari will work."
        },
        { status: 503 }
      );
    }

    const audio = await request.arrayBuffer();
    if (!audio.byteLength) return NextResponse.json({ message: "Nothing was recorded." }, { status: 400 });
    if (audio.byteLength > MAX_BYTES) {
      return NextResponse.json({ message: "That recording is too long. Say it in shorter pieces." }, { status: 413 });
    }

    // Whatever the squadron runs, spoken to the way whisper.cpp and faster-whisper both answer.
    const form = new FormData();
    form.append("file", new Blob([audio], { type: request.headers.get("content-type") ?? "audio/webm" }), "clip.webm");
    form.append("response_format", "json");

    const response = await fetch(endpoint, { method: "POST", body: form });
    if (!response.ok) {
      return NextResponse.json({ message: "The squadron's transcription service did not answer." }, { status: 502 });
    }

    const data = (await response.json().catch(() => ({}))) as { text?: string };
    const text = typeof data.text === "string" ? data.text.trim() : "";

    return NextResponse.json({ text, message: text ? undefined : "Nothing could be made out of that." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "That could not be transcribed." }, { status: 500 });
  }
}
