import { notFound } from "next/navigation";
import Link from "next/link";
import { requireDirectorPage } from "@/lib/staff-gate";
import { getPublicClient, getServiceClient } from "@/lib/supabase";
import { getDivisionCompletion } from "@/lib/bracket/status";
import { isBracketDraft } from "@/lib/bracket/propagate";
import { seedOrderFromPools } from "@/lib/bracket/seed";
import { stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import BracketManager from "@/components/scorekeeper/BracketManager";
import CreatePoolRoundRobin from "@/components/scorekeeper/CreatePoolRoundRobin";
import HandGames from "@/components/scorekeeper/HandGames";
import StageView from "@/components/scorekeeper/StageView";
import GameUmpireAssign from "@/components/scorekeeper/GameUmpireAssign";
import ScoreTable from "@/components/scorekeeper/ScoreTable";
import { knownPlayDay } from "@/lib/league-time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Division — Director" };

async function loadDivisionData(divisionId) {
  const supabase = getPublicClient();
  // `*` rather than a field list so bracket_confirmed_at rides along when
  // the migration has been applied and is simply absent when it has not.
  // An un-migrated database and an unconfirmed division then behave
  // identically, which is what lets this ship before the migration runs.
  const { data: division, error } = await supabase
    .from("divisions")
    .select("*, tournaments(name, slug, start_date, end_date)")
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

  let umpires = [];
  try {
    const { data: umpRows } = await service
      .from("umpires")
      .select("id, first_name, last_name, pitch_fast, pitch_slow, status")
      .eq("status", "active")
      .order("last_name")
      .order("first_name");
    const tournamentId = division.tournament_id ?? null;
    let suspMap = new Map();
    if ((umpRows ?? []).length) {
      const {
        loadSuspensionsForUmpires,
        activeUmpireSuspensionMap,
      } = await import("@/lib/suspensions");
      const { leagueToday } = await import("@/lib/tournament-state");
      const rows = await loadSuspensionsForUmpires(
        service,
        umpRows.map((r) => r.id)
      );
      suspMap = activeUmpireSuspensionMap(rows, {
        tournamentId,
        asOf: leagueToday(),
      });
    }
    umpires = (umpRows ?? []).map((r) => {
      const susp = suspMap.get(r.id) ?? null;
      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        pitchFast: r.pitch_fast,
        pitchSlow: r.pitch_slow,
        status: r.status,
        suspended: Boolean(susp),
        suspensionNote: susp?.note ?? null,
      };
    });
  } catch {
    umpires = [];
  }

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
    umpires,
  };
}

function ViewDoors({ divisionId, view }) {
  const scores = view === "scores";
  const base = `/director/division/${divisionId}`;
  return (
    <div className="seg-view" role="tablist" aria-label="This division">
      <Link href={base} className={scores ? "btn-transient" : "btn-info"} role="tab" aria-selected={!scores}>
        Matchups
      </Link>
      <Link href={`${base}?view=scores`} className={scores ? "btn-info" : "btn-transient"} role="tab" aria-selected={scores}>
        Scores
      </Link>
    </div>
  );
}

export default async function DirectorDivisionPage({ params, searchParams }) {
  const { divisionId } = await params;
  const rawView = (await searchParams)?.view;
  const view = (Array.isArray(rawView) ? rawView[0] : rawView) === "scores" ? "scores" : "matchups";
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="py-8">
        <PinPad room="director" />
      </div>
    );
  }

  const data = await loadDivisionData(divisionId);
  if (!data) notFound();

  // Which bracket surface a division gets:
  //
  //  - a `brackets` row exists -> BracketManager, the generated bracket it
  //    owns end to end.
  //  - games but no `brackets` row -> hand-built / transcribed. Score them;
  //    never offer to generate a new structure over live games.
  //  - no pool, no games -> generate from director seed order.
  //  - pools finished, no bracket yet -> generate from pool finish order.
  //  - pools in progress -> StageView only (score pools first).
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

  const openPool = stillToPlayIn(data.poolGames);
  const openBracket = stillToPlayIn(data.games);
  const playDay = knownPlayDay(data.division);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm text-afa-ink/60">{data.division.tournaments?.name}</p>
          <h1 className="t-title">{data.division.name}</h1>
        </div>
        <Link href="/director/tournaments" className="btn-transient text-sm">
          ← Tournaments
        </Link>
      </div>
      <ViewDoors divisionId={divisionId} view={view} />
      {view === "scores" ? (
        <div className="space-y-4">
          {data.poolGames.length > 0 ? (
            <ScoreTable games={data.poolGames} kind="pool" title="Pool play" />
          ) : null}
          {data.games.length > 0 ? (
            <ScoreTable games={data.games} kind="bracket" title="Bracket" />
          ) : null}
          {data.poolGames.length === 0 && data.games.length === 0 ? (
            <p className="t-meta">No games to score yet.</p>
          ) : null}
        </div>
      ) : (
      <>
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
          playDay={playDay}
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
                playDay={playDay}
              />
            ) : null
          }
        />
      )}
      {!data.mainBracket && (data.poolGames.length === 0 || poolsReady) ? (
        <HandGames
          divisionId={divisionId}
          games={data.games}
          teamNames={data.teamNames}
          playDay={playDay}
          divisionName={data.division.display_name || data.division.name}
        />
      ) : null}
      {/* No-pool path: generated-bracket tools (not under StageView). */}
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
          playDay={playDay}
        />
      )}

      {(openPool.length > 0 || openBracket.length > 0) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-heading">Assign umpires</h2>
            <Link href="/director/umpires" className="btn-transient text-sm">
              Umpire roster →
            </Link>
          </div>
          {data.umpires.length === 0 ? (
            <p className="t-meta">
              No active umpires.{" "}
              <Link href="/director/umpires" className="underline">
                Add the roster
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-2">
              {openPool.map((g) => (
                <GameUmpireAssign
                  key={g.id}
                  gameId={g.id}
                  kind="pool"
                  umpires={data.umpires}
                  umpire1Id={g.umpire1_id}
                  umpire2Id={g.umpire2_id}
                  team1={g.team1_name}
                  team2={g.team2_name}
                  meta={g.pool ? `Pool ${g.pool}` : null}
                />
              ))}
              {openBracket.map((g) => (
                <GameUmpireAssign
                  key={g.id}
                  gameId={g.id}
                  kind="bracket"
                  umpires={data.umpires}
                  umpire1Id={g.umpire1_id}
                  umpire2Id={g.umpire2_id}
                  team1={g.team1_name}
                  team2={g.team2_name}
                  meta={g.round != null ? `#${g.round}` : null}
                />
              ))}
            </div>
          )}
        </section>
      )}
      </>
      )}
    </div>
  );
}
