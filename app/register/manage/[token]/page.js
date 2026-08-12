import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import { loadKnownPlayers } from "@/lib/known-players";
import { directorPersonLabel } from "@/lib/person-name";
import ManageRoster from "@/components/ManageRoster";
import RegisterBack from "@/components/RegisterBack";
import RememberManageVisit from "@/components/RememberManageVisit";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import { seatFromDivision } from "@/lib/division-layout";

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
      "id, team_name, class, status, roster_token, manager_member_id, tournaments(name, slug), divisions(id, name, display_name, gender)"
    )
    .eq("manage_token", token)
    .maybeSingle();

  if (!registration) return null;

  const [{ data: members }, knownPlayers] = await Promise.all([
    supabase
      .from("roster_members")
      .select(
        "id, name, role, gender, birth_date, signed_at, removed_at, player_id, legal_first_name, legal_last_name, preferred_name"
      )
      .eq("registration_id", registration.id)
      .order("legal_last_name", { ascending: true, nullsFirst: false })
      .order("legal_first_name", { ascending: true, nullsFirst: false }),
    // Manage-token page only — directory for the add-player search.
    loadKnownPlayers(supabase),
  ]);

  return {
    teamName: registration.team_name,
    tournamentName: registration.tournaments?.name,
    tournamentSlug: registration.tournaments?.slug,
    divisionId: registration.divisions?.id ?? null,
    divisionName: registration.divisions?.display_name ?? registration.divisions?.name,
    divisionGender: registration.divisions?.gender ?? null,
    className: registration.class,
    status: registration.status,
    rosterToken: registration.roster_token,
    manageToken: token,
    managerMemberId: registration.manager_member_id,
    knownPlayers,
    // Full legal name for managers — first-only `name` is score-sheet style
    // and is not enough to tell teammates apart on this page.
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: directorPersonLabel({
        legalFirstName: m.legal_first_name,
        legalLastName: m.legal_last_name,
        preferredName: m.preferred_name,
        name: m.name,
      }),
      role: m.id === registration.manager_member_id ? "manager" : m.role,
      gender: m.gender ?? null,
      birthDate: m.birth_date,
      signed: Boolean(m.signed_at),
      removed: Boolean(m.removed_at),
      isManager: m.id === registration.manager_member_id,
      playerId: m.player_id ?? null,
    })),
  };
}

export default async function ManageRosterPage({ params }) {
  const { token } = await params;
  const data = await getManageable(token);
  if (!data) notFound();

  const seat = seatFromDivision({
    gender: data.divisionGender,
    display_name: data.divisionName,
    name: data.divisionName,
  });

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
        divisionId={data.divisionId}
        genderKey={seat?.genderKey}
        genderLabel={seat?.genderLabel}
        levelLabel={seat?.levelLabel}
        seatLabel={seat?.seatLabel}
      />
      <RegisterBack href={backHref} label={backLabel} />
      <div>
        <h1 className="team-name text-2xl">{data.teamName}</h1>
        <p className="t-meta flex flex-wrap items-center gap-1.5 mt-0.5">
          <DivisionSeatMark
            genderKey={seat?.genderKey}
            seatLabel={seat?.seatLabel}
          />
          {data.tournamentName ? <span>{data.tournamentName}</span> : null}
        </p>
      </div>

      <div className="card p-4 space-y-1">
        <p className="t-strong">Manage your roster</p>
        <p className="t-meta">
          Keep this link to yourself. Search the directory to add someone
          already on file, or type first name, last name, and gender for a new
          player — they complete legal name, preferred name, birth date, email,
          and address when they sign. Release someone to the free-agent pool or
          claim free agents here. A player cannot be on two teams in the same
          gender for this tournament.
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
