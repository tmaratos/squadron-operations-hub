import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { exchangeMicrosoftCode, microsoftProfile } from "@/lib/microsoft/graph";
import { saveMailAccount } from "@/lib/google/mail-accounts";

// Where Microsoft sends somebody back after they have connected a mailbox.

function back(request: Request, note: string): NextResponse {
  return NextResponse.redirect(new URL("/connections?mail=" + note + "#mail", request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Microsoft says why it refused, and the reasons are genuinely different problems: somebody pressing
  // Cancel is not the same as a workplace administrator forbidding the whole application, and telling
  // both of them "that did not work" leaves the second one with nothing to act on.
  if (url.searchParams.has("error")) {
    const reason = url.searchParams.get("error") ?? "";
    const detail = (url.searchParams.get("error_description") ?? "").toLowerCase();
    if (reason === "access_denied" && detail.includes("admin")) return back(request, "microsoft_blocked");
    if (detail.includes("consent") && detail.includes("admin")) return back(request, "microsoft_blocked");
    return back(request, reason === "access_denied" ? "microsoft_denied" : "microsoft_failed");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back(request, "microsoft_failed");

  // The state has to be the one this browser was given, or the round trip did not start here.
  const store = await cookies();
  const expected = store.get("ms_oauth_state")?.value;
  store.delete("ms_oauth_state");
  if (!expected || expected !== state) return back(request, "microsoft_failed");

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const profile = await microsoftProfile(tokens.access_token);
    if (!profile.email) return back(request, "microsoft_failed");

    await saveMailAccount({
      userId: user.id,
      email: profile.email,
      provider: "MICROSOFT",
      googleSubject: profile.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "MAILBOX_ADDED",
      entityType: "user",
      entityId: user.id,
      summary: user.fullName + " connected the Microsoft mailbox " + profile.email + " for reading",
      metadata: { email: profile.email, provider: "MICROSOFT" }
    });

    return back(request, "microsoft_connected");
  } catch (error) {
    console.error(error);
    return back(request, "microsoft_failed");
  }
}
