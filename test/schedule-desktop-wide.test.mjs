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

test("desktop Timeline hour columns are equal and sized so ~22 fit across", () => {
  assert.match(css, /--tl-fit: 22/);
  assert.match(css, /background-size: var\(--tl-hour\) 100%/);
  assert.match(css, /\.tl-track--axis \{[^}]*grid-template-columns: repeat\(var\(--tl-hours\), var\(--tl-hour\)\)/s);
  assert.match(css, /\.tl-hour \{[^}]*justify-content: center/s);
  assert.match(tlSrc, /100% \* \(\$\{game\.offset\} \/ 60\) \/ var\(--tl-hours\)/);
  assert.doesNotMatch(css, /--tl-hour-min, 92px/);
});

test("desktop Path is the Timeline grid; phone Path geometry is unchanged", () => {
  assert.match(tlSrc, /pathMode/);
  assert.match(tlSrc, /function PathRoutes/);
  assert.match(tlSrc, /pathVisible/);
  assert.doesNotMatch(gridSrc, /function panelGridEl/);
  assert.doesNotMatch(gridSrc, /fg-days/);
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

async function pickTeam(page, name) {
  const sel = page.locator("select").first();
  if (!(await sel.count())) return null;
  return sel.evaluate((el, name) => {
    const want = String(name).trim().toLowerCase();
    const opt = [...el.options].find((o) => (o.textContent || "").trim().toLowerCase() === want)
      || [...el.options].find((o) => (o.textContent || "").trim().toLowerCase().includes(want));
    if (!opt) return null;
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return opt.textContent.trim();
  }, name);
}

async function boardLayout(page) {
  return page.evaluate(() => {
    const days = [...document.querySelectorAll(".tl-day")].map((day) => {
      const title = (day.querySelector(".tl-day__title")?.textContent || "").trim();
      const scroll = day.querySelector(".tl-scroll");
      const field = day.querySelector(".tl-field");
      const hours = [...day.querySelectorAll(".tl-hour")].map((el) => {
        const b = el.getBoundingClientRect();
        return { text: el.textContent.trim(), x: b.x, y: b.y, w: b.width };
      });
      const fields = [...day.querySelectorAll(".tl-field:not(.tl-field--corner)")].map((el) => el.textContent.trim());
      const pills = [...day.querySelectorAll("button.tl-pill")].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-game-id"),
          text: (el.querySelector(".tl-pill__gno, .tl-pill__num")?.textContent || "").trim(),
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      });
      const hourW = hours[0]?.w ?? 0;
      const avail = (scroll?.clientWidth ?? 0) - (field?.getBoundingClientRect().width ?? 0);
      return {
        title, fields, hours, pills, hourW,
        fit: hourW > 0 ? Math.floor((avail + 0.5) / hourW) : 0,
        nHours: hours.length,
      };
    });
    const lines = document.querySelectorAll(".tl-path-line").length;
    return { days, lines };
  });
}

test("desktop Timeline and Path share equal hour columns and card positions at 1440", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.locator(".tl-grid").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const tl = await boardLayout(page);
    assert.ok(tl.days.length >= 1, "Timeline days rendered");
    const hourW = tl.days[0].hourW;
    assert.ok(hourW >= 54 && hourW <= 80, "hour width in the 20-25-column range: " + hourW);
    for (const d of tl.days) {
      assert.ok(d.hours.length && d.hours.every((h) => Math.abs(h.w - hourW) <= 1), d.title + " uses the same hour width");
    }
    assert.ok(tl.days[0].fit >= 20 && tl.days[0].fit <= 25, "20-25 hour columns fit across: " + tl.days[0].fit);

    await pickTeam(page, "208 Mafia") || await pickFirstTeam(page);
    await page.waitForTimeout(200);
    const tlTeam = await boardLayout(page);

    await page.getByRole("button", { name: "Path view", exact: true }).click();
    await page.locator(".path-view .tl-grid").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const path = await boardLayout(page);
    assert.ok(path.days.length === tlTeam.days.length, "Path has the same days as Timeline");
    assert.ok(path.lines > 0, "Path overlays win/loss lines");
    const pathHour = path.days[0].hourW;
    assert.ok(Math.abs(pathHour - hourW) <= 1, "Path uses the Timeline hour width");
    for (let i = 0; i < path.days.length; i++) {
      const a = tlTeam.days[i];
      const b = path.days[i];
      assert.equal(b.title, a.title);
      assert.deepEqual(b.fields, a.fields);
      assert.equal(b.nHours, a.nHours);
      assert.ok(b.hours.every((h) => Math.abs(h.w - pathHour) <= 1), b.title + " Path hours are equal");
      const tlById = new Map(a.pills.map((p) => [p.id, p]));
      assert.ok(b.pills.length <= a.pills.length, b.title + " never adds games");
      if (a.pills.length) assert.ok(b.pills.length < a.pills.length, b.title + " hides games the team cannot reach");
      for (const p of b.pills) {
        const q = tlById.get(p.id);
        assert.ok(q, "Path game " + p.id + " exists on Timeline");
        assert.ok(Math.abs(p.x - q.x) <= 1 && Math.abs(p.y - q.y) <= 1, "Path card position matches Timeline for " + p.text);
        assert.ok(Math.abs(p.w - q.w) <= 1 && Math.abs(p.h - q.h) <= 1, "Path card size matches Timeline for " + p.text);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
});
