import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient, getServiceClient } from "@/lib/supabase";
import { getDivisionCompletion } from "@/lib/bracket/status";
import { isBracketDraft } from "@/lib/bracket/propagate";
import { seedOrderFromPools } from "@/lib/bracket/seed";
import PinPad from "@/components/scorekeeper/PinPad";
import BracketManager from "@/components/scorekeeper/BracketManager";
import BracketScores from "@/components/scorekeeper/BracketScores";
import CreatePoolRoundRobin from "@/components/scorekeeper/CreatePoolRoundRobin";
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
    seedOrder: division.seed_order ?? null,
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
  //  - no pool, no games -> generate from director seed order.
  //  - pools finished, no bracket yet -> generate from pool finish order.
  //  - pools in progress -> StageView only (score pools first).
  const transcribed = !data.mainBracket && data.games.length > 0;
  const poolState = seedOrderFromPools(data.poolGames);
  const poolsReady = data.poolGames.length > 0 && poolState.complete;
  const noPoolPath =
    !data.mainBracket && data.games.length === 0 && data.poolGames.length === 0;
  const generatable =
    !data.mainBracket && data.games.length === 0 && (noPoolPath || poolsReady);
  const canCreatePool =
    !data.mainBracket &&
    data.games.length === 0 &&
    data.poolGames.length === 0 &&
    data.teamNames.length >= 2;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-afa-ink/60">{data.division.tournaments?.name}</p>
        <h1 className="t-title">{data.division.name}</h1>
      </div>
      {canCreatePool && (
        <CreatePoolRoundRobin
          divisionId={divisionId}
          teamCount={data.teamNames.length}
        />
      )}
      {data.poolGames.length > 0 && (
        <StageView
          divisionId={divisionId}
          tournamentSlug={data.division.tournaments?.slug}
          poolGames={data.poolGames}
          stages={data.stages}
          confirmedAt={data.confirmedAt}
          preferBracket={Boolean(data.mainBracket)}
          bracketPanel={
            data.mainBracket || generatable ? (
              <BracketManager
                divisionId={divisionId}
                mainBracket={data.mainBracket}
                consolationBracket={data.consolationBracket}
                games={data.games}
                teamNames={data.teamNames}
                seedOrder={data.seedOrder}
                poolGames={data.poolGames}
                mainDraft={data.mainDraft}
                consolationDraft={data.consolationDraft}
                completion={data.completion}
                tournamentSlug={data.division.tournaments?.slug}
                divisionName={data.division.display_name || data.division.name}
              />
            ) : null
          }
        />
      )}
      {transcribed && <BracketScores games={data.games} />}
      {/* No-pool path: bracket tools live on the page (not under StageView). */}
      {data.poolGames.length === 0 && (data.mainBracket || generatable) && (
        <BracketManager
          divisionId={divisionId}
          mainBracket={data.mainBracket}
          consolationBracket={data.consolationBracket}
          games={data.games}
          teamNames={data.teamNames}
          seedOrder={data.seedOrder}
          poolGames={data.poolGames}
          mainDraft={data.mainDraft}
          consolationDraft={data.consolationDraft}
          completion={data.completion}
          tournamentSlug={data.division.tournaments?.slug}
          divisionName={data.division.display_name || data.division.name}
        />
      )}
    </div>
  );
}
