import { RULES_SECTIONS, RULES_ARE_PLACEHOLDER } from "@/lib/content/rules";

export const metadata = { title: "Rules — AFA Southern Utah" };

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-afa-navy">Rules</h1>
      {RULES_ARE_PLACEHOLDER && (
        <p className="inline-block bg-yellow-100 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
          PLACEHOLDER — the director&rsquo;s official rules doc hasn&rsquo;t been added
          yet. This is a general summary.
        </p>
      )}
      <div className="bg-white rounded-lg shadow border border-afa-navy/10 divide-y divide-afa-navy/10">
        {RULES_SECTIONS.map((section) => (
          <div key={section.heading} className="p-4">
            <h2 className="font-bold text-afa-navy">{section.heading}</h2>
            <p className="text-sm mt-1 text-afa-ink/90">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
