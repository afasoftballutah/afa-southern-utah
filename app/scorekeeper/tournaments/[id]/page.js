import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen, stillToPlayIn } from "@/lib/tournament-state";
import { genderLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorCard, { CardGrid } from "@/components/scorekeeper/DirectorCard";
import TournamentEditor from "@/components/scorekeeper/TournamentEditor";
import RegistrationCard from "@/components/scorekeeper/RegistrationCard";

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
        "*, divisions(id, name, display_name, sort_order, parent_division_id, gender, class_id, games(id, status, is_bye, round), pool_games(id, status))"
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
        "id, team_name, class, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, manager_name, manager_email, manager_phone, division_id, divisions(name, display_name)"
      )
      .eq("tournament_id", id),
    supabase.from("registration_signing_progress").select("*"),
    supabase.from("roster_members").select("registration_id, name, role, signed_at, removed_at, player_id"),
  ]);

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
    registrations: (registrations ?? []).map((r) => ({
      ...r,
      progress: progressBy.get(r.id) ?? { active_members: 0, signed_members: 0, is_official: false },
      members: membersBy.get(r.id) ?? [],
    })),
  };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
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
      <h2 className="t-heading">Score a division</h2>
      {divisions.length === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="t-strong">No divisions yet.</p>
          <p className="t-meta">Add one below and teams can be put in it.</p>
        </div>
      ) : (
        <CardGrid>
          {divisions.map((d) => {
            const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
            const left = games.length ? stillToPlayIn(games).length : 0;
            const teams = registrations.filter(
              (r) => r.division_id === d.id && r.status !== "withdrawn"
            ).length;
            const pool = (d.pool_games ?? []).length > 0;
            return (
              <DirectorCard
                key={d.id}
                href={`/scorekeeper/division/${d.id}`}
                title={pool ? "Pool Play" : (d.display_name ?? d.name)}
                subtitle={genderLabel(d.gender) ?? "No gender set"}
                stats={[
                  { label: "games", value: String(games.length) },
                  { label: "to score", value: String(left), alert: left > 0 },
                  { label: "teams", value: String(teams) },
                ]}
                footer={games.length === 0 ? "No schedule yet" : null}
              />
            );
          })}
        </CardGrid>
      )}

      <h2 className="t-heading">Teams signed up</h2>
      <Link href="/scorekeeper/registrations/new" className="btn-quiet w-full block text-center">
        Add a team yourself
      </Link>
      {registrations.length === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="t-strong">Nobody has registered yet.</p>
          <p className="t-meta">They land here the moment someone submits the form.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => (
            <RegistrationCard key={r.id} registration={r} />
          ))}
        </div>
      )}

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
