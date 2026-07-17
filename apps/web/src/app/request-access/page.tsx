import { RequestAccessForm } from "@/components/auth/request-access-form";
import { getCloudflareEnv } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

export default function RequestAccessPage() {
  const env = getCloudflareEnv();
  return <main className="auth-page"><RequestAccessForm turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} /></main>;
}
