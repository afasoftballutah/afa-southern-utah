// A rules line that ends in a link — "Full rules (PDF): /rules/x.pdf" —
// renders as a tappable link with the words before the colon as its text.
// Only site paths ("/…") and http(s) URLs count; anything else stays text.
export function parseRuleLink(line) {
  const m = /^(.+?):\s*((?:https?:\/\/|\/)[^\s]+?)\.?$/i.exec(String(line ?? "").trim());
  if (!m) return null;
  return { label: m[1].trim(), href: m[2] };
}
