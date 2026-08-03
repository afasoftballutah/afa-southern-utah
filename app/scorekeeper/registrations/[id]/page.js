import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { suggestClass, checkEligibility, checkRoster } from "@/lib/class";
import { registrationScope } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import RegistrationCard from "@/components/scorekeeper/RegistrationCard";
import ManageRoster from "@/components/ManageRoster";

export const dynamic = "force-dynamic"; // reads PII — never cached

// One team at one event. The thing a director means when they say "pull up
// Fallen at the T-Shirts" — the roster they will actually read down, with the
// class and waiver state that decides whether the team can play.
async function load(id) {
  const supabase = getServiceClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, class_id, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, manager_name, manager_email, manager_phone, manager_member_id, division_id, tournament_id, tournaments(id, name, slug, start_date, entry_fee_cents, deposit_cents), divisions(id, name, display_name, gender, class_id, min_men, min_women)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!registration) return null;

  const [{ data: members }, { data: classes }, { data: progressRows }] = await Promise.all([
    supabase
      .from("roster_members")
      .select("id, name, role, signed_at, removed_at, player_id, email, phone")
      .eq("registration_id", id)
      .order("created_at"),
    supabase.from("classes").select("id, name, sort_order").order("sort_order"),
    supabase.from("registration_signing_progress").select("*").eq("registration_id", id),
  ]);

  const playerIds = (members ?? []).map((m) => m.player_id).filter(Boolean);
  const { data: players } = playerIds.length
    ? await supabase.from("players").select("id, full_name, birth_date, rating, gender").in("id", playerIds)
    : { data: [] };
  const playerBy = new Map((players ?? []).map((p) => [p.id, p]));

  // Only the divisions of THIS tournament decide what classes are on offer.
  const { data: siblingDivisions } = await supabase
    .from("divisions")
    .select("id, name, display_name, class_id")
    .eq("tournament_id", registration.tournament_id);
  const offeredClassIds = [
    ...new Set((siblingDivisions ?? []).map((d) => d.class_id).filter(Boolean)),
  ];

  const active = (members ?? []).filter((m) => !m.removed_at);
  const roster = active.map((m) => {
    const person = m.player_id ? playerBy.get(m.player_id) : null;
    return {
      id: m.id,
      playerId: m.player_id ?? null,
      name: m.name,
      role: m.id === registration.manager_member_id ? "manager" : m.role,
      rating: person?.rating ?? null,
      gender: person?.gender ?? null,
      birthDate: person?.birth_date ?? null,
      signed: Boolean(m.signed_at),
    };
  });

  const enteredClass = (classes ?? []).find((c) => c.id === registration.class_id)?.name ?? null;
  const suggestion = suggestClass(roster, classes ?? [], offeredClassIds);

  return {
    registration,
    classes: classes ?? [],
    divisions: (siblingDivisions ?? []).map((d) => ({ id: d.id, label: d.display_name ?? d.name })),
    roster,
    removed: (members ?? []).filter((m) => m.removed_at),
    suggestion,
    check: checkEligibility(roster, enteredClass ?? suggestion.className),
    composition: checkRoster(roster, {
      minMen: registration.divisions?.min_men,
      minWomen: registration.divisions?.min_women,
    }),
    progress: progressRows?.[0] ?? { active_members: 0, signed_members: 0, is_official: false },
  };
}

// Titles are PUBLIC. Next runs generateMetadata for anyone who requests the
// URL, session or not, so naming the record here would put a real person's or
// team's name in the <title> of a page they are not allowed to open — and in
// any link preview of it. Gate it like the page body.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { title: "Team at an event" };
  const data = await load(id);
  return {
    title: data
      ? `${data.registration.team_name} — ${data.registration.tournaments?.name}`
      : "Team at an event",
  };
}

export default async function RegistrationPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Team</h1>
        <PinPad />
      </div>
    );
  }

  const data = await load(id);
  if (!data) notFound();
  const { registration: r, roster, removed, classes } = data;
  const enteredClassName =
    (data.classes ?? []).find((c) => c.id === r.class_id)?.name ??
    r.class ??
    null;
  // "Do It for the T-Shirts · Coed D" — never "· Coed · Coed D · D"
  const scope = registrationScope(r.divisions, enteredClassName);

  // Same shape ManageRoster expects (includes soft-removed for restore list)
  const manageMembers = [
    ...roster.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      birthDate: m.birthDate,
      gender: m.gender ?? null,
      rating: m.rating ?? null,
      signed: m.signed,
      removed: false,
      isManager: m.role === "manager" || m.id === r.manager_member_id,
    })),
    ...removed.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      birthDate: m.birth_date ?? null,
      gender: null,
      rating: null,
      signed: Boolean(m.signed_at),
      removed: true,
      isManager: m.id === r.manager_member_id,
    })),
  ];

  return (
    <DirectorShell
      title={r.team_name}
      count={`${r.tournaments?.name}${scope ? ` · ${scope}` : ""}`}
      back="/scorekeeper/tournaments"
    >
      <RegistrationCard
        registration={{
          ...r,
          progress: data.progress,
          members: roster,
          suggestion: data.suggestion,
          check: data.check,
          composition: data.composition,
          roster,
        }}
        classes={classes}
        divisions={data.divisions}
        showTitle={false}
      />

      <div className="max-w-lg mx-auto space-y-2">
        <h2 className="t-heading">Roster</h2>
        <p className="t-meta">
          Add players, release them to the free-agent pool, or claim free agents.
          Same tools as the manager link — you can do it here without leaving
          the control center.
        </p>
        {r.manage_token ? (
          <ManageRoster
            token={r.manage_token}
            initialMembers={manageMembers}
            rosterToken={r.roster_token}
            canEdit={r.status !== "withdrawn"}
            managerLabel="Manager"
          />
        ) : (
          <p className="t-meta text-afa-red font-semibold">
            No manage token on this registration — cannot edit roster.
          </p>
        )}
      </div>
    </DirectorShell>
  );
}
