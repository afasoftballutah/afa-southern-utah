import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen } from "@/lib/tournament-state";
import { genderLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import TournamentEditor from "@/components/scorekeeper/TournamentEditor";

export const dynamic = "force-dynamic";

async function load(id) {
  const supabase = getServiceClient();
  const [{ data: tournament }, { data: classes }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("*, divisions(id, name, display_name, sort_order, parent_division_id, gender, class_id), registrations(id, team_name, division_id, status)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("classes").select("id, name").order("sort_order"),
  ]);
  return { tournament, classes: classes ?? [] };
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

  const { tournament, classes } = await load(id);
  if (!tournament) notFound();

  const open = isRegistrationOpen(tournament);
  const divisions = (tournament.divisions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const regs = tournament.registrations ?? [];

  return (
    <DirectorShell
      title={tournament.name}
      count={`${tournament.start_date} · ${open ? "open for registration" : "registration closed"}`}
      back="/scorekeeper/tournaments"
    >
      <div className="space-y-2">
        <p className="t-label">Divisions</p>
        {divisions.length === 0 ? (
          <div className="card p-6 text-center"><p className="t-meta">No divisions yet. Add one below.</p></div>
        ) : (
          <ul className="card divide-y divide-black/5">
            {divisions.map((d) => {
              const count = regs.filter((r) => r.division_id === d.id && r.status !== "withdrawn").length;
              return (
                <li key={d.id} className={"px-4 py-3 flex items-center justify-between gap-3 " + (d.parent_division_id ? "pl-8" : "")}>
                  <span className="min-w-0">
                    <span className="t-body block truncate">{d.display_name ?? d.name}</span>
                    <span className="t-meta block">{genderLabel(d.gender) ?? "No gender set"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="t-strong block">{count}</span>
                    <span className="t-meta block">{count === 1 ? "team" : "teams"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TournamentEditor tournament={JSON.parse(JSON.stringify(tournament))} classes={classes} />

      <p className="t-meta">
        <Link href={`/tournaments/${tournament.slug}`} className="underline">See the public page</Link>
        {" · "}
        <Link href="/scorekeeper/registrations" className="underline">Registrations</Link>
      </p>
    </DirectorShell>
  );
}
