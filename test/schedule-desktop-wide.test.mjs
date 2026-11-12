// Desktop schedule uses the screen width instead of the 56rem column
// (JD, 2026-11-12). Phones and other pages stay as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webkit } from "playwright";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const gridSrc = readFileSync(new URL("../lib/mcp/grid-view.js", import.meta.url), "utf8");
const tlSrc = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");

test("desktop schedule loosens the page cap and keeps comfortable side padding", () => {
  assert.match(css, /@media \(min-width: 640px\) \{[^}]*body:has\(\.sched-head\) \{ --page-width: none; \}/s);
  assert.match(css, /padding-inline: clamp\(24px, 3vw, 56px\)/);
  // Default public cap is unchanged (tournament home, division pages, phones).
  assert.match(css, /--page-width: 56rem;/);
  assert.match(css, /\.site-main \{[^}]*padding: 1\.5rem 1rem;/s);
});

test("desktop Timeline hour columns fill the width and labels are centered", () => {
  assert.match(css, /background-size: calc\(100% \/ var\(--tl-hours\)\)/);
  assert.match(css, /\.tl-track--axis \{[^}]*grid-template-columns: repeat\(var\(--tl-hours\), minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.tl-hour \{[^}]*justify-content: center/s);
  assert.match(tlSrc, /100% \* \(\$\{game\.offset\} \/ 60\) \/ var\(--tl-hours\)/);
});

test("desktop Path fills hour slots and fits the route; phone geometry is unchanged", () => {
  assert.match(gridSrc, /G\.ph = 48/);
  assert.match(gridSrc, /G\.lane = Math\.round\(G\.ph \* 1\.2\)/);
  assert.match(gridSrc, /G\.pw = Math\.max\(48, G\.hour - gap\)/);
  assert.match(gridSrc, /var gap = 10/);
  assert.match(gridSrc, /if \(show && G\.vertical\) p\.classList\.add\("compact"\)/);
  assert.match(gridSrc, /p\.classList\.add\("desk"\)/);
  assert.match(gridSrc, /lab\("hour", label, u, G\.head - 18, G\.hour, "center"\)/);
  assert.match(gridSrc, /if \(G\.vertical\) \{ lab\("hour", label, 2, u \+ Math\.floor\(\(G\.hour - 11\) \/ 2\), G\.side - 6, "right"\)/);
  assert.match(gridSrc, /G\.lane = 84; G\.pw = 64; G\.ph = 40; G\.pad = 5;/);
  assert.match(gridSrc, /vertical\s*\n\s*\? \{ vertical: true, side: 40, head: 4, hour: show \? 48 : 86/);
});

const BASE = process.env.BASE ?? "http://localhost:3210";
const up = await fetch(BASE, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
const skip = up ? false : "no server at " + BASE;
const SCHEDULE = `${BASE}/tournaments/2026-afa-world-series/schedule`;
const HOME = `${BASE}/tournaments/2026-afa-world-series`;

async function hide(page) {
  await page.addStyleTag({ content: "nextjs-portal, [data-next-badge-root] { display:none !important }" });
}

test("at 1440px the schedule uses the screen width; tournament home stays 56rem", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    const sched = await page.evaluate(() => {
      const main = document.querySelector(".site-main");
      const head = document.querySelector(".site-header__inner");
      const mb = main.getBoundingClientRect();
      const hb = head.getBoundingClientRect();
      return {
        mainW: mb.width,
        mainX: mb.x,
        headW: hb.width,
        headX: hb.x,
        padL: getComputedStyle(main).paddingLeft,
        padR: getComputedStyle(main).paddingRight,
        headPadL: getComputedStyle(head).paddingLeft,
      };
    });
    // 3vw of 1440 = 43.2px, clamped between 24 and 56.
    const pad = 43.2;
    assert.ok(Math.abs(parseFloat(sched.padL) - pad) < 1, `schedule pad ${sched.padL}`);
    assert.equal(sched.padL, sched.padR);
    assert.ok(Math.abs(sched.mainW - 1440) < 1, `schedule main ${sched.mainW}`);
    assert.ok(Math.abs(sched.headW - 1440) < 1, `header ${sched.headW}`);
    assert.ok(Math.abs(parseFloat(sched.headPadL) - pad) < 1, `header pad ${sched.headPadL}`);

    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.locator(".tl-grid").first().waitFor({ timeout: 20000 });
    const hours = await page.evaluate(() => {
      const track = document.querySelector(".tl-track--axis");
      const labels = [...track.querySelectorAll(".tl-hour")];
      const tb = track.getBoundingClientRect();
      const col = tb.width / labels.length;
      return labels.slice(0, 4).map((el, i) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        return { textMid: t.x + t.width / 2, col, trackX: tb.x, i };
      });
    });
    for (const h of hours) {
      const colMid = h.trackX + (h.i + 0.5) * h.col;
      assert.ok(Math.abs(h.textMid - colMid) < 2, `label text mid ${h.textMid} vs column mid ${colMid}`);
    }

    await page.goto(HOME, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    const home = await page.evaluate(() => {
      const main = document.querySelector(".site-main");
      const b = main.getBoundingClientRect();
      return { w: b.width, x: b.x, maxW: getComputedStyle(main).maxWidth, padL: getComputedStyle(main).paddingLeft };
    });
    assert.equal(home.maxW, "896px");
    assert.ok(Math.abs(home.w - 896) < 1, `home width ${home.w}`);
    assert.equal(home.padL, "16px");
  } finally {
    await page.close();
    await browser.close();
  }
});

test("phone Path and schedule gutters are unchanged at 390px", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    const m = await page.evaluate(() => {
      const main = document.querySelector(".site-main");
      const head = document.querySelector(".site-header__inner");
      return {
        mainW: main.getBoundingClientRect().width,
        padL: getComputedStyle(main).paddingLeft,
        padR: getComputedStyle(main).paddingRight,
        headPadL: getComputedStyle(head).paddingLeft,
        maxW: getComputedStyle(main).maxWidth,
      };
    });
    assert.ok(Math.abs(m.mainW - 390) < 1, `phone main ${m.mainW}`);
    assert.equal(m.padL, "16px");
    assert.equal(m.padR, "16px");
    assert.equal(m.headPadL, "10.4px"); // 0.65rem
    assert.equal(m.maxW, "896px");
  } finally {
    await page.close();
    await browser.close();
  }
});

async function pickFirstTeam(page) {
  const sel = page.locator("select").first();
  if (!(await sel.count())) return null;
  return sel.evaluate((el) => {
    const opt = [...el.options].find((o) => o.value && !/^find/i.test(o.textContent || ""));
    if (!opt) return null;
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return opt.textContent.trim();
  });
}

async function pathPills(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".path-view");
    const root = host?.shadowRoot;
    if (!root) return null;
    const hours = [...root.querySelectorAll(".fg-lab.hour")];
    const pitch = hours.length >= 2 ? hours[1].getBoundingClientRect().x - hours[0].getBoundingClientRect().x : 0;
    const vp = window.innerWidth;
    const pills = [...root.querySelectorAll("button.pill")].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        text: (el.querySelector(".gno")?.textContent || "").trim(),
        w: b.width,
        h: b.height,
        x: b.x,
        right: b.x + b.width,
        compact: el.classList.contains("compact"),
        desk: el.classList.contains("desk"),
        inView: b.x >= 0 && b.right <= vp + 0.5,
      };
    });
    return { pitch, pills, vp };
  });
}

test("desktop Path boxes fill the hour slots and the championship stays on screen at 1440", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    await pickFirstTeam(page);
    await page.getByRole("button", { name: "Path view", exact: true }).click();
    await page.locator(".path-view").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const m = await pathPills(page);
    assert.ok(m && m.pills.length, "path pills rendered");
    assert.ok(m.pills.every((p) => p.desk && !p.compact), "desktop team pills use the desk size, not compact");
    assert.ok(m.pills.every((p) => Math.abs(p.h - 48) < 1), "boxes are 48px tall");
    for (const p of m.pills) {
      const gap = m.pitch - p.w;
      assert.ok(gap >= 8 && gap <= 12, `${p.text}: gap ${gap} in hour ${m.pitch} (box ${p.w})`);
    }
    const g35 = m.pills.find((p) => p.text === "G35");
    assert.ok(g35, "G35 is drawn");
    assert.ok(g35.inView, `G35 stays on screen (x=${g35.x} right=${g35.right} vp=${m.vp})`);
  } finally {
    await page.close();
    await browser.close();
  }
});
