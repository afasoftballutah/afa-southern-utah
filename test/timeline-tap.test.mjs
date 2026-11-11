// Phone Timeline: tapping a game must open that game, even if another
// one is already open (JD, 2026-11-11: "When I click on 34 it jumps to 26").
// Skips when no server is up, same as test/routes.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webkit } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3210";
const up = await fetch(BASE, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
const skip = up ? false : "no server at " + BASE;
const SCHEDULE = `${BASE}/tournaments/2026-afa-world-series/schedule`;

const PHONE = {
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

function pill(page, division, n) {
  return page.locator(`button.tl-pill[aria-label^="${division} G${n}"]`);
}

async function openTimeline(page) {
  await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
  await page.addStyleTag({ content: "nextjs-portal, [data-next-badge-root] { display:none !important }" });
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(".tl-vboard").waitFor({ timeout: 20000 });
}

async function openInfo(page) {
  return page.evaluate(() => ({
    sheet: document.querySelector("[id^='tl-pop-']")?.innerText.match(/Game\s+\d+/)?.[0] ?? null,
    open: document.querySelector("button.tl-pill.is-open")?.getAttribute("aria-label") ?? null,
  }));
}

test("phone Timeline: tapping 34 while 32 is open opens 34, not 26", { skip }, async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await openTimeline(page);
    const p32 = pill(page, "Coed D", 32);
    const p34 = pill(page, "Coed D", 34);
    await p32.scrollIntoViewIfNeeded();
    await p32.tap();
    await page.waitForTimeout(400);
    const mid = await openInfo(page);
    assert.equal(mid.sheet, "Game 32", `expected Game 32 open first, got ${mid.sheet}`);
    await p34.tap();
    await page.waitForTimeout(500);
    const end = await openInfo(page);
    assert.equal(end.sheet, "Game 34", `tapping 34 must open Game 34, not ${end.sheet}`);
    assert.match(end.open ?? "", /^Coed D G34/);
  } finally {
    await browser.close();
  }
});

test("phone Timeline: tapping many cards across divisions and days opens the tapped game", { skip }, async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await openTimeline(page);
    const samples = [];
    for (const div of ["Men's D", "Women's D", "Coed D", "Coed E"]) {
      for (const n of [5, 18, 22, 26, 27, 32, 33, 34, 35]) {
        const loc = pill(page, div, n);
        if (await loc.count()) samples.push({ div, n, loc });
      }
    }
    assert.ok(samples.length >= 8, `expected many pills, got ${samples.length}`);

    const failures = [];
    for (const s of samples) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(50);
      await s.loc.scrollIntoViewIfNeeded();
      await s.loc.tap();
      await page.waitForTimeout(200);
      const info = await openInfo(page);
      if (info.sheet !== `Game ${s.n}` && !info.open?.startsWith(`${s.div} G${s.n}`)) {
        failures.push({ kind: "from-rest", ...s, info });
      }
    }

    const pairs = [
      ["Coed D", 32, 34],
      ["Coed D", 26, 32],
      ["Coed D", 34, 32],
      ["Coed D", 27, 34],
      ["Men's D", 5, 11],
      ["Men's D", 11, 15],
    ];
    for (const [div, a, b] of pairs) {
      const la = pill(page, div, a);
      const lb = pill(page, div, b);
      if (!(await la.count()) || !(await lb.count())) continue;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(50);
      await la.scrollIntoViewIfNeeded();
      await la.tap();
      await page.waitForTimeout(300);
      const y0 = await page.evaluate(() => window.scrollY);
      await lb.scrollIntoViewIfNeeded();
      await lb.tap();
      await page.waitForTimeout(400);
      const info = await openInfo(page);
      if (info.sheet !== `Game ${b}` && !info.open?.startsWith(`${div} G${b}`)) {
        failures.push({ kind: "switch", div, from: a, to: b, info, y0, y1: await page.evaluate(() => window.scrollY) });
      }
    }
    assert.deepEqual(failures, [], `wrong game opened: ${JSON.stringify(failures)}`);
  } finally {
    await browser.close();
  }
});
