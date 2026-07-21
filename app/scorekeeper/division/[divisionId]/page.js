import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient, getServiceClient } from "@/lib/supabase";
import { getDivisionCompletion } from "@/lib/bracket/status";
import { isBracketDraft } from "@/lib/bracket/propagate";
import PinPad from "@/components/scorekeeper/PinPad";
import BracketManager from "@/components/scorekeeper/BracketManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorekeeper — Division" };

async function loadDivisionData(divisionId) {
  const supabase = getPublicClient();
  const { data: division, error } = await supabase
    .from("divisions")
    .select("id, name, tournament_id, tournaments(name)")
    .eq("id", divisionId)
    .maybeSingle();
  if (error || !division) return null;

  const { data: bracket } = await supabase
    .from("brackets")
    .select("*")
    .eq("division_id", divisionId)
    .maybeSingle();

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .order("bracket_side", { ascending: true })
    .order("round", { ascending: true })
    .order("slot", { ascending: true });

  // Team names only — the one safe field to carry over from registrations,
  // same pattern as the public placements table already uses.
  const service = getServiceClient();
  const { data: registrations } = await service
    .from("registrations")
    .select("team_name")
    .eq("division_id", divisionId)
    .order("submitted_at", { ascending: true });

  const draft = bracket ? await isBracketDraft(divisionId) : true;
  const completion = bracket ? await getDivisionCompletion(divisionId) : { complete: false };

  return {
    division,
    bracket,
    games: games ?? [],
    teamNames: (registrations ?? []).map((r) => r.team_name),
    draft,
    completion,
  };
}

export default async function ScorekeeperDivisionPage({ params }) {
  const { divisionId } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad />
      </div>
    );
  }

  const data = await loadDivisionData(divisionId);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-afa-ink/60">{data.division.tournaments?.name}</p>
        <h1 className="text-xl font-bold text-afa-navy">{data.division.name}</h1>
      </div>
      <BracketManager
        divisionId={divisionId}
        bracket={data.bracket}
        games={data.games}
        teamNames={data.teamNames}
        draft={data.draft}
        completion={data.completion}
      />
    </div>
  );
}
