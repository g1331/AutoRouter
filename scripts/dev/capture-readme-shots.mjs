// Regenerates the README / docs screenshots under docs/images.
//
//   pnpm dev                                  # in another terminal
//   node scripts/dev/capture-readme-shots.mjs
//
// Upstream identity (name + base URL) is blurred before every capture, so the
// published screenshots never leak which providers a deployment is wired to.
// Override the target with SHOT_BASE_URL; the admin token is read from .env.local.

import { readFileSync, existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const LOCALE = process.env.SHOT_LOCALE ?? "zh-CN";
const OUT_DIR = "docs/images";

function readAdminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^ADMIN_TOKEN=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("ADMIN_TOKEN not found in env or .env.local");
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const SHOTS = [
  { file: "dashboard-dark.png", path: "/dashboard", viewport: DESKTOP },
  { file: "logs-dark.png", path: "/logs", viewport: DESKTOP },
  { file: "upstreams-dark.png", path: "/upstreams", viewport: DESKTOP },
  { file: "upstream-detail-dark.png", path: "/upstreams/:firstUpstream", viewport: DESKTOP },
  { file: "keys-dark.png", path: "/keys", viewport: DESKTOP },
  { file: "billing-dark.png", path: "/system/billing", viewport: DESKTOP },
  { file: "login-dark.png", path: "/login", viewport: DESKTOP, anonymous: true },
  { file: "mobile-dashboard-dark.png", path: "/dashboard", viewport: MOBILE },
  { file: "mobile-upstreams-dark.png", path: "/upstreams", viewport: MOBILE },
  // The mobile logs view opens on the filter panel; scroll past it to the cards.
  { file: "mobile-logs-dark.png", path: "/logs", viewport: MOBILE, scroll: 900 },
  { file: "mobile-keys-dark.png", path: "/keys", viewport: MOBILE },
];

// Blurs the deepest element whose own text carries an upstream name or base URL.
// Runs in the page; `secrets` are the literal strings to hide.
function blurUpstreamIdentity(secrets) {
  const needles = secrets.filter(Boolean).map((s) => s.toLowerCase());
  if (needles.length === 0) return 0;
  let hits = 0;
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join(" ")
      .toLowerCase();
    const text = own.trim();
    if (!text) continue;
    // Some labels are truncated in JS ("CLIProxyAPI test …"), so the full name
    // never reaches the DOM — match those by prefix instead of substring.
    const truncated = /[…]|\.\.\.$/.test(text) ? text.replace(/[…]|\.\.\.$/, "").trim() : null;
    const matched =
      needles.some((n) => text.includes(n)) ||
      (truncated !== null && truncated.length >= 6 && needles.some((n) => n.startsWith(truncated)));
    if (!matched) continue;
    el.style.filter = "blur(6px)";
    hits += 1;
  }
  // Inputs keep their value in the DOM rather than in a text node.
  for (const el of document.querySelectorAll("input, textarea")) {
    const v = (el.value ?? "").toLowerCase();
    if (v && needles.some((n) => v.includes(n))) {
      el.style.filter = "blur(9px)";
      hits += 1;
    }
  }
  return hits;
}

const token = readAdminToken();

const res = await fetch(`${BASE_URL}/api/admin/upstreams`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`GET /api/admin/upstreams -> ${res.status}`);
const payload = await res.json();
const upstreams = payload.items ?? payload.data ?? payload;
const secrets = [];
for (const u of upstreams) {
  if (u.name) secrets.push(u.name);
  if (u.base_url) secrets.push(u.base_url, new URL(u.base_url).host);
}
const firstUpstream = upstreams[0]?.id;
console.log(`masking ${secrets.length} upstream identity strings`);

const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      locale: LOCALE,
    });
    await context.addInitScript(
      ({ token, anonymous }) => {
        localStorage.setItem("theme", "dark");
        if (!anonymous) sessionStorage.setItem("admin_token", token);
      },
      { token, anonymous: Boolean(shot.anonymous) }
    );

    const page = await context.newPage();
    const path = shot.path.replace(":firstUpstream", firstUpstream ?? "");
    // The admin shell holds SSE streams open, so `networkidle` never fires —
    // wait for the document instead and give data + animations a fixed budget.
    await page.goto(`${BASE_URL}/${LOCALE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(6000); // queries resolve, charts and count-ups settle

    // The Next.js dev-tools badge would otherwise sit in every screenshot.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

    if (shot.scroll) {
      await page.evaluate((y) => {
        const target =
          [...document.querySelectorAll("main, main *")].find(
            (el) => el.scrollHeight > el.clientHeight + 40
          ) ?? document.scrollingElement;
        target.scrollTop = y;
      }, shot.scroll);
      await page.waitForTimeout(800);
    }

    const hits = await page.evaluate(blurUpstreamIdentity, secrets);
    await page.screenshot({ path: `${OUT_DIR}/${shot.file}` });
    console.log(`${shot.file}  (blurred ${hits} nodes)`);

    await context.close();
  }
} finally {
  await browser.close();
}
