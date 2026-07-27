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

  const { tournament, classes, registrations } = await load(id);
  if (!tournament) notFound();

  const open = isRegistrationOpen(tournament);
  const divisions = (tournament.divisions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <DirectorShell
      title={tournament.name}
      count={`${tournament.start_date} · ${open ? "taking teams" : "registration closed"}`}
      back="/scorekeeper/tournaments"
    >
      <h2 className="t-heading">Divisions</h2>
      <DivisionWorkbench
        divisions={divisions.map((d) => {
          const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
          const teams = registrations.filter(
            (r) => r.division_id === d.id && r.status !== "withdrawn"
          ).length;
          return {
            id: d.id,
            name: d.display_name ?? d.name,
            sortOrder: d.sort_order,
            genderLabel: genderLabel(d.gender),
            className: (classes ?? []).find((c) => c.id === d.class_id)?.name ?? null,
            teams,
            // Uncapped divisions borrow the larger of "enough to run" and
            // "already in", so the denominator is never below the numerator.
            teamsMax: d.max_teams ?? Math.max(d.min_teams ?? 6, teams),
            minTeams: d.min_teams ?? 6,
            minMen: d.min_men,
            minWomen: d.min_women,
            gamesTotal: games.length,
            unplayed: games.length ? stillToPlayIn(games).length : 0,
          };
        })}
        registrations={JSON.parse(JSON.stringify(registrations))}
        classes={classes}
      />

      <h2 className="t-heading">Terms and divisions</h2>
      <TournamentEditor tournament={JSON.parse(JSON.stringify(tournament))} classes={classes} />

      <p className="t-meta">
        <Link href={`/tournaments/${tournament.slug}`} className="underline">
          See the public page
        </Link>
      </p>
    </DirectorShell>
  );
}
