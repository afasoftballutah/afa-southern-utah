import PersonActions from "./PersonActions";

// The part of a player's detail that is NOT a row: how to reach them, and
// the two rare jobs. Their history opens as real rows in the table's own
// columns — see detailRows in the Players list.
export default function PlayerDetail({ person, appearances, registrations, otherPeople }) {
  const contact = appearances.find((a) => a.email || a.phone);
  const digits = (v) => String(v ?? "").replace(/\D/g, "");

  return (
    <div className="space-y-2">
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
