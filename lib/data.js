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
const REGION_LABEL = {
  southern_utah: "Southern Utah",
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
