import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPerson, listPeople, listTeams } from "@/lib/director";
import { RATINGS } from "@/lib/class";
import { bornWithAge } from "@/lib/names";
import { leagueToday } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import InlineSelect from "@/components/scorekeeper/InlineSelect";
import PersonActions from "@/components/scorekeeper/PersonActions";

export const dynamic = "force-dynamic"; // reads PII — never cached

// A person's record. Three things live here and nowhere else: their whole
// history across tournaments, moving them between teams, and merging a
// duplicate away. Rating and M/F are editable in the Players table too — they
// are here because you are already looking at the person.
//
// JD, 2026-07-27: "this is a super confusing page. and there is a lot of
// nonsense sentences." It was three panels of big buttons with a paragraph of
// explanation under each. The rules belong in the code, not on the screen of
// someone who already knows them.

// Titles are PUBLIC — Next runs this for anyone who requests the URL.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { title: "Player" };
  const person = await getPerson(id);
  return { title: person ? `${person.full_name} — Control Center` : "Player" };
}

export default async function PersonPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Player</h1>
        <PinPad />
      </div>
    );
  }

  const person = await getPerson(id);
  if (!person) notFound();

  const [{ players }, teams] = await Promise.all([listPeople(), listTeams()]);
  const today = leagueToday();
  const active = person.appearances.filter((a) => !a.removed);
  const contact = active.find((a) => a.email || a.phone);
  const digits = (v) => String(v ?? "").replace(/\D/g, "");

  const openRegistrations = teams.flatMap((t) =>
    t.registrations
      .filter((r) => r.status !== "withdrawn")
      .map((r) => ({ id: r.registrationId, label: `${t.name} — ${r.tournamentName}` }))
  );
  const others = players
    .filter((p) => p.id !== person.id)
    .map((p) => ({ id: p.id, label: `${p.full_name}${p.birth_date ? ` (${p.birth_date})` : ""}` }));

  return (
    <DirectorShell title={person.full_name} count={bornWithAge(person.birth_date, today)} back="/scorekeeper/players">
      {/* One row of facts, editable where they sit. */}
      <div className="card p-3 dense-controls flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="t-label">M/F</span>
          <span className="w-14">
            <InlineSelect
              label="M/F"
              action="setPlayerGender"
              valueKey="gender"
              payload={{ playerId: person.id }}
              value={person.gender ?? ""}
              options={["M", "F"]}
            />
          </span>
        </label>
        <label className="flex items-center gap-2">
          <span className="t-label">Rating</span>
          <span className="w-14">
            <InlineSelect
              label="Rating"
              action="setPlayerRating"
              valueKey="rating"
              payload={{ playerId: person.id }}
              value={person.rating ?? ""}
              options={RATINGS}
            />
          </span>
        </label>
        {contact?.phone && (
          <span className="flex items-center gap-2">
            <a className="t-label text-afa-navy underline" href={`sms:${digits(contact.phone)}`}>Text</a>
            <a className="t-label text-afa-navy underline" href={`tel:${digits(contact.phone)}`}>Call</a>
            <span className="t-meta">{contact.phone}</span>
          </span>
        )}
        {contact?.email && (
          <a className="t-label text-afa-navy underline" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        )}
      </div>

      <h2 className="t-heading">History</h2>
      {active.length === 0 ? (
        <div className="card p-4 text-center">
          <p className="t-meta">Not on any roster.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[15px] leading-snug">
            <thead>
              <tr className="border-b border-afa-navy/15">
                {["Tournament", "Team", "Class", "Role", "Waiver"].map((h, i) => (
                  <th
                    key={h}
                    className={"px-3 py-1.5 t-label font-normal " + (i > 2 ? "text-center" : "text-left")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.memberId} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap">{a.tournamentName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-semibold text-afa-navy">
                    <Link href={`/scorekeeper/registrations/${a.registrationId}`} className="hover:underline">
                      {a.teamName}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{a.className ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center">{a.role === "player" ? "—" : a.role}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={"tick " + (a.signed ? "text-afa-go" : "text-afa-muted/50")}>
                      {a.signed ? "☑" : "☐"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </DirectorShell>
  );
}
