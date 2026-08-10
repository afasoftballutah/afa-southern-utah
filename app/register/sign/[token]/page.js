import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import SignRosterMember from "@/components/SignRosterMember";
import RegisterBack from "@/components/RegisterBack";

export const metadata = { title: "Sign Your Waiver — AFA Southern Utah" };

// Server-rendered every time (no caching) — this page shows PII gated only
// by knowledge of the token in the URL, so it must never be statically
// cached or served to anyone but the person who was handed this exact link.
export const dynamic = "force-dynamic";

const ROLE_LABEL = { coach: "Coach", manager: "Manager", player: "Player" };

// One kind of token. The manager is a roster member like anyone else, so
// there is no separate manager lookup — only a manager LABEL on her row.
async function getSignerByToken(token) {
  const supabase = getServiceClient();

  // Relationship named on purpose: two foreign keys join these tables now, so
  // a bare `registrations(...)` embed is ambiguous and fails.
  const { data: member, error } = await supabase
    .from("roster_members")
    .select(
      "id, role, name, legal_first_name, legal_last_name, preferred_name, birth_date, address, email, phone, signed_at, removed_at, registrations!roster_members_registration_id_fkey(team_name, manager_member_id, roster_token, tournaments(slug, name))"
    )
    .eq("signing_token", token)
    .maybeSingle();

  if (error) {
    console.error("signing page lookup failed", error);
    return null;
  }
  if (!member) return null;

  // A removed player keeps their link but it stops working. Gone from the
  // roster means gone — they must not be able to sign back on.
  if (member.removed_at) return null;

  const isManager = member.registrations?.manager_member_id === member.id;
  const reg = member.registrations;

  return {
    teamName: reg?.team_name,
    role: isManager ? "manager" : member.role,
    name: member.name,
    legalFirstName: member.legal_first_name,
    legalLastName: member.legal_last_name,
    preferredName: member.preferred_name,
    // A manager who plays is still a player on the form — her birth date and
    // address belong on her waiver like anyone else's.
    birthDate: member.birth_date,
    address: member.address,
    email: member.email,
    phone: member.phone,
    alreadySigned: Boolean(member.signed_at),
    rosterToken: reg?.roster_token ?? null,
    tournamentSlug: reg?.tournaments?.slug ?? null,
    tournamentName: reg?.tournaments?.name ?? null,
  };
}

export default async function SignPage({ params }) {
  const { token } = await params;
  const signer = await getSignerByToken(token);
  if (!signer) notFound();

  const backHref = signer.rosterToken
    ? `/register/roster/${signer.rosterToken}`
    : signer.tournamentSlug
      ? `/tournaments/${signer.tournamentSlug}`
      : "/tournaments";
  const backLabel = signer.rosterToken
    ? "Team roster"
    : signer.tournamentName || "Tournaments";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RegisterBack href={backHref} label={backLabel} />
      <h1 className="t-title">Sign Your Waiver</h1>
      <p className="text-afa-ink/80">
        {signer.teamName} &mdash; {ROLE_LABEL[signer.role] ?? "Player"}
      </p>
      <SignRosterMember token={token} member={signer} />
    </div>
  );
}
