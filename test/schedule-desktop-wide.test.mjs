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

test("desktop Path is a 2x2 of compact horizontal day panels; phone geometry is unchanged", () => {
  assert.match(gridSrc, /width >= 1024 && grid\.days\.length/);
  assert.match(gridSrc, /function panelGridEl/);
  assert.match(gridSrc, /fg-days/);
  assert.match(gridSrc, /function jumpLabel/);
  assert.match(gridSrc, /if \(show && G\.vertical\) p\.classList\.add\("compact"\)/);
  assert.doesNotMatch(gridSrc, /G\.pw = Math\.max\(48, G\.hour - gap\)/);
  assert.match(gridSrc, /lab\("hour", label, u, G\.head - 18, G\.hour, "center"\)/);
  assert.match(gridSrc, /if \(G\.vertical\) \{ lab\("hour", label, 2, u \+ Math\.floor\(\(G\.hour - 11\) \/ 2\), G\.side - 6, "right"\)/);
  assert.match(gridSrc, /G\.lane = 84; G\.pw = 64; G\.ph = 40; G\.pad = 5;/);
  assert.match(gridSrc, /vertical\s*\n\s*\? \{ vertical: true, side: 40, head: 4, hour: show \? 48 : 86/);
  assert.match(gridSrc, /items\[i\]\.boardH = rowH/);
  assert.doesNotMatch(gridSrc, /overflowY\s*=\s*"auto"/);
  assert.match(gridSrc, /fitWidth: panelW/);
  assert.match(gridSrc, /vertical: false, fitWidth/);
  assert.match(gridSrc, /lab\("hour", label, u, G\.head - 16, G\.hour, "center"\)/);
  assert.match(gridSrc, /left:" \+ \(nu \+ 4\)/);
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

async function pathLayout(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".path-view");
    const root = host?.shadowRoot;
    if (!root) return null;
    const days = [...root.querySelectorAll(".fg-day")].map((el) => {
      const b = el.getBoundingClientRect();
      const title = (el.querySelector(".fg-day-title")?.textContent || "").trim();
      const scroll = el.querySelector(".fg-scroll") || el;
      const nows = [...el.querySelectorAll(".fg-nowtag")].map((n) => {
        const r = n.getBoundingClientRect();
        return { text: n.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      });
      const hourLabs = [...el.querySelectorAll(".fg-lab.hour")].map((n) => n.getBoundingClientRect());
      return {
        title, x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom,
        innerScroll: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
        nows,
        hourRights: hourLabs.map((r) => r.right),
        hourBoxes: hourLabs.map((r) => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom })),
      };
    });
    const hours = [...root.querySelectorAll(".fg-lab.hour")].map((el) => {
      const b = el.getBoundingClientRect();
      return { text: el.textContent.trim(), x: b.x, y: b.y };
    });
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const pills = [...root.querySelectorAll("button.pill")].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        text: (el.querySelector(".gno")?.textContent || "").trim(),
        w: b.width,
        h: b.height,
        x: b.x,
        y: b.y,
        right: b.right,
        bottom: b.bottom,
        compact: el.classList.contains("compact"),
        desk: el.classList.contains("desk"),
        inView: b.x >= 0 && b.right <= vp.w + 1 && b.y >= 0 && b.bottom <= vp.h + 1,
      };
    });
    const jumps = [...root.querySelectorAll(".fg-jump")].map((el) => el.textContent.trim());
    return { days, hours, pills, jumps, vp, panels: !!root.querySelector(".fg-days") };
  });
}

test("desktop Path is a 2x2 of compact horizontal day panels at 1440", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    await pickFirstTeam(page);
    await page.getByRole("button", { name: "Path view", exact: true }).click();
    await page.locator(".path-view").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const m = await pathLayout(page);
    assert.ok(m && m.panels && m.days.length, "day panels rendered");
    assert.ok(m.days.length <= 4, "at most four day panels");
    assert.ok(m.pills.length, "path pills rendered");
    assert.ok(m.pills.every((p) => p.compact && !p.desk), "desktop panel pills stay compact, not wider");
    assert.ok(m.pills.every((p) => p.w <= 48.5), "boxes stay 48px or narrower");
    assert.ok(m.pills.every((p) => p.h <= 32 + 0.5), "boxes are not taller than the compact 32px card");
    assert.ok(m.hours.every((h) => !h.text.includes(":")), "hour labels have no :00");
    // Hours run left to right across a panel, not down the page.
    const firstPanelHours = m.hours.filter((h) => Math.abs(h.y - m.hours[0].y) < 8);
    assert.ok(firstPanelHours.length >= 2, "a panel has more than one hour across the top");
    const xs = firstPanelHours.map((h) => h.x);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], "hour labels go left to right");
    const pitch = xs[1] - xs[0];
    for (const p of m.pills) {
      assert.ok(p.w <= pitch - 4, `${p.text} is wider than its hour slot (${p.w} vs ${pitch})`);
    }
    if (m.days.length >= 2) {
      const top = m.days.filter((d) => Math.abs(d.y - m.days[0].y) < 8);
      assert.ok(top.length === 2, "two days sit side by side on the top row");
    }
    for (const p of m.pills) {
      const day = m.days.find((d) => p.x >= d.x - 1 && p.right <= d.right + 2 && p.y >= d.y - 1 && p.y <= d.bottom + 1);
      assert.ok(day, `${p.text} is inside a day panel`);
      assert.ok(p.right <= day.right + 1, `${p.text} is clipped horizontally by ${day.title}`);
    }
  } finally {
    await page.close();
    await browser.close();
  }
});

test("unlit desktop Path shows every game with no panel scroll, and Now does not cover hour labels", { skip }, async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(SCHEDULE, { waitUntil: "networkidle", timeout: 90000 });
    await hide(page);
    const sel = page.locator("select").first();
    if (await sel.count()) {
      await sel.evaluate((el) => {
        const opt = [...el.options].find((o) => !o.value || /^find/i.test(o.textContent || ""));
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }
    await page.getByRole("button", { name: "Path view", exact: true }).click();
    await page.locator(".path-view").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const m = await pathLayout(page);
    assert.ok(m && m.panels && m.days.length === 4, "all four days render in the 2x2");
    const top = m.days.filter((d) => Math.abs(d.y - m.days[0].y) < 8);
    const bottom = m.days.filter((d) => d.y - m.days[0].y > 8);
    assert.equal(top.length, 2, "Thu and Fri on the top row");
    assert.equal(bottom.length, 2, "Sat and Sun on the bottom row");
    assert.ok(top[0].title.startsWith("Thu") && top[1].title.startsWith("Fri"), top.map((d) => d.title).join(" | "));
    assert.ok(bottom[0].title.startsWith("Sat") && bottom[1].title.startsWith("Sun"), bottom.map((d) => d.title).join(" | "));
    for (const d of m.days) {
      assert.equal(d.innerScroll, 0, `${d.title} must not scroll inside the panel`);
    }
    // Same row: equal panel heights (sized to the longer day).
    assert.ok(Math.abs(top[0].h - top[1].h) < 2, "top row panels share a height");
    assert.ok(Math.abs(bottom[0].h - bottom[1].h) < 2, "bottom row panels share a height");
    for (const p of m.pills) {
      const day = m.days.find((d) => p.x >= d.x - 1 && p.right <= d.right + 1 && p.y >= d.y - 1 && p.y <= d.bottom + 1);
      assert.ok(day, `${p.text} is inside a day panel`);
      assert.ok(p.bottom <= day.bottom + 1, `${p.text} is clipped by ${day.title} (pill ${p.bottom} vs panel ${day.bottom})`);
    }
    for (const d of m.days) {
      for (const now of d.nows) {
        for (const h of d.hourBoxes) {
          const overlap = now.x < h.right && now.right > h.x && now.y < h.bottom && now.bottom > h.y;
          assert.ok(!overlap, `Now overlaps an hour label in ${d.title}`);
        }
        const hourBottom = Math.max(...d.hourBoxes.map((h) => h.bottom), 0);
        assert.ok(now.y >= hourBottom - 2, `Now sits below the hour labels in ${d.title}`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
});
