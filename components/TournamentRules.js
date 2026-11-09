import { parseRuleLine } from "@/lib/rule-line";

// Tournament rules, scannable on a phone: "Label: a; b; c." lines become a
// bold label over bullets, "Label: text." a bold label and its text, a
// "Label: /path" line a link; anything else renders as written.
export default function TournamentRules({ lines }) {
  return (
    <div className="t-body space-y-2">
      {(lines ?? []).map((line, i) => {
        const rule = parseRuleLine(line);
        if (rule.kind === "link") {
          return (
            <p key={i}>
              <a
                href={rule.href}
                target="_blank"
                rel="noopener"
                className="text-afa-navy underline decoration-afa-navy/30 underline-offset-2"
              >
                {rule.label}
              </a>
            </p>
          );
        }
        if (rule.kind === "list") {
          return (
            <div key={i}>
              <p className="t-strong">{rule.label}</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {rule.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (rule.kind === "labeled") {
          return (
            <p key={i}>
              <span className="t-strong">{rule.label}:</span> {rule.text}
            </p>
          );
        }
        return <p key={i}>{rule.text}</p>;
      })}
    </div>
  );
}
