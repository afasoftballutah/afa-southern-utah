import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import { directorPersonLabel } from "@/lib/person-name";
import RegisterBack from "@/components/RegisterBack";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import { seatFromDivision } from "@/lib/division-layout";

export const metadata = { title: "Sign Your Waiver — AFA Southern Utah" };

// Never cached. This page is gated only by knowledge of the token in the URL,
// so it must be rendered per request and never served to anyone who was not
// handed this exact link. Same rule as the personal signing page.
export const dynamic = "force-dynamic";

// WHAT THIS PAGE MAY SHOW: names and signed state. Nothing else.
//
// The manager pastes this link into a team group chat, so everyone on the
// team can open it. A player's birth date, address, email and phone stay on
// their OWN signing page, behind their OWN token. Nobody should learn a
// teammate's address from a link in a group chat. The select below is
// deliberately narrow — widening it is a privacy change, not a tweak.
async function getRoster(token) {
  const supabase = getServiceClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, manager_member_id, tournaments(name, slug), divisions(name, display_name, gender)"
    )
    .eq("roster_token", token)
    .maybeSingle();

  if (!registration) return null;

  const { data: members } = await supabase
    .from("roster_members")
    .select(
      "id, name, role, signing_token, signed_at, legal_first_name, legal_last_name, preferred_name"
    )
    .eq("registration_id", registration.id)
    .is("removed_at", null)
    .order("legal_last_name", { ascending: true, nullsFirst: false })
    .order("legal_first_name", { ascending: true, nullsFirst: false });

  // One row per person. The manager is on the roster and signs once, so she
  // is a LABEL on an existing row, not an extra entry.
  // Show full legal name so teammates can find themselves; preferred only
  // as a nickname parenthetical when it differs.
  const signers = (members ?? []).map((m) => ({
    name: directorPersonLabel({
      legalFirstName: m.legal_first_name,
      legalLastName: m.legal_last_name,
      preferredName: m.preferred_name,
      name: m.name,
    }),
    role: m.id === registration.manager_member_id ? "manager" : m.role,
    token: m.signing_token,
    signed: Boolean(m.signed_at),
  }));

  return {
    teamName: registration.team_name,
    tournamentName: registration.tournaments?.name,
    tournamentSlug: registration.tournaments?.slug,
    divisionName: registration.divisions?.display_name ?? registration.divisions?.name,
    divisionGender: registration.divisions?.gender ?? null,
    className: registration.class,
    signers,
  };
}

export default async function RosterSigningPage({ params }) {
  const { token } = await params;
  const roster = await getRoster(token);
  if (!roster) notFound();

  const needsRole = (s) => s.role !== "player";

  const signed = roster.signers.filter((s) => s.signed).length;
  const total = roster.signers.length;
  const official = signed === total;
  const seat = seatFromDivision({
    gender: roster.divisionGender,
    display_name: roster.divisionName,
    name: roster.divisionName,
  });
  const backHref = roster.tournamentSlug
    ? `/tournaments/${roster.tournamentSlug}`
    : "/tournaments";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RegisterBack href={backHref} label={roster.tournamentName || "Tournament"} />
      <div>
        <h1 className="team-name text-2xl">{roster.teamName}</h1>
        <p className="t-meta flex flex-wrap items-center gap-1.5 mt-0.5">
          <DivisionSeatMark
            genderKey={seat?.genderKey}
            seatLabel={seat?.seatLabel}
            genderLabel={seat?.genderLabel}
            levelLabel={seat?.levelLabel}
          />
          {roster.tournamentName ? <span>{roster.tournamentName}</span> : null}
        </p>
      </div>

      <div className="card p-4 space-y-1">
        <p className="t-strong">
          {official ? "Everyone has signed." : `${signed} of ${total} signed`}
        </p>
        {official ? (
          <p className="t-meta">This registration is official. Nothing else is needed.</p>
        ) : null}
      </div>

      <ul className="card roster-sign-list divide-y divide-black/5">
        {roster.signers.map((s) => (
          <li key={s.token}>
            {s.signed ? (
              <div className="roster-sign-row roster-sign-row--done flex items-center justify-between gap-2 px-3 py-2">
                <span className="t-body truncate min-w-0">
                  {s.name}
                  {needsRole(s) && <span className="t-meta"> &middot; {s.role}</span>}
                </span>
                <span className="t-label shrink-0">
                  <span className="tick" aria-hidden>
                    ☑
                  </span>{" "}
                  Signed
                </span>
              </div>
            ) : (
              <Link
                href={`/register/sign/${s.token}`}
                className="roster-sign-row flex items-center justify-between gap-2 px-3 py-2 min-h-[44px]"
              >
                <span className="t-body truncate min-w-0">
                  {s.name}
                  {needsRole(s) && <span className="t-meta"> &middot; {s.role}</span>}
                </span>
                <span className="t-label shrink-0">Sign &rsaquo;</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {roster.tournamentSlug && (
        <p className="t-meta">
          <Link href={`/tournaments/${roster.tournamentSlug}`} className="underline">
            Tournament details
          </Link>
        </p>
      )}
    </div>
  );
}
