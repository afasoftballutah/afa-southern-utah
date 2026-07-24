import { RULES_SOURCE, RULES_SECTIONS } from "@/lib/content/rules";
import Card from "@/components/ui/Card";

export const metadata = { title: "Rules — AFA Southern Utah" };

export default function RulesPage() {
  return (
    <div className="space-y-4 relative">
      {/* Painterly eagle, faint — texture under the one static reading page,
          never a hero, never full opacity (Design direction, 2026-07-23). */}
      {/* Centered like a seal, not cornered like an accident (JD, 7/24). */}
      <img
        src="/afa-eagle-painterly.jpg"
        alt=""
        aria-hidden="true"
        className="absolute top-6 left-1/2 -translate-x-1/2 w-64 sm:w-80 h-auto pointer-events-none select-none print:hidden"
        style={{ opacity: 0.06 }}
      />
      <h1 className="text-2xl font-bold text-afa-navy relative">Rules</h1>
      <p className="text-sm text-afa-ink/70 relative">
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
      <p className="text-sm text-afa-ink/70 relative">
        Tournament-specific rules are listed on each tournament page.
      </p>
      <div className="space-y-3 relative">
        {RULES_SECTIONS.map((section, i) => (
          <Card key={i} variant="default">
            <details className="group">
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-11 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-lg text-afa-navy">
                  {section.number ? `${section.number} · ${section.heading}` : section.heading}
                </span>
                <span className="text-afa-muted transition-transform group-open:rotate-90">
                  &rsaquo;
                </span>
              </summary>
              <div className="mt-3 space-y-4">
                {section.rules.map((rule, j) => (
                  <div key={j}>
                    {(rule.number || rule.title) && (
                      <p className="text-sm font-bold text-afa-navy">
                        {[rule.number, rule.title].filter(Boolean).join(" ")}
                      </p>
                    )}
                    {rule.body && (
                      <p className="text-sm text-afa-ink/90 whitespace-pre-line">{rule.body}</p>
                    )}
                    {rule.items && rule.items.length > 0 && (
                      <ul className="list-disc pl-5 text-sm text-afa-ink/90 space-y-1">
                        {rule.items.map((item, k) => (
                          <li key={k}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
