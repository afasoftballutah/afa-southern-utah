import { RULES_SECTIONS, RULES_ARE_PLACEHOLDER } from "@/lib/content/rules";

export const metadata = { title: "Rules — AFA Southern Utah" };

export default function RulesPage() {
  return (
    <div className="space-y-4 relative">
      {/* Painterly eagle, faint — texture under the one static reading page,
          never a hero, never full opacity (Design direction, 2026-07-23). */}
      <img
        src="/afa-eagle-painterly.jpg"
        alt=""
        aria-hidden="true"
        className="absolute top-0 right-0 w-40 sm:w-56 h-auto pointer-events-none select-none print:hidden"
        style={{ opacity: 0.07 }}
      />
      <h1 className="text-2xl font-bold text-afa-navy relative">Rules</h1>
      {RULES_ARE_PLACEHOLDER && (
        <p className="text-sm text-afa-ink/60">
          Placeholder — the director&rsquo;s official rules doc isn&rsquo;t in yet. This is a general summary.
        </p>
      )}
      <div>
        {RULES_SECTIONS.map((section, i) => (
          <div key={section.heading}>
            {i > 0 && <div className="chalk-line" />}
            <div className="py-1">
              <h2 className="text-base font-bold text-afa-navy">{section.heading}</h2>
              <p className="text-sm mt-1 text-afa-ink/90">{section.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
