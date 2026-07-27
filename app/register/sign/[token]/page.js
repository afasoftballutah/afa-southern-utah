import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import SignRosterMember from "@/components/SignRosterMember";

export const metadata = { title: "Sign Your Waiver — AFA Southern Utah" };

// Server-rendered every time (no caching) — this page shows PII gated only
// by knowledge of the token in the URL, so it must never be statically
// cached or served to anyone but the person who was handed this exact link.
export const dynamic = "force-dynamic";

const ROLE_LABEL = { coach: "Coach", manager: "Manager", player: "Player" };

// A token is either a roster member's or the manager's — same shape, same
// trust model, neither listed anywhere. Try the roster, then the manager.
// JD, 2026-07-27: the manager signs whenever, like everyone else.
async function getSignerByToken(token) {
  const supabase = getServiceClient();

  const { data: member } = await supabase
    .from("roster_members")
    .select(
      "id, role, name, birth_date, address, email, phone, signed_at, removed_at, registrations(team_name)"
    )
    .eq("signing_token", token)
    .maybeSingle();

  // A removed player keeps their link but it stops working. Gone from the
  // roster means gone — they must not be able to sign back on.
  if (member) {
    if (member.removed_at) return null;
    return {
      teamName: member.registrations?.team_name,
      role: member.role,
      name: member.name,
      birthDate: member.birth_date,
      address: member.address,
      email: member.email,
      phone: member.phone,
      alreadySigned: Boolean(member.signed_at),
    };
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select("team_name, manager_name, manager_email, manager_phone, manager_signed_at")
    .eq("manager_signing_token", token)
    .maybeSingle();

  if (!registration) return null;

  return {
    teamName: registration.team_name,
    role: "manager",
    name: registration.manager_name,
    email: registration.manager_email,
    phone: registration.manager_phone,
    alreadySigned: Boolean(registration.manager_signed_at),
  };
}

export default async function SignPage({ params }) {
  const { token } = await params;
  const signer = await getSignerByToken(token);
  if (!signer) notFound();

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="t-title">Sign Your Waiver</h1>
      <p className="text-afa-ink/80">
        {signer.teamName} &mdash; {ROLE_LABEL[signer.role] ?? "Player"}
      </p>
      <SignRosterMember token={token} member={signer} />
    </div>
  );
}
