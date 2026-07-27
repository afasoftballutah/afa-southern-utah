import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import ManageRoster from "@/components/ManageRoster";

export const metadata = { title: "Manage Your Roster — AFA Southern Utah" };

// Never cached, and gated only by the token in the URL. Same rule as the
// personal signing page.
export const dynamic = "force-dynamic";

// This is the MANAGER's page. It is reached by manage_token, which she never
// shares — not roster_token, which is the read-only link the whole team has.
async function getManageable(token) {
  const supabase = getServiceClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, status, roster_token, manager_member_id, tournaments(name, slug), divisions(name, display_name)"
    )
    .eq("manage_token", token)
    .maybeSingle();

  if (!registration) return null;

  const { data: members } = await supabase
    .from("roster_members")
    .select("id, name, role, birth_date, signed_at, removed_at")
    .eq("registration_id", registration.id)
    .order("created_at", { ascending: true });

  return {
    teamName: registration.team_name,
    tournamentName: registration.tournaments?.name,
    tournamentSlug: registration.tournaments?.slug,
    divisionName: registration.divisions?.display_name ?? registration.divisions?.name,
    className: registration.class,
    status: registration.status,
    rosterToken: registration.roster_token,
    managerMemberId: registration.manager_member_id,
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.id === registration.manager_member_id ? "manager" : m.role,
      birthDate: m.birth_date,
      signed: Boolean(m.signed_at),
      removed: Boolean(m.removed_at),
      isManager: m.id === registration.manager_member_id,
    })),
  };
}

export default async function ManageRosterPage({ params }) {
  const { token } = await params;
  const data = await getManageable(token);
  if (!data) notFound();

  const scope = [data.divisionName, data.className].filter(Boolean).join(" · ");

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="team-name text-2xl">{data.teamName}</h1>
        <p className="t-meta">
          {data.tournamentName}
          {scope ? ` · ${scope}` : ""}
        </p>
      </div>

      <div className="card p-4 space-y-1">
        <p className="t-strong">Manage your roster</p>
        <p className="t-meta">
          Keep this link to yourself. The team link is the other one — it lets
          people sign, and nothing else.
        </p>
      </div>

      {data.status === "withdrawn" && (
        <p className="t-meta text-afa-red font-semibold">
          This team is marked withdrawn. Ask the director to reinstate it before
          changing the roster.
        </p>
      )}

      <ManageRoster token={token} initialMembers={data.members} rosterToken={data.rosterToken} />

      {data.tournamentSlug && (
        <p className="t-meta">
          <Link href={`/tournaments/${data.tournamentSlug}`} className="underline">
            Tournament details
          </Link>
        </p>
      )}
    </div>
  );
}
