// Division colors (JD 2026-11-10: "the coed colors are very close to each other").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIVISION_TONES, TONE_ALIASES, ALIKE_ON_PURPOSE } from "@/lib/division-tones";
import { divisionTone } from "@/lib/schedule-timeline";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// CIEDE2000 colour difference (sRGB, D65). ~2 is barely visible, under ~10
// reads as "the same color", 20+ as clearly different.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function lab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const rad = Math.PI / 180;
function deltaE(h1, h2) {
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
  const C = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)));
  const [A1, A2] = [a1 * (1 + G), a2 * (1 + G)];
  const [C1, C2] = [Math.hypot(A1, b1), Math.hypot(A2, b2)];
  const hue = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const [H1, H2] = [hue(b1, A1), hue(b2, A2)];
  let dh = C1 * C2 === 0 ? 0 : H2 - H1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2, Cm = (C1 + C2) / 2;
  let Hm = H1 + H2;
  if (C1 * C2 !== 0) Hm = Math.abs(H1 - H2) > 180 ? (H1 + H2 + (H1 + H2 < 360 ? 360 : -360)) / 2 : (H1 + H2) / 2;
  const T = 1 - 0.17 * Math.cos((Hm - 30) * rad) + 0.24 * Math.cos(2 * Hm * rad) + 0.32 * Math.cos((3 * Hm + 6) * rad) - 0.2 * Math.cos((4 * Hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cm, SH = 1 + 0.015 * Cm * T;
  const RT = -2 * Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((Hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const lum = (hex) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const MIN_APART = 12; // solids at least this far apart (CIEDE2000)
const CHAMPIONSHIP_GOLD = ["#c99a1e", "#8a6a10"]; // .tl-side-final border, gold place text

test("JD's Worlds colors stay put: Men's D red, Men's E blue, Women's D steel, Women's E green, Women's Rec pink, Coed D purple", () => {
  const solid = (k) => DIVISION_TONES[k].solid;
  assert.deepEqual(
    ["mens-d", "mens-e", "womens-d", "womens-e", "womens-rec", "coed-d"].map(solid),
    ["#dc2626", "#2563eb", "#334155", "#15803d", "#db2777", "#7c3aed"]
  );
  assert.equal(solid("coed-e"), "#005655"); // teal (darker after the Coed D purple swap)
  assert.equal(solid("coed-rec"), "#6b3a1f"); // brown
});

test("each Worlds division names its own tone, not the slate fallback", () => {
  for (const [key, name] of [["mens-d", "Men's D"], ["mens-e", "Men's E"], ["womens-d", "Women's D"], ["womens-e", "Women's E"],
    ["womens-rec", "Women's Rec"], ["coed-d", "Coed D"], ["coed-e", "Coed E"], ["coed-rec", "Coed Rec"]]) {
    assert.equal(divisionTone(name), key, name);
    assert.equal(DIVISION_TONES[key].name, name);
  }
  assert.equal(divisionTone("Women's Upper"), "womens-d");
  assert.equal(divisionTone("Gold"), "other");
});

test("app/globals.css paints exactly the colors in lib/division-tones.js", () => {
  const rules = [...css.matchAll(/\.tl-tone-([a-z-]+) \{ --tone-bg: (#[0-9a-f]{6}); --tone-ink: (#[0-9a-f]{6}); --tone-solid: (#[0-9a-f]{6}); \}/g)];
  const inCss = Object.fromEntries(rules.map(([, k, bg, ink, solid]) => [k, { bg, ink, solid }]));
  assert.deepEqual(Object.keys(inCss).sort(), Object.keys(DIVISION_TONES).sort());
  for (const [k, t] of Object.entries(DIVISION_TONES)) assert.deepEqual(inCss[k], { bg: t.bg, ink: t.ink, solid: t.solid }, k);
  for (const target of Object.values(TONE_ALIASES)) assert.ok(DIVISION_TONES[target]);
});

test("no two divisions look alike unless listed on purpose", () => {
  const ok = new Set(ALIKE_ON_PURPOSE.map(([a, b]) => [a, b].sort().join("|")));
  const keys = Object.keys(DIVISION_TONES);
  const close = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const [a, b] = [keys[i], keys[j]];
      const d = deltaE(DIVISION_TONES[a].solid, DIVISION_TONES[b].solid);
      if (d < MIN_APART && !ok.has([a, b].sort().join("|"))) close.push(`${a}/${b} ${d.toFixed(1)}`);
    }
  assert.deepEqual(close, []);
  // the three coeds, the reason for this test, are far apart
  // (the old pink / magenta / violet were 9-25 apart)
  const [d, e, rec] = ["coed-d", "coed-e", "coed-rec"].map((k) => DIVISION_TONES[k].solid);
  for (const [x, y] of [[d, e], [d, rec], [e, rec]]) assert.ok(deltaE(x, y) >= 30, `${x} ${y} ${deltaE(x, y).toFixed(1)}`);
});

test("no Worlds division is gold, so its games never look like the championship", () => {
  for (const k of ["mens-d", "mens-e", "womens-d", "womens-e", "womens-rec", "coed-d", "coed-e", "coed-rec"])
    for (const gold of CHAMPIONSHIP_GOLD) assert.ok(deltaE(DIVISION_TONES[k].solid, gold) >= 15, `${k} vs ${gold}`);
  assert.match(css, /\.tl-pill\.tl-side-final \{ border-color: #c99a1e; \}/);
});

// Men's Rec yellow predates this and is not at Worlds; white on it is 2.9:1.
const WHITE_ON_SOLID_TOO_LIGHT = new Set(["mens-rec"]);

test("readable on every pill style: ink on its tint and on white, white on solid, all >= 4.5:1", () => {
  for (const [k, t] of Object.entries(DIVISION_TONES)) {
    assert.ok(contrast(t.ink, t.bg) >= 4.5, `${k} ink on tint`);
    assert.ok(contrast(t.ink, "#ffffff") >= 4.5, `${k} ink on white`);
    if (WHITE_ON_SOLID_TOO_LIGHT.has(k)) continue;
    assert.ok(contrast("#ffffff", t.solid) >= 4.5, `${k} white on solid ${contrast("#ffffff", t.solid).toFixed(2)}`);
  }
});
