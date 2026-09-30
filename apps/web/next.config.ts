import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";

// Only when actually developing, which is what the name says and what it is for.
//
// This was called unconditionally, and a Next config module runs for builds as well as for `next dev`. So
// every build opened a remote proxy session to the real Cloudflare account to borrow its bindings. On a
// machine with wrangler already logged in that is invisible - which is why it was never noticed - but it
// means a build was never a local, offline operation, and it failed the moment it ran anywhere without
// credentials. CI found it on the first attempt.
//
// Gating it here makes a build hermetic: it compiles the code in front of it and touches nothing live.
// `next dev` still gets its bindings, which is the only thing that needed them.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), "../..")
};

export default nextConfig;
