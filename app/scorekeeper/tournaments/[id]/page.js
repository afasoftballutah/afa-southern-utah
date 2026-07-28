import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen, stillToPlayIn } from "@/lib/tournament-state";
import { genderLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import TournamentEditor from "@/components/scorekeeper/TournamentEditor";
import DivisionWorkbench from "@/components/scorekeeper/DivisionWorkbench";
import TournamentSetup from "@/components/scorekeeper/TournamentSetup";
import { suggestClass, checkEligibility, checkRoster } from "@/lib/class";

export const dynamic = "force-dynamic";

// A tournament is where the work happens, so everything about one is here:
// the divisions you score, the teams that signed up, and the terms. JD,
// 2026-07-27: "the scores should be a subset of tournaments."
async function load(id) {
  const supabase = getServiceClient();
  const [{ data: tournament }, { data: classes }] = await Promise.all([
    supabase
      .from("tournaments")
      .select(
        "*, divisions(id, name, display_name, sort_order, parent_division_id, gender, class_id, min_men, min_women, min_teams, max_teams, games(id, status, is_bye, round), pool_games(id, status))"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("classes").select("id, name").order("sort_order"),
  ]);
  if (!tournament) return { tournament: null, classes: [] };

  const { data: venueRows } = await supabase
    .from("tournaments")
    .select("venue_name")
    .not("venue_name", "is", null);

  const [{ data: registrations }, { data: progress }, { data: members }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, team_name, class, class_id, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, manager_name, manager_email, manager_phone, division_id, divisions(name, display_name)"
      )
      .eq("tournament_id", id),
    supabase.from("registration_signing_progress").select("*"),
    supabase.from("roster_members").select("id, registration_id, name, role, signed_at, removed_at, player_id"),
  ]);

  // Class is a property of a PERSON, so a team's class is worked out from who
  // is on it. JD, 2026-07-27: "The team registers for the tournament with the
  // players and then gets put into a suggested class based on the tournament."
  const { data: allPlayers } = await supabase.from("players").select("id, rating, gender");
  const { data: allClasses } = await supabase.from("classes").select("id, name, sort_order").order("sort_order");
  const playerBy = new Map((allPlayers ?? []).map((p) => [p.id, p]));
  const divisionBy = new Map((tournament.divisions ?? []).map((d) => [d.id, d]));

  // What this tournament actually runs — a D team at a Rec/E event plays E.
  const offeredClassIds = [
    ...new Set((tournament.divisions ?? []).map((d) => d.class_id).filter(Boolean)),
  ];

  const progressBy = new Map((progress ?? []).map((p) => [p.registration_id, p]));
  const membersBy = new Map();
  for (const m of members ?? []) {
    if (m.removed_at) continue;
    if (!membersBy.has(m.registration_id)) membersBy.set(m.registration_id, []);
    membersBy.get(m.registration_id).push(m);
  }

  return {
    tournament,
    classes: classes ?? [],
    classes: allClasses ?? [],
    venues: [...new Set((venueRows ?? []).map((v) => v.venue_name))].sort(),
    registrations: (registrations ?? []).map((r) => {
      const roster = (membersBy.get(r.id) ?? []).map((m) => {
        const person = m.player_id ? playerBy.get(m.player_id) : null;
        return { id: m.id, name: m.name, rating: person?.rating ?? null, gender: person?.gender ?? null };
      });
      const div = divisionBy.get(r.division_id);
      const enteredClass = (allClasses ?? []).find((c) => c.id === r.class_id)?.name ?? null;
      return {
        ...r,
        progress: progressBy.get(r.id) ?? { active_members: 0, signed_members: 0, is_official: false },
        members: membersBy.get(r.id) ?? [],
        suggestion: suggestClass(roster, allClasses ?? [], offeredClassIds),
        roster,
        // Checked against what they were ACTUALLY entered as, not against the
        // suggestion — a director who overrode it still needs to see the cost.
        // With no class entered yet, check the suggestion instead.
        check: checkEligibility(
          roster,
          enteredClass ?? suggestClass(roster, allClasses ?? [], offeredClassIds).className
        ),
        // The other half of "can this team compete": enough men and women for
        // the division they are in. JD, 2026-07-27.
        composition: checkRoster(roster, { minMen: div?.min_men, minWomen: div?.min_women }),
      };
    }),
  };
}

// Titles are PUBLIC. Next runs generateMetadata for anyone who requests the
// URL, session or not, so naming the record here would put a real person's or
// team's name in the <title> of a page they are not allowed to open — and in
// any link preview of it. Gate it like the page body.
/**
 * One row per bracket a director actually runs.
 *
 * JD, 2026-07-27: "all the classes for that tournaments need to show as a
 * row." A tournament that offers Rec, E, D and Open runs FOUR Coed brackets,
 * not one Coed division — so a single row per division hid three of them.
 *
 * The classes come from the division's own class_id when it has one, and
 * otherwise from what the tournament says it offers. A tournament that names
 * no classes gets one row per division, which is what it is.
 */
function buildDivisionRows(divisions, registrations, classes, tournament) {
  // "Rec, E, D, Open*" — the league writes it with stars and spaces.
  const offeredNames = String(tournament.divisions_offered ?? "")
    .split(",")
    .map((x) => x.replace(/\*/g, "").trim().toLowerCase())
    .filter(Boolean);
  const offered = classes.filter((c) => offeredNames.includes(c.name.toLowerCase()));

  const rows = [];
  for (const d of divisions) {
    const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
    const live = registrations.filter(
      (r) => r.division_id === d.id && r.status !== "withdrawn"
    );
    const divisionName = d.display_name ?? d.name;

    // A division with its own class is already one bracket.
    const forThis = d.class_id
      ? [classes.find((c) => c.id === d.class_id)].filter(Boolean)
      : offered;
    const buckets = forThis.length > 0 ? forThis : [null];

    for (const cls of buckets) {
      const teams = cls
        ? live.filter((r) => r.class_id === cls.id).length
        : live.length;
      rows.push({
        key: `${d.id}:${cls?.id ?? "all"}`,
        id: d.id,
        classId: cls?.id ?? null,
        label: cls ? `${divisionName} ${cls.name}` : divisionName,
        sortKey: `${String(d.sort_order).padStart(4, "0")}-${String(cls?.sort_order ?? 0).padStart(4, "0")}`,
        genderLabel: genderLabel(d.gender),
        className: cls?.name ?? null,
        teams,
        teamsMax: d.max_teams ?? Math.max(d.min_teams ?? 6, teams),
        minTeams: d.min_teams ?? 6,
        minMen: d.min_men,
        minWomen: d.min_women,
        // Games belong to the division, not yet to a class bracket, so a
        // split division shows them once — on its first row — rather than
        // repeating the same count down the column as if each bracket had
        // played them.
        gamesTotal: buckets[0] === cls ? games.length : 0,
        unplayed: buckets[0] === cls && games.length ? stillToPlayIn(games).length : 0,
      });
    }
  }
  return rows;
}

/**
 * The setup bar's starting state, read back out of the divisions that exist.
 *
 * A director opening a tournament they set up last week should see their own
 * choices, not an empty form.
 */
function planFrom(divisions, classes) {
  const CLASS_NAMES = new Set((classes ?? []).map((c) => c.name));
  const BRACKETS = new Set(["Gold", "Silver", "Bronze"]);
  const LEVELS = new Set(["Upper", "Lower"]);

  return ["mens", "womens", "coed"].map((gender) => {
    const mine = divisions.filter((d) => d.gender === gender);
    const picks = new Set();
    let mode = "divisions";

    for (const d of mine) {
      const name = d.display_name ?? d.name;
      const tail = name.split(" ").pop();
      if (BRACKETS.has(tail)) {
        mode = "brackets";
        picks.add(tail);
      } else if (LEVELS.has(tail)) {
        mode = "levels";
        picks.add(tail);
      } else if (CLASS_NAMES.has(tail)) {
        picks.add(tail);
      }
    }

    return {
      gender,
      on: mine.length > 0,
      // Pool play is where a bracket tournament starts, so a parent division
      // with children implies it.
      poolPlay: mine.some((d) => mine.some((c) => c.parent_division_id === d.id)),
      poolPlayDone: false,
      mode,
      picks: [...picks],
    };
  });
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { title: "Tournament" };
  const { tournament } = await load(id);
  return { title: tournament ? `${tournament.name} — Control Center` : "Tournament" };
}

export default async function TournamentPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Tournament</h1>
        <PinPad />
      </div>
    );
  }

  const { tournament, classes, registrations, venues } = await load(id);
  if (!tournament) notFound();

  const open = isRegistrationOpen(tournament);
  const divisions = (tournament.divisions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <DirectorShell
      title={tournament.name}
      count={`${tournament.start_date} · ${open ? "taking teams" : "registration closed"}`}
      back="/scorekeeper/tournaments"
    >
      <TournamentEditor
        tournament={JSON.parse(JSON.stringify(tournament))}
        venues={venues}
      />

      <TournamentSetup tournamentId={tournament.id} initial={planFrom(divisions, classes)} />

      <h2 className="t-heading">Divisions</h2>
      <DivisionWorkbench
        divisions={buildDivisionRows(divisions, registrations, classes, tournament)}
        registrations={JSON.parse(JSON.stringify(registrations))}
        classes={classes}
      />

      <p className="t-meta">
        <Link href={`/tournaments/${tournament.slug}`} className="underline">
          See the public page
        </Link>
      </p>
    </DirectorShell>
  );
}
