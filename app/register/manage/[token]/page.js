import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import ManageRoster from "@/components/ManageRoster";
import RegisterBack from "@/components/RegisterBack";
import RememberManageVisit from "@/components/RememberManageVisit";

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
      "id, team_name, class, status, roster_token, manager_member_id, tournaments(name, slug), divisions(name, display_name, gender)"
    )
    .eq("manage_token", token)
    .maybeSingle();

  if (!registration) return null;

  const [{ data: members }, { data: directory }] = await Promise.all([
    supabase
      .from("roster_members")
      .select("id, name, role, gender, birth_date, signed_at, removed_at")
      .eq("registration_id", registration.id)
      .order("created_at", { ascending: true }),
    // Manage-token page only — directory for the add-player dropdown.
    supabase
      .from("players")
      .select(
        "id, full_name, legal_first_name, legal_last_name, preferred_name, gender, birth_date"
      )
      .is("merged_into_id", null)
      .order("full_name")
      .limit(500),
  ]);

  const knownPlayers = (directory ?? []).map((p) => {
    const first =
      String(p.legal_first_name ?? "").trim() ||
      String(p.full_name ?? "").trim().split(/\s+/)[0] ||
      "";
    const last =
      String(p.legal_last_name ?? "").trim() ||
      String(p.full_name ?? "")
        .trim()
        .split(/\s+/)
        .slice(1)
        .join(" ") ||
      "";
    const label =
      [last, first].filter(Boolean).join(", ") ||
      p.preferred_name ||
      p.full_name ||
      "—";
    return {
      id: p.id,
      label: p.birth_date ? `${label} (${p.birth_date})` : label,
      firstName: first,
      lastName: last,
      gender: p.gender === "M" || p.gender === "F" ? p.gender : null,
    };
  });

  return {
    teamName: registration.team_name,
    tournamentName: registration.tournaments?.name,
    tournamentSlug: registration.tournaments?.slug,
    divisionName: registration.divisions?.display_name ?? registration.divisions?.name,
    className: registration.class,
    status: registration.status,
    rosterToken: registration.roster_token,
    manageToken: token,
    managerMemberId: registration.manager_member_id,
    knownPlayers,
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.id === registration.manager_member_id ? "manager" : m.role,
      gender: m.gender ?? null,
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

  // Division often already includes class ("Coed D") — don't append "D" again.
  const scope = (() => {
    const div = (data.divisionName ?? "").trim();
    const cls = (data.className ?? "").trim();
    if (!div && !cls) return "";
    if (!cls) return div;
    if (!div) return cls;
    if (div.toLowerCase().includes(cls.toLowerCase())) return div;
    if (cls.toLowerCase().includes(div.toLowerCase())) return cls;
    return `${div} · ${cls}`;
  })();

  const backHref = data.rosterToken
    ? `/register/roster/${data.rosterToken}`
    : data.tournamentSlug
      ? `/tournaments/${data.tournamentSlug}`
      : "/tournaments";
  const backLabel = data.rosterToken
    ? "Team roster"
    : data.tournamentName || "Tournaments";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Persist manage link on this device when the manager opens it */}
      <RememberManageVisit
        teamName={data.teamName}
        tournamentName={data.tournamentName}
        tournamentSlug={data.tournamentSlug}
        manageToken={data.manageToken}
        rosterToken={data.rosterToken}
      />
      <RegisterBack href={backHref} label={backLabel} />
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
          Keep this link to yourself. Add players with first name, last name,
          and gender only — they complete legal name, preferred name, birth
          date, email, and address when they sign. Release someone to the
          free-agent pool or claim free agents here. A player cannot be on two
          teams in the same gender for this tournament.
        </p>
      </div>

      {data.status === "withdrawn" && (
        <p className="t-meta text-afa-red font-semibold">
          This team is marked withdrawn. Ask the director to reinstate it before
          changing the roster.
        </p>
      )}

      <ManageRoster
        token={token}
        initialMembers={data.members}
        rosterToken={data.rosterToken}
        canEdit={data.status !== "withdrawn"}
        knownPlayers={data.knownPlayers}
      />

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
