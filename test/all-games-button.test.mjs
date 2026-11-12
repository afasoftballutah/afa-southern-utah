// Tournament page: the small "All games" text link becomes a green
// "All Games and Brackets" button as wide as the Women's–Coed grid,
// not the page (JD, 2026-11-12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webkit } from "playwright";

const nav = readFileSync(new URL("../components/TournamentDivisionNav.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../components/TournamentTeamEntry.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const views = readFileSync(new URL("../lib/mcp/views.js", import.meta.url), "utf8");

test("All Games and Brackets keeps the schedule href and uses Path win green", () => {
  assert.match(nav, /All Games and Brackets/);
  assert.match(nav, /href=\{`\/tournaments\/\$\{slug\}\/schedule`\}/);
  assert.match(nav, /className="register-division-all"/);
  assert.doesNotMatch(entry, /All games/);
  assert.match(css, /--afa-action:\s*#15803d/);
  assert.match(views, /--win:\s*#15803d/);
  assert.match(css, /\.register-division-block\s*\{[^}]*width:\s*fit-content/s);
  assert.match(css, /\.register-division-all\s*\{[^}]*height:\s*2\.75rem/s);
  assert.match(css, /\.register-division-all\s*\{[^}]*border-radius:\s*0\.375rem/s);
  assert.match(css, /\.register-division-all\s*\{[^}]*background:\s*var\(--afa-action\)/s);
  assert.match(css, /\.register-division-all\s*\{[^}]*font-weight:\s*700/s);
  assert.match(css, /\.register-division-col__card\s*\{[^}]*height:\s*2\.75rem/s);
  assert.match(css, /\.register-division-col__card\s*\{[^}]*border-radius:\s*0\.375rem/s);
});

const BASE = process.env.BASE ?? "http://localhost:3210";
const up = await fetch(BASE, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
const skip = up ? false : "no server at " + BASE;
const PAGE = `${BASE}/tournaments/2026-afa-world-series`;

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
const DESK = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 };

async function measure(page) {
  const block = page.locator("#tournament-divisions");
  await block.waitFor({ timeout: 20000 });
  await block.scrollIntoViewIfNeeded();
  return page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        href: el.getAttribute?.("href") || null,
        x: b.x,
        w: b.width,
        h: b.height,
        right: b.x + b.width,
        bg: cs.backgroundColor,
        color: cs.color,
        radius: cs.borderRadius,
        weight: cs.fontWeight,
      };
    };
    return {
      page: document.documentElement.clientWidth,
      block: r(document.getElementById("tournament-divisions")),
      womens: r(document.querySelector(".register-division-col--womens")),
      coed: r(document.querySelector(".register-division-col--coed")),
      header: r(document.querySelector(".register-division-col__card--header")),
      all: r(document.querySelector(".register-division-all")),
    };
  });
}

function assertAligned(m, label) {
  assert.equal(m.all.text, "All Games and Brackets", label);
  assert.equal(m.all.href, "/tournaments/2026-afa-world-series/schedule", label);
  assert.ok(Math.abs(m.all.x - m.womens.x) < 1, `${label}: left ${m.all.x} vs Women's ${m.womens.x}`);
  assert.ok(Math.abs(m.all.right - m.coed.right) < 1, `${label}: right ${m.all.right} vs Coed ${m.coed.right}`);
  assert.ok(Math.abs(m.all.h - m.header.h) < 1, `${label}: height ${m.all.h} vs header ${m.header.h}`);
  assert.equal(m.all.radius, m.header.radius, label);
  assert.equal(m.all.bg, "rgb(21, 128, 61)", `${label} background`); // #15803d
  assert.equal(m.all.color, "rgb(255, 255, 255)", `${label} text`);
  assert.equal(m.all.weight, "700", label);
  // Must not span the page or the full DIVISIONS content column
  // (on a 390px phone the 316px grid is most of the viewport; the
  // content column is still wider because of page padding).
  assert.ok(m.all.w < m.block.w, `${label}: button ${m.all.w}px is narrower than the content column ${m.block.w}px`);
}

async function visit(browser, opts) {
  const page = await browser.newPage(opts);
  await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 });
  await page.addStyleTag({ content: "nextjs-portal, [data-next-badge-root] { display:none !important }" });
  const m = await measure(page);
  await page.close();
  return m;
}

test("All Games button spans the Women's–Coed grid on a 390px phone, not the page", { skip }, async () => {
  const browser = await webkit.launch();
  try {
    assertAligned(await visit(browser, PHONE), "390");
  } finally {
    await browser.close();
  }
});

test("All Games button spans the Women's–Coed grid on desktop, not the page", { skip }, async () => {
  const browser = await webkit.launch();
  try {
    assertAligned(await visit(browser, DESK), "desktop");
  } finally {
    await browser.close();
  }
});
