/**
 * Division colors, one explicit entry per division (JD, 2026-11-09/10;
 * 2026-11-10 "switch Coed D and Womens Rec colors").
 * The timeline paints with the matching `.tl-tone-<key>` rule in
 * app/globals.css: `bg` is the pale tint, `ink` the text on it and on white,
 * `solid` the filled pill (white text) and every border. A test keeps the
 * CSS equal to this list and fails when two tones look alike, so a new
 * division gets its own color on purpose, never a silent repeat. Gold is
 * kept for championship games (border #c99a1e), so no division is gold.
 */
export const DIVISION_TONES = {
  "mens-d": { name: "Men's D", bg: "#fde3e3", ink: "#a51c1c", solid: "#dc2626" }, // red
  "mens-e": { name: "Men's E", bg: "#dde8ff", ink: "#1c3f9e", solid: "#2563eb" }, // blue
  "mens-open": { name: "Men's Open", bg: "#fde2ea", ink: "#9d174d", solid: "#db2777" },
  "mens-rec": { name: "Men's Rec", bg: "#fff1c9", ink: "#854d0e", solid: "#ca8a04" },
  "womens-d": { name: "Women's D", bg: "#e4ebf2", ink: "#1e293b", solid: "#334155" }, // steel / slate
  "womens-e": { name: "Women's E", bg: "#d8f3e0", ink: "#14642f", solid: "#15803d" }, // green
  "womens-rec": { name: "Women's Rec", bg: "#fce7f3", ink: "#9d174d", solid: "#db2777" }, // pink
  "coed-d": { name: "Coed D", bg: "#ebe4ff", ink: "#5626b0", solid: "#7c3aed" }, // purple
  "coed-e": { name: "Coed E", bg: "#d3eff1", ink: "#003f3e", solid: "#005655" }, // teal
  "coed-open": { name: "Coed Open", bg: "#e9e2fb", ink: "#5b21b6", solid: "#7c3aed" },
  "coed-rec": { name: "Coed Rec", bg: "#eadbd0", ink: "#5a2e14", solid: "#6b3a1f" }, // brown
  other: { name: "Other", bg: "#e9edf2", ink: "#334155", solid: "#64748b" }, // slate
};

/** Other names for a tone's division; they share its color on purpose. */
export const TONE_ALIASES = { "womens-upper": "womens-d", "womens-lower": "womens-e" };

/**
 * Tones allowed to look alike, each with its reason. Anything else that
 * comes too close fails test/division-tones.test.mjs.
 */
export const ALIKE_ON_PURPOSE = [
  // Flagged to JD: both pairs DO share events (2026 T-shirt Aug 22; Men's
  // Open + Women's Rec also 2026 Halloween Oct 23). Worlds has no Open.
  ["mens-open", "womens-rec", "same pink; shared T-shirt + Halloween 2026, not at Worlds"],
  ["coed-open", "coed-d", "same purple; shared T-shirt 2026, not at Worlds"],
];
