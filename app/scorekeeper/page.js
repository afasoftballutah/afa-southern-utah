import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient } from "@/lib/supabase";
import PinPad from "@/components/scorekeeper/PinPad";

export const dynamic = "force-dynamic"; // never cache — this is a live tool, not a public page
export const metadata = { title: "Scorekeeper" };

async function getTournamentsWithDivisions() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, start_date, is_placeholder, divisions(id, name, sort_order)")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).filter((t) => !t.is_placeholder);
}

export default async function ScorekeeperPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad />
      </div>
    );
  }

  const tournaments = await getTournamentsWithDivisions();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-afa-navy">Scorekeeper</h1>
      {tournaments.length === 0 ? (
        <p className="text-afa-ink/70 text-sm">
          No real tournaments yet — the 2023 placeholder season doesn&rsquo;t get brackets.
        </p>
      ) : (
        <div>
          {tournaments.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <div className="chalk-line" />}
              <div className="py-2">
                <p className="font-semibold text-afa-navy">{t.name}</p>
                <ul className="mt-1 space-y-1">
                  {(t.divisions ?? [])
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((d) => (
                      <li key={d.id}>
                        <Link href={`/scorekeeper/division/${d.id}`} className="text-afa-navy underline text-sm">
                          {d.name}
                        </Link>
                      </li>
                    ))}
                  {(t.divisions ?? []).length === 0 && (
                    <li className="text-sm text-afa-ink/50">No divisions yet</li>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
