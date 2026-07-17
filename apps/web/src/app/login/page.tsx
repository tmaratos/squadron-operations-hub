import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const env = getCloudflareEnv();
  return <main className="auth-page"><LoginForm turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} /></main>;
}
