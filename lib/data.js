import { getPublicClient } from "./supabase";

// All reads here use the anon key (RLS-gated, public-read-only tables).
// Pages that call these should set `export const revalidate = 30` so
// Next.js serves them off the Vercel CDN and revalidates in the
// background — readers never hit Supabase directly on tournament day.

// Home hero stays Southern Utah only (JD ruling 2026-07-23) — it's the
// league the tool is built for; registration/brackets/scorekeeper are
// scoped to this region. Northern Utah and Series are schedule-only.
export async function getUpcomingTournament() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*)")
    .eq("status", "upcoming")
    .eq("region", "southern_utah")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSeasonList() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*)")
    .eq("region", "southern_utah")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// All three regions, grouped for the Tournaments page — Southern Utah
// first (home base), then Northern Utah, then the Series circuit.
const REGION_ORDER = ["southern_utah", "northern_utah", "series"];
export const REGION_LABEL = {
  southern_utah: "Southern UT/NV",
  northern_utah: "Northern Utah",
  series: "AFA Tournament Series",
};

export async function getSeasonListByRegion() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*)")
    .order("start_date", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  return REGION_ORDER.map((region) => ({
    region,
    label: REGION_LABEL[region],
    tournaments: rows.filter((t) => t.region === region),
  })).filter((g) => g.tournaments.length > 0);
}

// Shared placeholder-poster detection (Tournaments list + Tournament lobby,
// dispatch-brief-3) — a poster_url still pointing at the 2026 season-schedule
// flyer is the shared placeholder every row was seeded with, not a real
// per-event poster (afa-dispatch-brief-2.md). One definition, both pages.
const PLACEHOLDER_POSTER_PATH = "posters/2026-schedule.jpg";
export function isRealPoster(t) {
  return Boolean(t?.poster_url) && !t.poster_url.includes(PLACEHOLDER_POSTER_PATH);
}

// A divisions_offered entry that's actually a group name (Men's/Women's/
// Coed), not a division (Rec/E/D/Open...) — case-insensitive, apostrophe
// forms normalized. "No double-speak": a card that already names its
// groups must not echo them as division chips. One definition, shared by
// the tournaments list and the tournament lobby.
export function isGroupName(entry) {
  const normalized = String(entry ?? "").trim().toLowerCase().replace(/[‘’]/g, "'");
  return ["mens", "men's", "womens", "women's", "coed"].includes(normalized);
}

// Lightweight read for the .ics route — the fields an all-day calendar
// event needs, plus each division's day_date (dispatch-brief-5) so the
// route can split into one VEVENT per distinct day. No placements/
// brackets/games nesting.
export async function getTournamentBasicsBySlug(slug) {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "slug, name, start_date, end_date, venue_name, venue_address, divisions(name, display_name, day_date)"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTournamentBySlug(slug) {
  const supabase = getPublicClient();
  // brackets(*) and games(*) are the same public-read tables the
  // scorekeeper's grouped list already fetches over the anon client (RLS
  // policies "public read brackets"/"public read games" — see
  // supabase/schema.sql). Added here so the public bracket TREE renderer
  // can draw the same data read-only, with no new query, no new table,
  // no new security surface.
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*, placements(*), brackets(*), games(*))")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The bracket's own page (dispatch-brief-6, JD ruling: "the bracket stays on
// its own page for each division"). Same public-read tables getTournamentBySlug
// already joins, just entered from the divisions side and one row deep, plus
// the parent tournament (divisions -> tournaments is the one tournament_id FK)
// so the page can render the back link and validate the slug in the URL
// actually belongs to this division.
export async function getDivisionById(divisionId) {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("divisions")
    // The tournament's full division list rides along so the page can find
    // this division's bracket children (Gold/Silver) — or, when this IS a
    // child, its siblings for the bracket toggle. One query, no extra trip.
    .select(
      "*, placements(*), brackets(*), games(*), pool_games(*), tournament:tournaments(*, divisions(id, name, display_name, sort_order, parent_division_id))"
    )
    .eq("id", divisionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Pool play (dispatch-brief-7) — a separate, self-contained stage from the
// bracket engine. Public read, same anon client as every other public
// table. getDivisionById already joins pool_games(*) for the division
// page; this standalone fetch is for the scorekeeper's own load path,
// which reads divisions directly rather than through getDivisionById.
export async function getPoolGames(divisionId) {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("pool_games")
    .select("*")
    .eq("division_id", divisionId)
    .order("pool", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Which bracket does each team play in? Reads the seed slots off the
 * bracket stages' own games — the only place that answer is written down.
 *
 * A slot names its team one of two ways: a seed_ref ("A #1") before pool
 * play is applied, or the real team name after. Both are read here, name
 * winning where they disagree, because the name is what the director
 * actually wrote.
 *
 * Returns rows, not a map — the caller owns resolving a seed_ref to a
 * team, since that needs the pool standings it already computed.
 */
export async function getBracketSeedSlots(divisionIds) {
  if (!divisionIds || divisionIds.length === 0) return [];
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("games")
    .select("division_id, team1_name, team2_name, team1_seed_ref, team2_seed_ref")
    .in("division_id", divisionIds);
  if (error) throw error;
  return data ?? [];
}

/**
 * Who still has a game coming, for one tournament. Derived by the hourly
 * sync (lib/elimination.js) and stored, so a page can tell a team their
 * weekend is over without loading the whole tournament to work it out.
 *
 * Returns a plain object keyed by team name. A team with NO entry still
 * has a game coming — absence is the answer, not a missing answer.
 */
export async function getTeamStatus(tournamentId) {
  if (!tournamentId) return {};
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("team_status")
    .select("team_name, state, last_game_label, last_game_at, bracket_name, placement")
    .eq("tournament_id", tournamentId);
  // Never let this break a page. It is a nicety on top of the scores, and
  // a tournament whose sync has not run yet simply has none of it.
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.team_name, r]));
}

/**
 * Every game in a set of divisions, for a page that needs to render its
 * bracket CHILDREN as well as itself. getDivisionById joins games for the
 * one division it fetches; the sibling list it carries along deliberately
 * does not, because most pages never draw them.
 */
export async function getGamesForDivisions(divisionIds) {
  if (!divisionIds || divisionIds.length === 0) return {};
  const supabase = getPublicClient();
  const { data, error } = await supabase.from("games").select("*").in("division_id", divisionIds);
  if (error) throw error;
  const byDivision = {};
  for (const g of data ?? []) (byDivision[g.division_id] ??= []).push(g);
  return byDivision;
}

// Short bracket-round descriptor (dispatch-brief-11), e.g. "Winners R2" —
// derived straight off bracket_side + round the games row already carries.
// Deliberately not the paper-convention game numbering (assignGameNumbers
// in lib/bracket/tree.js): that needs the full division's game set to
// compute, and this label is meant to be short, not authoritative.
import { mootIfRounds } from "@/lib/bracket/if-game";

const BRACKET_SIDE_LABEL = { winners: "Winners", losers: "Losers", final: "Final" };
function bracketRoundLabel(bracketSide, round) {
  return `${BRACKET_SIDE_LABEL[bracketSide] ?? bracketSide} R${round}`;
}

// Every scheduled game across the tournament, from BOTH pool play and the
// bracket engine, merged into one shape for the "by field" schedule list
// (dispatch-brief-11). Pool play and the bracket engine are read here
// exactly as elsewhere in this file — same public anon client, same
// division join — this just flattens both stages' games into one list
// instead of rendering them as two separate sections.
export async function getTournamentSchedule(slug) {
  const supabase = getPublicClient();
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id, divisions(id, name, display_name, brackets(id), pool_games(*), games(*))")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) return [];

  const rows = [];
  for (const division of tournament.divisions ?? []) {
    const divisionName = division.display_name ?? division.name;

    for (const g of division.pool_games ?? []) {
      rows.push({
        id: g.id,
        field: g.field,
        scheduledTime: g.scheduled_time,
        team1: g.team1_name,
        team2: g.team2_name,
        score1: g.team1_score,
        score2: g.team2_score,
        isFinal: g.status === "final",
        divisionName,
        label: `Pool ${g.pool}`,
      });
    }

    // Byes and cancelled "if necessary" deciders never occupied a real
    // field slot — same exclusion the bracket tree already applies
    // (lib/bracket/tree.js splitSides drops cancelled; is_bye games are
    // auto-resolved walkovers, not games anyone showed up to play).
    // Two kinds of bracket live in `games`, and they mean different things
    // by `round`. Engine-generated brackets (a `brackets` row exists) store a
    // real round number, so "Winners R2" reads correctly. Brackets TRANSCRIBED
    // from the league's own pre-drawn sheet have no `brackets` row and store
    // the league's printed GAME NUMBER there — labelling those "Winners R19"
    // is nonsense; they are "Game 19".
    const isEngineBracket = (division.brackets ?? []).length > 0;

    // An if-game the undefeated team made unnecessary belongs on the
    // bracket sheet, not on a schedule of games that will be played.
    const moot = mootIfRounds(division.games ?? []);

    for (const g of division.games ?? []) {
      if (g.is_bye || g.status === "cancelled" || moot.has(g.round)) continue;
      rows.push({
        id: g.id,
        field: g.field,
        scheduledTime: g.scheduled_time,
        team1: g.team1_name,
        team2: g.team2_name,
        score1: g.team1_score,
        score2: g.team2_score,
        isFinal: g.status === "final",
        divisionName,
        label: isEngineBracket
          ? bracketRoundLabel(g.bracket_side, g.round)
          : `Game ${g.round}`,
      });
    }
  }
  return rows;
}

// The five most recently finalized games anywhere in the league, from BOTH
// pool play and the bracket (dispatch: JD 2026-07-24). Replaces the home
// page's "check back after the next tournament" dead end — during a live
// tournament that sentence is exactly wrong, because scores are landing
// every hour. Ordered by scheduled_time desc, which is the order games
// actually finish; a game with no time sorts last.
export async function getRecentScores(limit = 5, divisionIds = null) {
  const supabase = getPublicClient();
  // Scoped to one tournament's divisions when asked. The league-wide form
  // is still what the schedule and any future digest would want; the
  // tournament page wants its own.
  const scope = (q) => (divisionIds?.length ? q.in("division_id", divisionIds) : q);
  const [pool, bracket] = await Promise.all([
    scope(
      supabase
        .from("pool_games")
        .select(
          "id, division_id, pool, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, divisions(name, display_name, tournaments(name, slug))"
        )
        .eq("status", "final")
        .order("scheduled_time", { ascending: false })
        .limit(limit)
    ),
    scope(
      supabase
        .from("games")
        .select(
          "id, division_id, round, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, divisions(name, display_name, tournaments(name, slug))"
        )
        .eq("status", "final")
        .order("scheduled_time", { ascending: false })
        .limit(limit)
    ),
  ]);
  if (pool.error) throw pool.error;
  if (bracket.error) throw bracket.error;

  const shape = (g, label) => ({
    id: g.id,
    // Enough to link INTO the game (JD, 2026-07-26: "people expect to be
    // able to click into them and see the game"). A result on the home
    // page is a dead end otherwise.
    divisionId: g.division_id ?? g.divisions?.id ?? null,
    pool: g.pool ?? null,
    round: g.round ?? null,
    tournamentName: g.divisions?.tournaments?.name ?? null,
    tournamentSlug: g.divisions?.tournaments?.slug ?? null,
    divisionName: g.divisions?.display_name ?? g.divisions?.name ?? null,
    label,
    field: g.field,
    scheduledTime: g.scheduled_time,
    team1: g.team1_name,
    team2: g.team2_name,
    score1: g.team1_score,
    score2: g.team2_score,
  });

  // Results must NEVER appear out of time order (JD, 2026-07-24) — newest
  // first, and the sort must be TOTAL: two games in the same time slot,
  // or one merged from pool and one from the bracket, would otherwise fall
  // back on array concat order and shuffle between renders. Ties break by
  // field number then id, so the same set always draws the same way.
  const fieldNum = (f) => {
    const m = String(f ?? "").match(/\d+/);
    return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
  };
  return [
    ...(pool.data ?? []).map((g) => shape(g, g.pool ? `Pool ${g.pool}` : null)),
    ...(bracket.data ?? []).map((g) => shape(g, g.round ? `Game ${g.round}` : null)),
  ]
    .sort(
      (a, b) =>
        String(b.scheduledTime ?? "").localeCompare(String(a.scheduledTime ?? "")) ||
        fieldNum(a.field) - fieldNum(b.field) ||
        String(a.id).localeCompare(String(b.id))
    )
    .slice(0, limit);
}

/**
 * What is coming up, for one tournament. The mirror of getRecentScores:
 * same shape, unplayed instead of played, soonest first.
 *
 * Byes, cancelled deciders and an if-game the undefeated team already made
 * unnecessary are all left out — none of them is a game anyone is going to
 * turn up for.
 */
export async function getUpcomingGames(limit = 8, divisionIds = null) {
  const supabase = getPublicClient();
  const scope = (q) => (divisionIds?.length ? q.in("division_id", divisionIds) : q);
  const [pool, bracket] = await Promise.all([
    scope(
      supabase
        .from("pool_games")
        .select(
          "id, division_id, pool, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, divisions(name, display_name, tournaments(name, slug))"
        )
        .neq("status", "final")
        .not("scheduled_time", "is", null)
        .order("scheduled_time", { ascending: true })
        .limit(limit)
    ),
    // EVERY bracket game for these divisions, not just the unplayed ones.
    // Whether an if-game is moot depends on the FINISHED game that feeds
    // it, so filtering to unplayed first hides the very row the test needs
    // — which is how the moot if-game turned up under "Next".
    scope(
      supabase
        .from("games")
        .select(
          "id, division_id, round, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, status, is_bye, team1_source_game_id, team1_source_result, team2_source_game_id, team2_source_result, divisions(name, display_name, tournaments(name, slug))"
        )
    ),
  ]);
  if (pool.error) throw pool.error;
  if (bracket.error) throw bracket.error;

  // The moot test needs a division's WHOLE game list, not just its
  // unplayed ones, so it is applied against everything we can see per
  // division and then used to filter.
  const byDivision = new Map();
  for (const g of bracket.data ?? []) {
    if (!byDivision.has(g.division_id)) byDivision.set(g.division_id, []);
    byDivision.get(g.division_id).push(g);
  }
  const mootByDivision = new Map();
  for (const [id, list] of byDivision) mootByDivision.set(id, mootIfRounds(list));

  const stillToPlay = (g) =>
    g.status !== "final" &&
    g.status !== "cancelled" &&
    !g.is_bye &&
    g.scheduled_time &&
    !mootByDivision.get(g.division_id)?.has(g.round);

  const shape = (g, label) => ({
    id: g.id,
    divisionId: g.division_id,
    pool: g.pool ?? null,
    round: g.round ?? null,
    tournamentName: g.divisions?.tournaments?.name ?? null,
    tournamentSlug: g.divisions?.tournaments?.slug ?? null,
    divisionName: g.divisions?.display_name ?? g.divisions?.name ?? null,
    label,
    field: g.field,
    scheduledTime: g.scheduled_time,
    team1: g.team1_name,
    team2: g.team2_name,
    score1: null,
    score2: null,
  });

  return [
    ...(pool.data ?? []).map((g) => shape(g, g.pool ? `Pool ${g.pool}` : null)),
    ...(bracket.data ?? [])
      .filter(stillToPlay)
      .map((g) => shape(g, g.round ? `Game ${g.round}` : null)),
  ]
    .sort((a, b) => String(a.scheduledTime ?? "").localeCompare(String(b.scheduledTime ?? "")))
    .slice(0, limit);
}

/**
 * One line per team: where they are, and the one thing they want to know.
 *
 * Feeds the "My Team" card (JD, 2026-07-26: "Team Name, Pool or Bracket
 * depending on stage, Next Game or Final Result"). A team is in exactly
 * one of two states — still playing, in which case the answer is their
 * next game; or finished, in which case it is where they came.
 *
 * Computed across the WHOLE tournament, pool play and brackets together,
 * because a team does not think of those as separate things.
 */
export async function getTeamSummaries(tournament) {
  const divisions = tournament?.divisions ?? [];
  const divisionIds = divisions.map((d) => d.id);
  if (divisionIds.length === 0) return {};
  const supabase = getPublicClient();

  const [pool, bracket, status] = await Promise.all([
    supabase
      .from("pool_games")
      .select("id, division_id, pool, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, status")
      .in("division_id", divisionIds),
    supabase
      .from("games")
      .select("id, division_id, round, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, status, is_bye, team1_source_game_id, team1_source_result, team2_source_game_id, team2_source_result")
      .in("division_id", divisionIds),
    getTeamStatus(tournament.id),
  ]);
  if (pool.error) throw pool.error;
  if (bracket.error) throw bracket.error;

  const nameOf = (id) => {
    const d = divisions.find((x) => x.id === id);
    return d ? (d.display_name ?? d.name) : null;
  };

  // A game the undefeated team already made unnecessary is not a next game.
  const mootByDivision = new Map();
  for (const id of divisionIds) {
    mootByDivision.set(id, mootIfRounds((bracket.data ?? []).filter((g) => g.division_id === id)));
  }

  const real = (n) => !!n && !/^(Winner|Loser) of Game \d+$/.test(n) && !/^\[?[A-Z] ?#\d+\]?$/.test(n);
  const out = {};
  const touch = (team) =>
    (out[team] ??= { team, stage: null, divisionId: null, next: null, played: 0 });

  const consider = (team, opponent, g, stageLabel, divisionId, isBracket) => {
    if (!real(team)) return;
    const t = touch(team);
    // The stage a team is IN is the latest one they have appeared in — a
    // bracket beats the pool that sent them there.
    if (isBracket || !t.stage) {
      t.stage = stageLabel;
      t.divisionId = divisionId;
    }
    if (g.status === "final") {
      t.played += 1;
      return;
    }
    const when = g.scheduled_time ? new Date(g.scheduled_time).getTime() : Infinity;
    if (!t.next || when < t.next.when) {
      t.next = {
        when,
        scheduledTime: g.scheduled_time,
        field: g.field,
        opponent: real(opponent) ? opponent : null,
        label: isBracket ? `Game ${g.round}` : `Pool ${g.pool}`,
        divisionId,
        pool: isBracket ? null : g.pool,
        round: isBracket ? g.round : null,
        id: g.id,
      };
    }
  };

  for (const g of pool.data ?? []) {
    consider(g.team1_name, g.team2_name, g, `Pool ${g.pool}`, g.division_id, false);
    consider(g.team2_name, g.team1_name, g, `Pool ${g.pool}`, g.division_id, false);
  }
  for (const g of bracket.data ?? []) {
    if (g.is_bye || g.status === "cancelled") continue;
    if (mootByDivision.get(g.division_id)?.has(g.round)) continue;
    const label = nameOf(g.division_id);
    consider(g.team1_name, g.team2_name, g, label, g.division_id, true);
    consider(g.team2_name, g.team1_name, g, label, g.division_id, true);
  }

  for (const [team, st] of Object.entries(status)) {
    if (!out[team]) continue;
    out[team].result = { state: st.state, placement: st.placement, bracket: st.bracket_name };
  }
  return out;
}

// Hero fallback — the poster is the homepage even when there's no confirmed
// upcoming date yet (Lacy, 2026-07-21). If nothing is marked "upcoming",
// show the most recent tournament on file as the reference poster, with a
// small "coming soon" note above it instead of the full hero treatment.
export async function getHeroTournament() {
  const upcoming = await getUpcomingTournament();
  if (upcoming) return { tournament: upcoming, confirmed: true };
  const season = await getSeasonList();
  return { tournament: season[0] ?? null, confirmed: false };
}

export async function getLastCompletedTournamentResults() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*, placements(*))")
    .eq("status", "complete")
    .eq("region", "southern_utah")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function formatDateRange(startDate, endDate) {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const opts = { month: "long", day: "numeric" };
  if (startDate === endDate) {
    return start.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  }
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = sameMonth
    ? end.getDate().toString()
    : end.toLocaleDateString("en-US", opts);
  return `${startStr}–${endStr}, ${end.getFullYear()}`;
}

export function formatFee(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(0)}`;
}
