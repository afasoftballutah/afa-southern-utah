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

test("desktop Timeline hour columns are equal and sized so 23 fit across", () => {
  assert.match(css, /--tl-fit: 23/);
  assert.match(css, /--tl-label-w: 4\.75rem/);
  assert.match(tlSrc, /dayPairs/);
  assert.match(css, /\.tl-day-split/);
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
    const rows = [...document.querySelectorAll(".tl-day--pair, .tl-day")].filter((el, i, all) => {
      return el.classList.contains("tl-day--pair") || !el.closest(".tl-vboard");
    });
    // Unique pair sections (class tl-day tl-day--pair).
    const seen = new Set();
    const sections = [];
    for (const el of document.querySelectorAll(".tl-day")) {
      if (seen.has(el)) continue;
      seen.add(el);
      sections.push(el);
    }
    const fieldSets = sections.map((sec) => {
      const fields = [...sec.querySelectorAll(".tl-row:not(.tl-row--axis) > .tl-field")].map((el) => el.textContent.trim());
      const b = sec.querySelector(".tl-scroll");
      return {
        fields,
        fieldW: sec.querySelector(".tl-field")?.getBoundingClientRect().width ?? 0,
        overflowX: b ? Math.max(0, b.scrollWidth - b.clientWidth) : 0,
        y: Math.round(sec.getBoundingClientRect().y),
        titles: [...sec.querySelectorAll(".tl-day__title")].map((t) => t.textContent.trim()),
      };
    });
    const days = [...document.querySelectorAll(".tl-day__span[data-day], .tl-day:not(.tl-day--pair)")].map((span) => {
      const sec = span.closest(".tl-day");
      const key = span.getAttribute("data-day");
      const title = (span.querySelector(".tl-day__title")?.textContent || span.querySelector(".tl-day__title")?.textContent || span.textContent || "").trim();
      const hourEls = key
        ? [...sec.querySelectorAll(`.tl-track--axis[data-day="${CSS.escape(key)}"] .tl-hour`)]
        : [...sec.querySelectorAll(".tl-hour")];
      const hours = hourEls.map((el) => {
        const b = el.getBoundingClientRect();
        return { text: el.textContent.trim(), x: b.x, y: b.y, w: b.width };
      });
      const pills = (key
        ? [...sec.querySelectorAll(`.tl-track[data-day="${CSS.escape(key)}"] button.tl-pill`)]
        : [...sec.querySelectorAll("button.tl-pill")]
      ).map((el) => {
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
      return {
        title: (span.querySelector(".tl-day__title")?.textContent || title).trim(),
        key,
        x: Math.round(span.getBoundingClientRect().x),
        y: Math.round(span.getBoundingClientRect().y),
        hours, pills, hourW, nHours: hours.length,
      };
    });
    const scroll = document.querySelector(".tl-scroll");
    const field = document.querySelector(".tl-field");
    const hourW = days[0]?.hourW ?? 0;
    const avail = (scroll?.clientWidth ?? 0) - (field?.getBoundingClientRect().width ?? 0);
    const lines = [...document.querySelectorAll(".tl-path-line")].map((el) => el.getAttribute("d") || "");
    return {
      days,
      fieldSets,
      fieldW: fieldSets[0]?.fieldW ?? 0,
      overflowX: Math.max(0, ...fieldSets.map((f) => f.overflowX)),
      hourW,
      fit: hourW > 0 ? Math.floor((avail + 0.5) / hourW) : 0,
      lines: lines.length,
      linePaths: lines,
    };
  });
}

test("desktop Timeline and Path share a 23-column two-day row grid at 1440", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.locator(".tl-grid").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const tl = await boardLayout(page);
    assert.ok(tl.days.length >= 2, "Timeline days rendered");
    const hourW = tl.hourW;
    assert.ok(hourW >= 48 && hourW <= 80, "hour width: " + hourW);
    assert.ok(tl.days.every((d) => d.hours.every((h) => Math.abs(h.w - hourW) <= 1)), "every day uses the same hour width");
    assert.ok(tl.fit >= 22 && tl.fit <= 24, "23 hour columns fit across: " + tl.fit);
    assert.ok(tl.fieldW > 0 && tl.fieldW < 112, "field column is tighter than 7rem: " + tl.fieldW);
    assert.ok(tl.overflowX <= 1, "nothing scrolls sideways at 1440: overflow " + tl.overflowX);
    const names = tl.days.map((d) => d.title);
    const thu = tl.days.find((d) => /Thu/i.test(d.title));
    const fri = tl.days.find((d) => /Fri/i.test(d.title));
    const sat = tl.days.find((d) => /Sat/i.test(d.title));
    const sun = tl.days.find((d) => /Sun/i.test(d.title));
    assert.ok(thu && fri && Math.abs(thu.y - fri.y) < 8, "Thursday and Friday share a row");
    assert.ok(sat && sun && Math.abs(sat.y - sun.y) < 8, "Saturday and Sunday share a row");
    assert.ok(fri.x > thu.x && sun.x > sat.x, "second day in each row sits to the right");
    assert.ok(sat.y > thu.y + 40, "Saturday/Sunday sit on the second row");
    const thuFri = (thu?.nHours ?? 0) + (fri?.nHours ?? 0);
    const satSun = (sat?.nHours ?? 0) + (sun?.nHours ?? 0);
    assert.ok(thuFri <= 23 && satSun <= 23, "row hour counts: TH+FR=" + thuFri + " SA+SU=" + satSun);
    for (const set of tl.fieldSets) {
      const uniq = new Set(set.fields);
      assert.equal(set.fields.length, uniq.size, "field labels appear once per row, not per day: " + set.fields.join(","));
    }

    await pickTeam(page, "208 Mafia") || await pickFirstTeam(page);
    await page.waitForTimeout(200);
    const tlTeam = await boardLayout(page);

    await page.getByRole("button", { name: "Path view", exact: true }).click();
    await page.locator(".path-view .tl-grid").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const path = await boardLayout(page);
    assert.ok(path.days.length === tlTeam.days.length, "Path has the same days as Timeline");
    assert.ok(path.lines > 0, "Path overlays win/loss lines");
    assert.ok(Math.abs(path.hourW - hourW) <= 1, "Path uses the Timeline hour width");
    assert.ok(path.overflowX <= 1, "Path does not scroll sideways at 1440");
    const tlById = new Map(tlTeam.days.flatMap((d) => d.pills).map((p) => [p.id, p]));
    const pathPills = path.days.flatMap((d) => d.pills);
    const tlPills = tlTeam.days.flatMap((d) => d.pills);
    assert.ok(pathPills.length && pathPills.length < tlPills.length, "Path hides games the team cannot reach");
    for (const p of pathPills) {
      const q = tlById.get(p.id);
      assert.ok(q, "Path game " + p.id + " exists on Timeline");
      assert.ok(Math.abs(p.x - q.x) <= 1 && Math.abs(p.y - q.y) <= 1, "Path card position matches Timeline for " + p.text);
      assert.ok(Math.abs(p.w - q.w) <= 1 && Math.abs(p.h - q.h) <= 1, "Path card size matches Timeline for " + p.text);
    }
    const pathThu = path.days.find((d) => /Thu/i.test(d.title));
    const pathFri = path.days.find((d) => /Fri/i.test(d.title));
    assert.ok(pathThu && pathFri && Math.abs(pathThu.y - pathFri.y) < 8, "Path Thursday and Friday share a row");
    const across = path.linePaths.filter((d) => {
      const nums = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
      if (nums.length < 2) return false;
      const dx = Math.abs(nums[nums.length - 1].x - nums[0].x);
      const dy = Math.abs(nums[nums.length - 1].y - nums[0].y);
      return dx > 80 && dx > dy;
    });
    assert.ok(across.length > 0, "Path arrows run left-to-right from Thursday into Friday");
  } finally {
    await page.close();
    await browser.close();
  }
});
