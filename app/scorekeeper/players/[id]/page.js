import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPerson, listPeople, listTeams } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import PersonActions from "@/components/scorekeeper/PersonActions";
import ClassPicker from "@/components/scorekeeper/ClassPicker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const person = await getPerson(id);
  return { title: person ? `${person.full_name} — Control Center` : "Person" };
}

export default async function PersonPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Person</h1>
        <PinPad />
      </div>
    );
  }

  const person = await getPerson(id);
  if (!person) notFound();

  const [{ players, classes }, teams] = await Promise.all([listPeople(), listTeams()]);
  const openRegistrations = teams.flatMap((t) =>
    t.registrations
      .filter((r) => r.status !== "withdrawn")
      .map((r) => ({ id: r.registrationId, label: `${t.name} — ${r.tournamentName}` }))
  );
  const others = players
    .filter((p) => p.id !== person.id)
    .map((p) => ({ id: p.id, label: `${p.full_name}${p.birth_date ? ` (${p.birth_date})` : ""}` }));

  const active = person.appearances.filter((a) => !a.removed);
  const contact = active.find((a) => a.email || a.phone);

  return (
    <DirectorShell
      title={person.full_name}
      count={[
        person.birth_date ? `Born ${person.birth_date}` : "No birth date on file",
        person.className ? `Class ${person.className}` : "Not rated",
      ].join(" · ")}
      back="/scorekeeper/players"
    >
      <ClassPicker
        label="Class"
        classes={classes}
        value={person.class_id ?? ""}
        action="setPlayerClass"
        payload={{ playerId: person.id }}
        hint="What this person is rated. A team's class is worked out from the players on it, so this is where it starts."
      />

      {contact && (
        <div className="card p-4 space-y-2">
          <p className="t-label">Contact</p>
          <div className="flex flex-wrap gap-2">
            {contact.phone && (
              <>
                <a className="btn-quiet" href={`sms:${contact.phone.replace(/\D/g, "")}`}>Text</a>
                <a className="btn-quiet" href={`tel:${contact.phone.replace(/\D/g, "")}`}>Call</a>
              </>
            )}
            {contact.email && (
              <a className="btn-quiet" href={`mailto:${contact.email}`}>Email</a>
            )}
          </div>
          <p className="t-meta">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="t-label">Teams played for</p>
        {active.length === 0 ? (
          <div className="card p-6 text-center"><p className="t-meta">Not on any roster.</p></div>
        ) : (
          <ul className="card divide-y divide-black/5">
            {active.map((a) => (
              <li key={a.memberId} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="t-body block truncate">{a.teamName}</span>
                  <span className="t-meta block truncate">
                    {a.tournamentName}
                    {a.role !== "player" && ` · ${a.role}`}
                  </span>
                </span>
                <span className="t-label shrink-0">{a.signed ? "Signed" : "Waiting"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PersonActions
        person={{ id: person.id, name: person.full_name }}
        appearances={active.map((a) => ({
          memberId: a.memberId,
          teamName: a.teamName,
          tournamentName: a.tournamentName,
          registrationId: a.registrationId,
        }))}
        registrations={openRegistrations}
        otherPeople={others}
      />

      <p className="t-meta">
        <Link href="/scorekeeper/players" className="underline">All people</Link>
      </p>
    </DirectorShell>
  );
}
