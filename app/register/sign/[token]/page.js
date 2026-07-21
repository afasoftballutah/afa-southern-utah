import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import SignRosterMember from "@/components/SignRosterMember";

export const metadata = { title: "Sign Your Waiver — AFA Southern Utah" };

// Server-rendered every time (no caching) — this page shows PII gated only
// by knowledge of the token in the URL, so it must never be statically
// cached or served to anyone but the person who was handed this exact link.
export const dynamic = "force-dynamic";

async function getMemberByToken(token) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("roster_members")
    .select("id, role, name, birth_date, address, email, phone, signed_at, registration_id, registrations(team_name)")
    .eq("signing_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export default async function SignPage({ params }) {
  const { token } = await params;
  const member = await getMemberByToken(token);
  if (!member) notFound();

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-black text-afa-navy">Sign Your Waiver</h1>
      <p className="text-afa-ink/80">
        {member.registrations?.team_name} &mdash; {member.role === "coach" ? "Coach" : "Player"}
      </p>
      <SignRosterMember
        token={token}
        member={{
          name: member.name,
          role: member.role,
          birthDate: member.birth_date,
          address: member.address,
          email: member.email,
          phone: member.phone,
          alreadySigned: Boolean(member.signed_at),
        }}
      />
    </div>
  );
}
