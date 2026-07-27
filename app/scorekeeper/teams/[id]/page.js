import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getTeam, listTeams, scopeLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import MergeControl from "@/components/scorekeeper/MergeControl";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const team = await getTeam(id);
  return { title: team ? `${team.name} — Control Center` : "Team" };
}

export default async function TeamPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Team</h1>
        <PinPad />
      </div>
    );
  }

  const team = await getTeam(id);
  if (!team) notFound();
  const all = await listTeams();
  const others = all.filter((t) => t.id !== team.id).map((t) => ({
    id: t.id,
    label: `${t.name}${scopeLabel(t.gender, t.className) ? ` (${scopeLabel(t.gender, t.className)})` : ""}`,
  }));

  return (
    <DirectorShell
      title={team.name}
      count={scopeLabel(team.gender, team.className) || "No division scope"}
      back="/scorekeeper/teams"
    >
      <div className="space-y-2">
        <p className="t-label">Tournaments entered</p>
        {team.registrations.length === 0 ? (
          <div className="card p-6 text-center"><p className="t-meta">No registrations yet.</p></div>
        ) : (
          <ul className="card divide-y divide-black/5">
            {team.registrations.map((r) => (
              <li key={r.registrationId} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="t-body block truncate">{r.tournamentName}</span>
                    <span className="t-meta block truncate">{r.managerName}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="t-label block">{r.status}</span>
                    <span className="t-meta block">{r.paid ? "Paid" : "Unpaid"}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.managerPhone && (
                    <>
                      <a className="btn-quiet" href={`sms:${r.managerPhone.replace(/\D/g, "")}`}>Text</a>
                      <a className="btn-quiet" href={`tel:${r.managerPhone.replace(/\D/g, "")}`}>Call</a>
                    </>
                  )}
                  {r.managerEmail && (
                    <a className="btn-quiet" href={`mailto:${r.managerEmail}`}>Email</a>
                  )}
                  <Link className="btn-quiet" href="/scorekeeper/registrations">Roster</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MergeControl
        kind="teams"
        keepId={team.id}
        keepLabel={team.name}
        options={others}
        heading="Same team, listed twice?"
        note="Pick the other record. Every registration on it moves here, and it stops showing up in lists. Nothing is deleted."
      />

      <p className="t-meta">
        <Link href="/scorekeeper/teams" className="underline">All teams</Link>
      </p>
    </DirectorShell>
  );
}
