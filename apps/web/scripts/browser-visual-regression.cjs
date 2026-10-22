#!/usr/bin/env node
/**
 * TN-170 browser-level visual and read-only smoke regression.
 *
 * Requires Playwright plus installed Chromium:
 *   NODE_PATH=/path/to/node_modules TN170_TEST_BASE_URL=https://... node scripts/browser-visual-regression.cjs
 *
 * Defaults to a public/login-only, non-destructive production check.
 * For authenticated module checks, provide an approved staging URL and a local
 * Playwright storage-state path. No secrets are committed or logged.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const rawUrl = process.env.TN170_TEST_BASE_URL || "https://tn170adminhub.tristanmaratos.com";
const target = new URL(rawUrl);
if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) {
  throw new Error("Test target must use HTTPS (or localhost HTTP).");
}
const url = target.origin;
const prodHost = "tn170adminhub.tristanmaratos.com";
const isProduction = target.hostname === prodHost;
const statePath = process.env.TN170_AUTH_STATE_PATH;
if (statePath && isProduction) {
  throw new Error("Authenticated browser regression must run on isolated staging, never production.");
}
const capturePrivate = process.env.TN170_CAPTURE_PRIVATE_SCREENSHOTS === "1";
if (capturePrivate && (!statePath || isProduction)) {
  throw new Error("Private screenshots require explicit opt-in and an authenticated staging session.");
}
const resultsDir = path.resolve(process.env.TN170_VISUAL_OUTPUT || "test-results/tn170-visual");
fs.mkdirSync(resultsDir, { recursive: true });

const viewports = [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1600", width: 1600, height: 1000 }
];
const protectedRoutes = [
  "/", "/tasks", "/spaces", "/calendar", "/goals", "/agents", "/documents",
  "/dashboards", "/readiness", "/compliance", "/communications", "/staff",
  "/duties", "/development", "/assets", "/finance", "/connections",
  "/integrations", "/settings", "/audit", "/admin/users", "/notifications", "/start-here"
];

const results = [];
const add = (scope, viewport, route, passed, message, details = {}) => {
  results.push({ scope, viewport, route, passed, message, ...details });
  process.stdout.write((passed ? "PASS" : "FAIL") + " [" + scope + "] " + viewport + " " + route + " — " + message + "\n");
};

async function renderInfo(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const viewport = doc.clientWidth;
    const actual = doc.scrollWidth;
    const all = [...document.querySelectorAll("main,header,nav,article,section,aside")];
    const huge = all
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right) };
      })
      .filter((rect) => rect.right > viewport + 3 || rect.left < -3)
      .length;
    return { viewport, scrollWidth: actual, overflow: Math.max(0, actual - viewport), wideLandmarks: huge };
  });
}

async function checkLogin(browser) {
  for (const v of viewports) {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      const response = await page.goto(url + "/login", { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.locator("body").waitFor();
      await page.screenshot({ path: path.join(resultsDir, "public-login-" + v.name + ".png"), fullPage: true, animations: "disabled" });
      const visual = await renderInfo(page);
      const hasGoogle = await page.getByRole("link", { name: /continue with google/i }).count();
      const hasPersonal = await page.getByRole("link", { name: /sign in with your personal email/i }).count();
      const badBrand = await page.locator('img[alt*="Air Force" i],img[alt*="USAF" i],img[src*="air-force" i]').count();
      // The merged redesign's login-form.tsx specifies a text-only neutral TN mark.
      // A live emblem here indicates deployment drift, even if its alt text is innocuous.
      const neutralMark = page.locator(".auth-brand .hub-neutral-mark");
      const matchesMergedBrand = await neutralMark.count() === 1 &&
        (await neutralMark.innerText()).trim() === "TN";
      const status = response?.status() ?? 0;
      const passed = status >= 200 && status < 400 && hasGoogle > 0 && hasPersonal > 0 &&
        !badBrand && matchesMergedBrand && visual.overflow <= 3;
      add("public-visual", v.name, "/login", passed,
        passed ? "Sign-in, neutral mark and viewport checks passed" : "Login, branding parity or viewport check failed",
        { httpStatus: status, overflowPx: visual.overflow, missingSignInLinks: hasGoogle < 1 || hasPersonal < 1,
          badBrandCount: badBrand, neutralBrandMatch: matchesMergedBrand });
    } catch (error) {
      add("public-visual", v.name, "/login", false, "Browser render failed: " + String(error).slice(0, 220));
    } finally { await context.close(); }
  }
}

async function checkProtected(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    // GET only. No logins, credentials, API writes or data mutations.
    for (const route of protectedRoutes) {
      try {
        const response = await page.goto(url + route, { waitUntil: "domcontentloaded", timeout: 35000 });
        const current = new URL(page.url());
        const redirected = current.pathname.startsWith("/login") || current.pathname.startsWith("/cdn-cgi/access");
        const forbidden = [401, 403].includes(response?.status() ?? 0);
        const passed = redirected || forbidden;
        add("production-authorization", "iphone-390", route, passed,
          passed ? "Unauthenticated access blocked" : "Protected route did not return a recognized login/denial response",
          { status: response?.status() ?? null, resultingPath: current.pathname });
      } catch (error) {
        add("production-authorization", "iphone-390", route, false, "Navigation failed: " + String(error).slice(0, 180));
      }
    }
  } finally { await context.close(); }
}

// Client-side, read-only UI interactions. Does not submit forms or invoke write endpoints.
async function testReadOnlyInteractions(page, viewport, route) {
  const interactions = {
    "/staff": { selector: "#staff-member-search", value: "test" },
    "/compliance": { selector: "#compliance-search", value: "test" },
    "/development": { selector: "#dv-member-search", value: "test" },
    "/audit": { selector: "#audit-search", value: "test" }
  };
  const entry = interactions[route];
  if (entry) {
    const input = page.locator(entry.selector);
    if (await input.count()) {
      await input.fill(entry.value);
      const value = await input.inputValue();
      add("staging-readonly-interaction", viewport, route, value === entry.value,
        value === entry.value ? "Search control accepts input" : "Search control did not retain input");
    } else {
      add("staging-readonly-interaction", viewport, route, false, "Expected search control missing: " + entry.selector);
    }
  }
  if (route === "/settings") {
    const details = page.locator("details.settings-advanced");
    if (await details.count()) {
      await details.locator("summary").click();
      const opened = await details.evaluate((node) => node.open);
      add("staging-readonly-interaction", viewport, route, opened,
        opened ? "Advanced configuration expands without submitting" : "Advanced configuration did not open");
    } else add("staging-readonly-interaction", viewport, route, false, "Advanced configuration disclosure missing");
  }
  if (route === "/calendar") {
    const agenda = page.locator(".cx-agenda");
    const month = page.locator(".cx-month");
    const passed = (await agenda.count()) > 0 && (await month.count()) > 0;
    add("staging-readonly-interaction", viewport, route, passed,
      passed ? "Month and accessible agenda both rendered" : "Calendar month grid or agenda missing");
  }
  if (route === "/dashboards") {
    const links = page.locator(".cd-quick-actions a");
    const count = await links.count();
    add("staging-readonly-interaction", viewport, route, count >= 5,
      count >= 5 ? "Operational report drilldown links available" : "Reporting shortcuts missing", { linkCount: count });
  }
  if (route === "/" && Number(viewport.match(/\d+/)?.[0] ?? 1000) < 900) {
    const more = page.getByRole("button", { name: "Open all features" });
    if (await more.count()) {
      await more.click();
      const menu = page.getByRole("navigation", { name: "Main destinations" });
      const visible = (await menu.count()) > 0 && await menu.first().isVisible();
      add("staging-readonly-interaction", viewport, route, visible,
        visible ? "All-features navigation drawer opens on mobile" : "Mobile drawer not visible after opening");
    } else add("staging-readonly-interaction", viewport, route, false, "More navigation control missing on mobile");
  }
}

async function checkAuthenticatedStaging(browser) {
  if (!statePath) {
    console.log("SKIP authenticated routes: TN170_AUTH_STATE_PATH not supplied; staging coverage outstanding.");
    return;
  }
  if (!fs.existsSync(statePath)) throw new Error("Staging auth-state file not found.");
  for (const v of viewports) {
    const context = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      storageState: statePath,
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const exceptions = [];
    page.on("pageerror", (error) => exceptions.push(error.message.slice(0, 120)));
    try {
      for (const route of protectedRoutes) {
        exceptions.length = 0;
        try {
          const response = await page.goto(url + route, { waitUntil: "domcontentloaded", timeout: 35000 });
          const current = new URL(page.url());
          const visual = await renderInfo(page);
          const unauthorized = current.pathname.startsWith("/login") || [401, 403].includes(response?.status() ?? 0);
          const passed = !unauthorized && (response?.status() ?? 500) < 400 && visual.overflow <= 3 && exceptions.length === 0;
          if (capturePrivate) {
            const slug = route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "_");
            await page.screenshot({ path: path.join(resultsDir, "PRIVATE-" + slug + "-" + v.name + ".png"), fullPage: true, animations: "disabled" });
          }
          add("staging-authenticated-readonly", v.name, route, passed,
            passed ? "Page loaded without horizontal overflow or uncaught errors" : "Page access, rendering or layout failed",
            { httpStatus: response?.status() ?? null, overflowPx: visual.overflow, runtimeErrorCount: exceptions.length, redirectedToLogin: unauthorized });
          if (passed) await testReadOnlyInteractions(page, v.name, route);
        } catch (error) {
          add("staging-authenticated-readonly", v.name, route, false, "Route failed: " + String(error).slice(0, 180));
        }
      }
    } finally { await context.close(); }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await checkLogin(browser);
    if (isProduction) await checkProtected(browser);
    await checkAuthenticatedStaging(browser);
  } finally { await browser.close(); }

  const summary = {
    targetHost: target.hostname,
    mode: statePath ? "authenticated-readonly-staging" : "public-readonly",
    executed: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results
  };
  fs.writeFileSync(path.join(resultsDir, "report.json"), JSON.stringify(summary, null, 2));
  console.log("\nBrowser checks: " + summary.passed + "/" + summary.executed + " passed.");
  if (summary.failed) process.exitCode = 1;
})().catch((error) => { console.error("Browser regression could not complete:", error.message); process.exitCode = 1; });
