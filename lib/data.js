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

// Short bracket-round descriptor (dispatch-brief-11), e.g. "Winners R2" —
// derived straight off bracket_side + round the games row already carries.
// Deliberately not the paper-convention game numbering (assignGameNumbers
// in lib/bracket/tree.js): that needs the full division's game set to
// compute, and this label is meant to be short, not authoritative.
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

    for (const g of division.games ?? []) {
      if (g.is_bye || g.status === "cancelled") continue;
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
