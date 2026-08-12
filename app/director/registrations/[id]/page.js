import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidDirectorSession } from "@/lib/scorekeeper-auth";
import { requireDirectorPage } from "@/lib/staff-gate";
import { getServiceClient } from "@/lib/supabase";
import { suggestClass, checkEligibility, checkRoster } from "@/lib/class";
import { registrationScope } from "@/lib/director";
import { directorPersonLabel } from "@/lib/person-name";
import { leagueToday } from "@/lib/tournament-state";
import {
  activeSuspensionMap,
  loadSuspensionsForPlayers,
  partitionRosterBySuspension,
} from "@/lib/suspensions";
import { dualRosterCheckForRoster } from "@/lib/roster-eligibility";
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

  const [
    { data: members },
    { data: classes },
    { data: progressRows },
    { data: directory },
  ] = await Promise.all([
    supabase
      .from("roster_members")
      .select(
        "id, name, role, gender, signed_at, signed_ip, signed_place, signed_via, removed_at, player_id, email, phone, legal_first_name, legal_last_name, preferred_name, signing_token"
      )
      .eq("registration_id", id)
      .order("legal_last_name", { ascending: true, nullsFirst: false })
      .order("legal_first_name", { ascending: true, nullsFirst: false })
      .then(async (res) => {
        if (!res.error) return res;
        const { isMissingAuditSchema } = await import("@/lib/sign-audit");
        if (!isMissingAuditSchema(res.error)) return res;
        return supabase
          .from("roster_members")
          .select(
            "id, name, role, gender, signed_at, removed_at, player_id, email, phone, legal_first_name, legal_last_name, preferred_name, signing_token"
          )
          .eq("registration_id", id)
          .order("legal_last_name", { ascending: true, nullsFirst: false })
          .order("legal_first_name", { ascending: true, nullsFirst: false });
      }),
    supabase.from("classes").select("id, name, sort_order").order("sort_order"),
    supabase.from("registration_signing_progress").select("*").eq("registration_id", id),
    supabase
      .from("players")
      .select(
        "id, full_name, legal_first_name, legal_last_name, preferred_name, gender, birth_date"
      )
      .is("merged_into_id", null)
      .order("full_name")
      .limit(500),
  ]);

  const playerIds = (members ?? []).map((m) => m.player_id).filter(Boolean);
  const { data: players } = playerIds.length
    ? await supabase
        .from("players")
        .select(
          "id, full_name, birth_date, rating, gender, legal_first_name, legal_last_name, preferred_name"
        )
        .in("id", playerIds)
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

  const suspensionRows = await loadSuspensionsForPlayers(
    supabase,
    playerIds
  );
  const suspByPlayer = activeSuspensionMap(suspensionRows, {
    tournamentId: registration.tournament_id,
    asOf: leagueToday(),
  });

  const active = (members ?? []).filter((m) => !m.removed_at);
  const roster = active.map((m) => {
    const person = m.player_id ? playerBy.get(m.player_id) : null;
    // Director pages show full legal name (preferred only if a real nickname).
    const name = directorPersonLabel({
      legalFirstName: m.legal_first_name || person?.legal_first_name,
      legalLastName: m.legal_last_name || person?.legal_last_name,
      preferredName: m.preferred_name || person?.preferred_name,
      name: m.name,
    });
    const suspension = m.player_id
      ? suspByPlayer.get(m.player_id) ?? null
      : null;
    return {
      id: m.id,
      playerId: m.player_id ?? null,
      name,
      role: m.id === registration.manager_member_id ? "manager" : m.role,
      rating: person?.rating ?? null,
      gender: m.gender ?? person?.gender ?? null,
      birthDate: person?.birth_date ?? null,
      signed: Boolean(m.signed_at),
      signedAt: m.signed_at ?? null,
      signedPlace: m.signed_place ?? null,
      signedVia: m.signed_via ?? null,
      signedIp: m.signed_ip ?? null,
      signingToken: m.signing_token || null,
      signPath: m.signing_token
        ? `/register/sign/${m.signing_token}`
        : null,
      suspended: Boolean(suspension),
      suspension,
    };
  });

  const { mapDirectoryPlayers } = await import("@/lib/known-players");
  const knownPlayers = mapDirectoryPlayers(directory ?? []);

  // Suspended stay on the roster list but do not count for class / mins.
  const { counting, suspended } = partitionRosterBySuspension(
    roster,
    suspByPlayer
  );

  const enteredClass = (classes ?? []).find((c) => c.id === registration.class_id)?.name ?? null;
  const suggestion = suggestClass(counting, classes ?? [], offeredClassIds);
  const check = checkEligibility(
    counting,
    enteredClass ?? suggestion.className
  );
  const composition = checkRoster(counting, {
    minMen: registration.divisions?.min_men,
    minWomen: registration.divisions?.min_women,
  });
  if (suspended.length > 0) {
    composition.suspendedCount = suspended.length;
    composition.hasSuspended = true;
  }

  const dualRoster = await dualRosterCheckForRoster(supabase, {
    tournamentId: registration.tournament_id,
    registrationId: registration.id,
    divisionGender: registration.divisions?.gender ?? null,
    members: roster,
  });
  // Annotate roster rows for the pill list
  if (dualRoster.conflicts.length) {
    const byId = new Map(
      dualRoster.conflicts.map((c) => [c.memberId, c.otherTeams])
    );
    for (const m of roster) {
      if (byId.has(m.id)) {
        m.dualRosterTeams = byId.get(m.id);
      }
    }
  }

  // Load all open suspension rows per player for lift UI (not only active-for-this-event).
  const suspensionsForRoster = suspensionRows.filter((s) => !s.lifted_at);

  const { data: tourList } = await supabase
    .from("tournaments")
    .select("id, name, start_date")
    .eq("is_placeholder", false)
    .order("start_date", { ascending: false });

  return {
    registration,
    classes: classes ?? [],
    divisions: (siblingDivisions ?? []).map((d) => ({ id: d.id, label: d.display_name ?? d.name })),
    roster,
    removed: (members ?? []).filter((m) => m.removed_at),
    knownPlayers,
    suggestion,
    check,
    composition,
    dualRoster,
    progress: progressRows?.[0] ?? { active_members: 0, signed_members: 0, is_official: false },
    suspensionsForRoster,
    tournaments: (tourList ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
    })),
  };
}

// Titles are PUBLIC. Next runs generateMetadata for anyone who requests the
// URL, session or not, so naming the record here would put a real person's or
// team's name in the <title> of a page they are not allowed to open — and in
// any link preview of it. Gate it like the page body.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidDirectorSession(store)) return { title: "Team at an event" };
  const data = await load(id);
  return {
    title: data
      ? `${data.registration.team_name} — ${data.registration.tournaments?.name}`
      : "Team at an event",
  };
}

export default async function RegistrationPage({ params }) {
  const { id } = await params;
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Team</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const data = await load(id);
  if (!data) notFound();
  const { registration: r, roster, removed, classes, knownPlayers } = data;
  const enteredClassName =
    (data.classes ?? []).find((c) => c.id === r.class_id)?.name ??
    r.class ??
    null;
  // "Do It for the T-Shirts · Coed D" — never "· Coed · Coed D · D"
  const scope = registrationScope(r.divisions, enteredClassName);

  const suspById = new Map();
  for (const s of data.suspensionsForRoster ?? []) {
    if (!suspById.has(s.player_id)) suspById.set(s.player_id, []);
    suspById.get(s.player_id).push(s);
  }

  // Same shape ManageRoster expects (includes soft-removed for restore list).
  // Director view: full legal names, not preferred-only first names.
  const manageMembers = [
    ...roster.map((m) => ({
      id: m.id,
      playerId: m.playerId,
      name: m.name,
      role: m.role,
      birthDate: m.birthDate,
      gender: m.gender ?? null,
      rating: m.rating ?? null,
      signed: m.signed,
      signedAt: m.signedAt ?? null,
      signedPlace: m.signedPlace ?? null,
      signedVia: m.signedVia ?? null,
      signedIp: m.signedIp ?? null,
      signPath: m.signPath ?? null,
      removed: false,
      isManager: m.role === "manager" || m.id === r.manager_member_id,
      suspended: m.suspended,
      suspension: m.suspension,
      suspensions: m.playerId ? suspById.get(m.playerId) ?? [] : [],
      dualRosterTeams: m.dualRosterTeams ?? [],
    })),
    ...removed.map((m) => ({
      id: m.id,
      playerId: m.player_id ?? null,
      name: directorPersonLabel({
        legalFirstName: m.legal_first_name,
        legalLastName: m.legal_last_name,
        preferredName: m.preferred_name,
        name: m.name,
      }),
      role: m.role,
      birthDate: m.birth_date ?? null,
      gender: m.gender ?? null,
      rating: null,
      signed: Boolean(m.signed_at),
      removed: true,
      isManager: m.id === r.manager_member_id,
      suspended: false,
      suspensions: [],
    })),
  ];

  const suspendedCount = roster.filter((m) => m.suspended).length;

  return (
    <DirectorShell
      title={r.team_name}
      count={`${r.tournaments?.name}${scope ? ` · ${scope}` : ""}`}
      back="/director/tournaments"
      backLabel="Tournaments"
    >
      <RegistrationCard
        registration={{
          ...r,
          progress: data.progress,
          members: roster,
          suggestion: data.suggestion,
          check: data.check,
          composition: data.composition,
          dualRoster: data.dualRoster,
          roster,
        }}
        classes={classes}
        divisions={data.divisions}
        showTitle={false}
      />

      <div className="max-w-lg mx-auto space-y-2">
        <h2 className="t-heading">Roster</h2>
        <p className="t-meta">
          Add or remove players, or claim someone from a withdrawn team.
          Same tools as the manager link — you can do it here without leaving
          the control center.
          {suspendedCount > 0
            ? ` ${suspendedCount} suspended — they stay listed but do not count toward roster requirements.`
            : ""}
        </p>
        {r.manage_token ? (
          <ManageRoster
            token={r.manage_token}
            initialMembers={manageMembers}
            rosterToken={r.roster_token}
            canEdit={r.status !== "withdrawn"}
            managerLabel="Manager"
            knownPlayers={knownPlayers}
            directorMode
            tournamentId={r.tournament_id}
            tournaments={data.tournaments}
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
