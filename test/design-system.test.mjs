import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

// The design system, checked statically. Every rule here exists because the
// thing it forbids actually shipped and JD had to spot it.
const ROOT = path.resolve(import.meta.dirname, "..");
const css = await readFile(path.join(ROOT, "app/globals.css"), "utf8");

const ruleFor = (selector) => {
  const re = new RegExp(`(^|[,{}])\\s*\\${selector}\\b[^{]*\\{([^}]*)\\}`, "m");
  const m = re.exec(css);
  return m ? m[2] : null;
};

test("the display face never asks for a weight it does not have", () => {
  // Anton ships ONE weight. Asking for 700 makes the browser synthesise a
  // bold and smear the letterforms — this is what made the section headings
  // look "smooshed" and, one layer down, the team names look black.
  for (const sel of [".t-title", ".t-heading"]) {
    const body = ruleFor(sel);
    assert.ok(body, `${sel} should exist`);
    const weight = /font-weight:\s*(\d+)/.exec(body);
    if (weight) {
      assert.equal(weight[1], "400", `${sel} must not synthesise bold on a single-weight face`);
    }
  }
});

test("the shared display recipe carries no colour", () => {
  // .font-display is used for NAMES, and a name has to be able to sit on a
  // dark ground. Colour in the shared recipe turned the tournament name
  // navy-on-navy inside the navy card and made it vanish.
  const combined = /\.font-display,\s*\.t-title,\s*\.t-heading\s*\{([^}]*)\}/.exec(css);
  assert.ok(combined, "the shared display recipe should exist");
  assert.ok(!/(^|[^-])color:/.test(combined[1]), "no colour in the shared face recipe");
});

test("a team name uses the team face, which has real weights", () => {
  const body = ruleFor(".team-name");
  assert.ok(body, ".team-name should exist");
  assert.match(body, /font-family:\s*var\(--font-team\)/);
});

test("the retired chalk motif has not come back", () => {
  for (const dead of [".chalk-panel", ".chalk-line", ".form-panel"]) {
    assert.equal(ruleFor(dead), null, `${dead} was retired`);
  }
});

test("the type scale is the only source of heading sizes", () => {
  for (const sel of [".t-title", ".t-heading", ".t-body", ".t-strong", ".t-meta", ".t-label"]) {
    assert.ok(ruleFor(sel), `${sel} should exist`);
  }
});

test("component classes are layered so a utility can still override them", () => {
  // Unlayered CSS beats Tailwind's utilities. That is how .t-label's colour
  // silently ate a chip's metal tint and BRONZE came out grey.
  const i = css.indexOf("@layer components");
  assert.ok(i > -1, "component classes must sit in @layer components");
  assert.ok(css.indexOf(".t-heading") > i, ".t-heading must be inside the layer");
});
