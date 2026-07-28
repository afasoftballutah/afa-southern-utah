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
 * One row per division. A division IS a bracket now.
 *
 * This used to fan a class-less division out into one row per class the
 * tournament offered, which was right when the only way to get class rows was
 * to invent them. The setup bar creates a real division per class, so the fan
 * out became double-counting: saving "Coed D" left the old class-less "Coed"
 * in place — it has a team in it, so it is not deletable — and that one
 * expanded into Coed Rec / Coed E / Coed D / Coed Open beside the real Coed D.
 * Six rows for two brackets.
 *
 * And the label appended the class to a name that already carried it, so a
 * division called "Men's D" printed as "Men's D D".
 */
function buildDivisionRows(divisions, registrations, classes, tournament) {
  return divisions.map((d) => {
    const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
    const teams = registrations.filter(
      (r) => r.division_id === d.id && r.status !== "withdrawn"
    ).length;
    const cls = classes.find((c) => c.id === d.class_id) ?? null;

    return {
      key: d.id,
      id: d.id,
      classId: d.class_id ?? null,
      label: d.display_name ?? d.name,
      sortKey: String(d.sort_order).padStart(4, "0"),
      genderLabel: genderLabel(d.gender),
      className: cls?.name ?? null,
      teams,
      teamsMax: d.max_teams ?? Math.max(d.min_teams ?? 6, teams),
      minTeams: d.min_teams ?? 6,
      minMen: d.min_men,
      minWomen: d.min_women,
      gamesTotal: games.length,
      unplayed: games.length ? stillToPlayIn(games).length : 0,
    };
  });
}

/**
 * The setup bar's starting state, read back out of the divisions that exist,
 * so a director opening last week's tournament sees their own choices.
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
      const tail = (d.display_name ?? d.name).split(" ").pop();
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
      // A parent division with children is what pool play looks like.
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

      <h2 className="t-heading">Divisions</h2>
      <DivisionWorkbench
        divisions={buildDivisionRows(divisions, registrations, classes, tournament)}
        registrations={JSON.parse(JSON.stringify(registrations))}
        classes={classes}
        setup={
          <TournamentSetup tournamentId={tournament.id} initial={planFrom(divisions, classes)} />
        }
      />

      <p className="t-meta">
        <Link href={`/tournaments/${tournament.slug}`} className="underline">
          See the public page
        </Link>
      </p>
    </DirectorShell>
  );
}
