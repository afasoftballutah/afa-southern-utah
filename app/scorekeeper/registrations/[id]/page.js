import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { suggestClass, checkEligibility, checkRoster } from "@/lib/class";
import { genderLabel } from "@/lib/director";
import { lastNameFirst, lastNameKey, bornWithAge } from "@/lib/names";
import { leagueToday } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import RegistrationCard from "@/components/scorekeeper/RegistrationCard";

export const dynamic = "force-dynamic"; // reads PII — never cached

// One team at one event. The thing a director means when they say "pull up
// Fallen at the T-Shirts" — the roster they will actually read down, with the
// class and waiver state that decides whether the team can play.
async function load(id) {
  const supabase = getServiceClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, class_id, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, manager_name, manager_email, manager_phone, manager_member_id, division_id, tournament_id, tournaments(id, name, slug, start_date), divisions(id, name, display_name, gender, class_id, min_men, min_women)"
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
    .select("class_id")
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
  const today = leagueToday();
  // A division literally named "Coed" already says its gender, so do not
  // print "Coed · Coed".
  const divisionName = r.divisions?.display_name ?? r.divisions?.name;
  const gender = genderLabel(r.divisions?.gender);
  const scope = [...new Set([gender, divisionName].filter(Boolean))].join(" · ");

  const sorted = [...roster].sort((a, b) =>
    lastNameKey(a.name).localeCompare(lastNameKey(b.name))
  );

  return (
    <DirectorShell
      title={r.team_name}
      count={`${r.tournaments?.name}${scope ? ` · ${scope}` : ""}`}
      back={`/scorekeeper/tournaments/${r.tournament_id}`}
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
      />

      <h2 className="t-heading">Roster</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-[15px] leading-snug">
          <thead>
            <tr className="border-b border-afa-navy/15">
              {["Name", "M/F", "Born", "Rating", "Waiver"].map((h, i) => (
                <th
                  key={h}
                  className={"px-3 py-1.5 t-label font-normal " + (i > 0 ? "text-center" : "text-left")}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.id} className="border-b border-black/5 last:border-0">
                <td className="px-3 py-1.5 font-semibold text-afa-navy whitespace-nowrap">
                  {m.playerId ? (
                    <Link href={`/scorekeeper/players/${m.playerId}`} className="hover:underline">
                      {lastNameFirst(m.name)}
                    </Link>
                  ) : (
                    lastNameFirst(m.name)
                  )}
                  {m.role !== "player" && <span className="t-meta"> · {m.role}</span>}
                </td>
                <td className="px-3 py-1.5 text-center">{m.gender ?? "—"}</td>
                <td className="px-3 py-1.5 text-center whitespace-nowrap tabular-nums">
                  {bornWithAge(m.birthDate, today)}
                </td>
                <td className="px-3 py-1.5 text-center">{m.rating ?? "—"}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={"tick " + (m.signed ? "text-afa-go" : "text-afa-muted/50")}>
                    {m.signed ? "☑" : "☐"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {removed.length > 0 && (
        <p className="t-meta">
          Off the roster: {removed.map((m) => m.name).join(", ")}
        </p>
      )}
    </DirectorShell>
  );
}
