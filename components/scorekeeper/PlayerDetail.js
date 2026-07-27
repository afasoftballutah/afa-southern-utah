import Link from "next/link";
import PersonActions from "./PersonActions";

// What opens under a player's row. The same three things the separate page
// held — history, move, merge — with no second layout to maintain.
//
// JD, 2026-07-27: "just have an accordion dropdown on the player list, thats
// easier. no idea what role is." Role is gone; it said "player" for almost
// everyone and "manager" for one, which is already on the team's own page.
export default function PlayerDetail({ person, appearances, registrations, otherPeople }) {
  const contact = appearances.find((a) => a.email || a.phone);
  const digits = (v) => String(v ?? "").replace(/\D/g, "");

  return (
    <div className="space-y-3">
      {contact && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {contact.phone && (
            <>
              <a className="t-label text-afa-navy underline" href={`sms:${digits(contact.phone)}`}>Text</a>
              <a className="t-label text-afa-navy underline" href={`tel:${digits(contact.phone)}`}>Call</a>
              <span className="t-meta">{contact.phone}</span>
            </>
          )}
          {contact.email && (
            <a className="t-label text-afa-navy underline" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          )}
        </p>
      )}

      {appearances.length === 0 ? (
        <p className="t-meta">Not on any roster.</p>
      ) : (
        <table className="text-[15px] leading-snug">
          <thead>
            <tr>
              {["Tournament", "Team", "Class", "Waiver"].map((h, i) => (
                <th key={h} className={"pr-6 py-1 t-label font-normal " + (i === 3 ? "text-center" : "text-left")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appearances.map((a) => (
              <tr key={a.memberId}>
                <td className="pr-6 py-1 whitespace-nowrap">{a.tournamentName}</td>
                <td className="pr-6 py-1 whitespace-nowrap font-semibold text-afa-navy">
                  <Link href={`/scorekeeper/registrations/${a.registrationId}`} className="hover:underline">
                    {a.teamName}
                  </Link>
                </td>
                <td className="pr-6 py-1 whitespace-nowrap">{a.className ?? "—"}</td>
                <td className="pr-6 py-1 text-center">
                  <span className={"tick " + (a.signed ? "text-afa-go" : "text-afa-muted/50")}>
                    {a.signed ? "☑" : "☐"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <PersonActions
        person={person}
        appearances={appearances.map((a) => ({
          memberId: a.memberId,
          teamName: a.teamName,
          tournamentName: a.tournamentName,
          registrationId: a.registrationId,
        }))}
        registrations={registrations}
        otherPeople={otherPeople}
      />
    </div>
  );
}
