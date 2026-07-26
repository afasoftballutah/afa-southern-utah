import { RULES_SOURCE, RULES_SECTIONS } from "@/lib/content/rules";
import RulesBrowser from "@/components/RulesBrowser";

export const metadata = { title: "Rules — AFA Southern Utah" };

// The painterly-eagle watermark came off this page 2026-07-24, for two
// reasons both specific to it: the source is a JPEG carrying its own grey
// background, so at 6% opacity it rendered as a rectangular tint block
// rather than an eagle; and the page is now twenty white cards, which
// leaves no clean field for texture — the tint only showed in the gaps
// between cards, reading as an artifact. If the eagle belongs here it
// needs a transparent cut-out PNG. The watermark behind the bracket's
// Final zone is a different asset and is unaffected.
export default function RulesPage() {
  return (
    <div className="space-y-4">
      <h1 className="h-page">Rules</h1>
      <p className="text-sm text-afa-ink/70">
        {RULES_SOURCE.title} ({RULES_SOURCE.year}) —{" "}
        <a
          href={RULES_SOURCE.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-afa-navy"
        >
          View the original PDF
        </a>
      </p>
      <p className="text-sm text-afa-ink/70">
        Tournament-specific rules are listed on each tournament page.
      </p>
      <RulesBrowser sections={RULES_SECTIONS} />
    </div>
  );
}
