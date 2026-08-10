/**
 * Throwaway DEMO tournament for local walkthroughs.
 * Hidden from public home (is_placeholder). Open scorekeeper links printed below.
 *
 *   node --env-file=.env.local --import ./test/register.mjs scripts/seed-demo-tournament.mjs
 *   node --env-file=.env.local --import ./test/register.mjs scripts/seed-demo-tournament.mjs --reset
 */
import { createClient } from "@supabase/supabase-js";
import { roundRobinPairs } from "../lib/bracket/seed.js";
import { generateBracket } from "../lib/bracket/generate.js";

const SLUG = "demo-safe-to-delete";
const ORIGIN = process.env.DEMO_ORIGIN || "http://127.0.0.1:3001";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const reset = process.argv.includes("--reset");

const POOL_TEAMS = ["Demo Alpha", "Demo Bravo", "Demo Charlie", "Demo Delta"];
// 7-team 3GG walkthrough (generate3GG)
const GGG_TEAMS = [
  "Demo Alpha",
  "Demo Bravo",
  "Demo Charlie",
  "Demo Delta",
  "Demo Echo",
  "Demo Foxtrot",
  "Demo Golf",
];

async function wipeIfExists() {
  const { data: t } = await sb.from("tournaments").select("id").eq("slug", SLUG).maybeSingle();
  if (!t) return;
  // cascade: divisions → games, pool_games, brackets; registrations need delete
  await sb.from("registrations").delete().eq("tournament_id", t.id);
  await sb.from("tournaments").delete().eq("id", t.id);
  console.log("Removed previous demo tournament.");
}

async function main() {
  if (reset) await wipeIfExists();

  const { data: existing } = await sb.from("tournaments").select("id, slug").eq("slug", SLUG).maybeSingle();
  if (existing && !reset) {
    console.log("Demo already exists. Re-run with --reset to rebuild.\n");
    await printLinks(existing.id);
    return;
  }
  if (existing && reset) await wipeIfExists();

  const { data: tournament, error: tErr } = await sb
    .from("tournaments")
    .insert({
      slug: SLUG,
      name: "DEMO — safe to delete",
      start_date: "2099-01-01",
      end_date: "2099-01-02",
      venue_name: "Demo Fields (not real)",
      region: "southern_utah",
      status: "upcoming",
      is_placeholder: true,
      game_guarantee: "3GG",
      notes: "Throwaway. Delete anytime. Not a real event.",
      contacts: [],
    })
    .select("id, slug")
    .single();
  if (tErr) throw new Error(tErr.message);

  const { data: divisions, error: dErr } = await sb
    .from("divisions")
    .insert([
      {
        tournament_id: tournament.id,
        name: "Pool path demo",
        display_name: "Pool path demo",
        gender: "coed",
        sort_order: 1,
        bracket_type: "double_elim",
      },
      {
        tournament_id: tournament.id,
        name: "3GG 7-team demo",
        display_name: "3GG 7-team demo",
        gender: "coed",
        sort_order: 2,
        bracket_type: "double_elim",
        seed_order: GGG_TEAMS,
      },
    ])
    .select("id, name, sort_order");
  if (dErr) throw new Error(dErr.message);

  const sorted = [...(divisions ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const poolDiv = sorted.find((d) => d.name.includes("Pool"));
  const gggDiv = sorted.find((d) => d.name.includes("3GG"));
  if (!poolDiv || !gggDiv) throw new Error("Divisions missing after insert");

  async function addTeams(divisionId, names) {
    const { data, error } = await sb
      .from("registrations")
      .insert(
        names.map((team_name) => ({
          tournament_id: tournament.id,
          division_id: divisionId,
          team_name,
          release_text_version: "waiver-2026-v1",
          director_notes: "demo",
        }))
      )
      .select("id, team_name");
    if (error) throw new Error(error.message);
    return data;
  }

  await addTeams(poolDiv.id, POOL_TEAMS);
  await addTeams(gggDiv.id, GGG_TEAMS);

  // Pool A round-robin for pool path (unscored — you finish them)
  const pairs = roundRobinPairs(POOL_TEAMS);
  const { error: poolErr } = await sb.from("pool_games").insert(
    pairs.map(([team1_name, team2_name], i) => ({
      division_id: poolDiv.id,
      pool: "A",
      team1_name,
      team2_name,
      field: `Field ${(i % 2) + 1}`,
      status: "scheduled",
    }))
  );
  if (poolErr) throw new Error(poolErr.message);

  // Pre-build 3GG so the drawing is ready
  const built = await generateBracket(gggDiv.id, "three_gg_hybrid", GGG_TEAMS);
  console.log(
    `\n✓ DEMO tournament created (hidden from public site). 3GG: ${built.matchCount} games, size ${built.bracketSize}.\n`
  );
  await printLinks(tournament.id);
}

async function printLinks(tournamentId) {
  const { data: divs } = await sb
    .from("divisions")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .order("sort_order");

  console.log("Scorekeeper PIN unlock, then open:\n");
  for (const d of divs ?? []) {
    console.log(`  ${d.name}`);
    console.log(`  ${ORIGIN}/director/division/${d.id}\n`);
  }
  console.log("How to walk through:\n");
  console.log("  Pool path:");
  console.log("    1. Open “Pool path demo”");
  console.log("    2. Score all 6 pool games final");
  console.log("    3. Generate from pool finish (DE or 3GG)");
  console.log("    4. Score bracket\n");
  console.log("  3GG 7-team:");
  console.log("    1. Open “3GG 7-team demo”");
  console.log("    2. Bracket is already generated (3GG) — score games");
  console.log("    3. Clear & generate if you change seeds\n");
  console.log("Reset / wipe:");
  console.log(
    "  node --env-file=.env.local --import ./test/register.mjs scripts/seed-demo-tournament.mjs --reset\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
