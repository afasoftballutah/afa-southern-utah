import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";

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
      "id, team_name, class, manager_member_id, tournaments(name, slug), divisions(name, display_name)"
    )
    .eq("roster_token", token)
    .maybeSingle();

  if (!registration) return null;

  const { data: members } = await supabase
    .from("roster_members")
    .select("id, name, role, signing_token, signed_at")
    .eq("registration_id", registration.id)
    .is("removed_at", null)
    .order("created_at", { ascending: true });

  // One row per person. The manager is on the roster and signs once, so she
  // is a LABEL on an existing row, not an extra entry.
  const signers = (members ?? []).map((m) => ({
    name: m.name,
    role: m.id === registration.manager_member_id ? "manager" : m.role,
    token: m.signing_token,
    signed: Boolean(m.signed_at),
  }));

  return {
    teamName: registration.team_name,
    tournamentName: registration.tournaments?.name,
    tournamentSlug: registration.tournaments?.slug,
    divisionName: registration.divisions?.display_name ?? registration.divisions?.name,
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
  const scope = [roster.divisionName, roster.className].filter(Boolean).join(" · ");

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="team-name text-2xl">{roster.teamName}</h1>
        <p className="t-meta">
          {roster.tournamentName}
          {scope ? ` · ${scope}` : ""}
        </p>
      </div>

      <div className="card p-4 space-y-1">
        <p className="t-strong">
          {official ? "Everyone has signed." : `${signed} of ${total} signed`}
        </p>
        <p className="t-meta">
          {official
            ? "This registration is official. Nothing else is needed."
            : "Find your name and tap it. You only sign for yourself."}
        </p>
      </div>

      <ul className="card divide-y divide-black/5">
        {roster.signers.map((s) => (
          <li key={s.token}>
            {s.signed ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="t-body text-afa-ink/50">
                  {s.name}
                  {needsRole(s) && <span className="t-meta"> &middot; {s.role}</span>}
                </span>
                <span className="t-label shrink-0">Signed</span>
              </div>
            ) : (
              <Link
                href={`/register/sign/${s.token}`}
                className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px]"
              >
                <span className="t-body">
                  {s.name}
                  {needsRole(s) && <span className="t-meta"> &middot; {s.role}</span>}
                </span>
                <span className="t-label text-afa-navy shrink-0">Sign &rsaquo;</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="t-meta">
        Signing is what makes the registration official. Submitting only put
        the team on the list.
        {roster.tournamentSlug && (
          <>
            {" "}
            <Link href={`/tournaments/${roster.tournamentSlug}`} className="underline">
              Tournament details
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
