import { getPublicClient } from "./supabase";

// All reads here use the anon key (RLS-gated, public-read-only tables).
// Pages that call these should set `export const revalidate = 30` so
// Next.js serves them off the Vercel CDN and revalidates in the
// background — readers never hit Supabase directly on tournament day.

export async function getUpcomingTournament() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*)")
    .eq("status", "upcoming")
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
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTournamentBySlug(slug) {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, divisions(*, placements(*))")
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
