import { parseRuleLink } from "./rule-link";

// One Tournament rules line, shaped for a phone (JD, 2026-11-09: "clean up
// the rules so it isnt just a text blob"):
//   "Label: /path"               → link (see rule-link.js)
//   "Label: one; two; three."    → bold label over a bulleted list
//   "Label: text."               → bold label, then the text
//   anything else ("BYOB.")      → plain text, as before
export function parseRuleLine(line) {
  const text = String(line ?? "").trim();
  const link = parseRuleLink(text);
  if (link) return { kind: "link", ...link };
  const m = /^([^:;,.]{1,40}):\s+(.+)$/.exec(text);
  if (!m) return { kind: "plain", text };
  const label = m[1].trim();
  const body = m[2].trim().replace(/\.$/, "");
  const items = body.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  if (items.length >= 2) return { kind: "list", label, items };
  return { kind: "labeled", label, text: m[2].trim() };
}
