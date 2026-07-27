import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import PinPad from "@/components/scorekeeper/PinPad";
import RegistrationCard from "@/components/scorekeeper/RegistrationCard";

export const dynamic = "force-dynamic"; // live tool, and it reads PII — never cached
export const metadata = { title: "Registrations — Scorekeeper" };

// Behind the scorekeeper session for now (JD, 2026-07-27: "lets defer the
// security stuff til the end" / "this site isnt used yet"). That is ONE shared
// PIN with no roles, so anyone who can enter a score can read every roster on
// this page. The gate is this single call — swapping it for a director-only
// check later is a one-line change here and in the two routes under
// /api/scorekeeper/registrations.
async function getRegistrations() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, submitted_at, manager_name, manager_email, manager_phone, team_id, tournaments(id, name, slug, start_date), divisions(name, display_name)"
    )
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [{ data: progress }, { data: members }] = await Promise.all([
    supabase.from("registration_signing_progress").select("*"),
    supabase
      .from("roster_members")
      .select("registration_id, name, role, signed_at, removed_at, player_id"),
  ]);

  const progressBy = new Map((progress ?? []).map((p) => [p.registration_id, p]));
  const membersBy = new Map();
  for (const m of members ?? []) {
    if (m.removed_at) continue;
    if (!membersBy.has(m.registration_id)) membersBy.set(m.registration_id, []);
    membersBy.get(m.registration_id).push(m);
  }

  const enriched = rows.map((r) => ({
    ...r,
    progress: progressBy.get(r.id) ?? { active_members: 0, signed_members: 0, is_official: false },
    members: membersBy.get(r.id) ?? [],
  }));

  // Group by tournament, soonest first — the same instinct as the scorekeeper
  // index: the thing happening next is the thing you came here for.
  const byTournament = new Map();
  for (const r of enriched) {
    const key = r.tournaments?.id ?? "_";
    if (!byTournament.has(key)) {
      byTournament.set(key, { tournament: r.tournaments, registrations: [] });
    }
    byTournament.get(key).registrations.push(r);
  }
  return [...byTournament.values()].sort((a, b) =>
    String(a.tournament?.start_date ?? "").localeCompare(String(b.tournament?.start_date ?? ""))
  );
}

export default async function RegistrationsPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Registrations</h1>
        <PinPad />
      </div>
    );
  }

  const groups = await getRegistrations();
  const total = groups.reduce((n, g) => n + g.registrations.length, 0);
  const unlinked = groups.reduce(
    (n, g) =>
      n + g.registrations.reduce((k, r) => k + r.members.filter((m) => !m.player_id).length, 0),
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="t-title">Registrations</h1>
        <Link href="/scorekeeper" className="t-meta underline">
          Scorekeeper
        </Link>
      </div>

      {total === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="t-strong">No teams have registered yet.</p>
          <p className="t-meta">
            They arrive here the moment someone submits{" "}
            <Link href="/register" className="underline">
              the form
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <p className="t-meta">
            {total} {total === 1 ? "registration" : "registrations"}
            {unlinked > 0 && (
              <>
                {" · "}
                <span className="text-afa-red font-semibold">
                  {unlinked} roster {unlinked === 1 ? "entry" : "entries"} not matched to a person
                </span>
              </>
            )}
          </p>

          {groups.map((g) => (
            <section key={g.tournament?.id ?? "none"} className="space-y-3">
              <h2 className="t-heading">{g.tournament?.name ?? "Unknown tournament"}</h2>
              {g.registrations.map((r) => (
                <RegistrationCard key={r.id} registration={r} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
