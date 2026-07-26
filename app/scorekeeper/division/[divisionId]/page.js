import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient, getServiceClient } from "@/lib/supabase";
import { getDivisionCompletion } from "@/lib/bracket/status";
import { isBracketDraft } from "@/lib/bracket/propagate";
import PinPad from "@/components/scorekeeper/PinPad";
import BracketManager from "@/components/scorekeeper/BracketManager";
import BracketScores from "@/components/scorekeeper/BracketScores";
import PoolPlayManager from "@/components/scorekeeper/PoolPlayManager";
import SeedBrackets from "@/components/scorekeeper/SeedBrackets";
import StageView from "@/components/scorekeeper/StageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorekeeper — Division" };

async function loadDivisionData(divisionId) {
  const supabase = getPublicClient();
  // `*` rather than a field list so bracket_confirmed_at rides along when
  // the migration has been applied and is simply absent when it has not.
  // An un-migrated database and an unconfirmed division then behave
  // identically, which is what lets this ship before the migration runs.
  const { data: division, error } = await supabase
    .from("divisions")
    .select("*, tournaments(name, slug)")
    .eq("id", divisionId)
    .maybeSingle();
  if (error || !division) return null;

  // The bracket stages this division owns (Gold/Silver/Bronze), with their
  // games, so the scorekeeper can show the bracket without leaving the
  // page it scores pool play on.
  const { data: children } = await supabase
    .from("divisions")
    .select("id, name, sort_order, games(*)")
    .eq("parent_division_id", divisionId)
    .order("sort_order", { ascending: true });

  const { data: brackets } = await supabase.from("brackets").select("*").eq("division_id", divisionId);

  // Pool play (dispatch-brief-7) — separate, self-contained stage from the
  // bracket engine. Public-read table, same anon client.
  const { data: poolGames } = await supabase
    .from("pool_games")
    .select("*")
    .eq("division_id", divisionId)
    .order("pool", { ascending: true })
    .order("scheduled_time", { ascending: true });

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

  const mainBracket = brackets?.find((b) => b.bracket_group === "main") ?? null;
  const consolationBracket = brackets?.find((b) => b.bracket_group === "consolation") ?? null;

  const mainDraft = mainBracket ? await isBracketDraft(divisionId, "main") : true;
  const consolationDraft = consolationBracket ? await isBracketDraft(divisionId, "consolation") : true;
  const completion = mainBracket ? await getDivisionCompletion(divisionId) : { complete: false };

  return {
    division,
    stages: (children ?? []).filter((c) => (c.games ?? []).length > 0),
    confirmedAt: division.bracket_confirmed_at ?? null,
    mainBracket,
    consolationBracket,
    games: games ?? [],
    poolGames: poolGames ?? [],
    teamNames: (registrations ?? []).map((r) => r.team_name),
    mainDraft,
    consolationDraft,
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

  // Which bracket surface a division gets:
  //
  //  - a `brackets` row exists -> BracketManager, the generated bracket it
  //    owns end to end.
  //  - games but no `brackets` row -> a transcribed bracket (Gold/Silver/
  //    Bronze, dispatch-brief-24). Read and score them; never offer to
  //    generate a new structure over live games.
  //  - pool play and no games of its own -> nothing here. Its teams are
  //    still in pools and its bracket games live in the Gold/Silver/Bronze
  //    divisions, filled from Seed Brackets above. BracketManager's "no
  //    bracket yet" screen used to render in this spot offering to build a
  //    double elimination out of `registrations`, a table these divisions
  //    do not use: it read "0 teams registered" with the button disabled,
  //    below a pool sheet listing 28 played games (JD, 2026-07-25).
  const transcribed = !data.mainBracket && data.games.length > 0;
  const generatable = !data.mainBracket && data.games.length === 0 && data.poolGames.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-afa-ink/60">{data.division.tournaments?.name}</p>
        <h1 className="t-title">{data.division.name}</h1>
      </div>
      {data.poolGames.length > 0 && (
        <StageView
          divisionId={divisionId}
          tournamentSlug={data.division.tournaments?.slug}
          poolGames={data.poolGames}
          stages={data.stages}
          confirmedAt={data.confirmedAt}
        />
      )}
      {transcribed && <BracketScores games={data.games} />}
      {(data.mainBracket || generatable) && (
        <BracketManager
          divisionId={divisionId}
          mainBracket={data.mainBracket}
          consolationBracket={data.consolationBracket}
          games={data.games}
          teamNames={data.teamNames}
          mainDraft={data.mainDraft}
          consolationDraft={data.consolationDraft}
          completion={data.completion}
        />
      )}
    </div>
  );
}
