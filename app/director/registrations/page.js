import Link from "next/link";
import { requireDirectorPage } from "@/lib/staff-gate";
import { getServiceClient } from "@/lib/supabase";
import PinPad from "@/components/scorekeeper/PinPad";
import TeamTable from "@/components/scorekeeper/TeamTable";

export const dynamic = "force-dynamic"; // live tool, and it reads PII — never cached
export const metadata = { title: "Registrations — Director" };

// Director-only. Field scorekeepers use /scorekeeper for games & umps.
async function getRegistrations() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, team_name, class, class_id, status, paid_at, amount_paid_cents, director_notes, " +
        "roster_token, manage_token, pdf_storage_path, submitted_at, manager_name, manager_email, " +
        "manager_phone, team_id, tournament_id, division_id, " +
        "tournaments(id, name, slug, start_date, entry_fee_cents, deposit_cents), divisions(name, display_name)"
    )
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { registrations: [], classes: [], divisions: [] };

  const [{ data: progress }, { data: members }, { data: classes }, { data: divisions }] =
    await Promise.all([
      supabase.from("registration_signing_progress").select("*"),
      supabase
        .from("roster_members")
        .select("registration_id, name, role, signed_at, removed_at, player_id"),
      supabase.from("classes").select("id, name, sort_order").order("sort_order"),
      supabase.from("divisions").select("id, tournament_id, name, display_name, sort_order"),
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

  // One flat list. It was grouped under a heading per tournament, which meant
  // the tournament could not be sorted or searched on — the table does both
  // now, and Tournament is just another column (JD, 2026-07-28: "major UI
  // cleanup to one line").
  return {
    registrations: enriched,
    classes: classes ?? [],
    // Move division only ever offers the tournament the team is already in.
    divisions: (divisions ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({ id: d.id, label: d.display_name ?? d.name, tournamentId: d.tournament_id })),
  };
}

export default async function RegistrationsPage() {
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Registrations</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const { registrations, classes, divisions } = await getRegistrations();
  const total = registrations.length;
  const unlinked = registrations.reduce(
    (n, r) => n + r.members.filter((m) => !m.player_id).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
          <h1 className="t-title">Registrations</h1>
          {total > 0 && (
            <span className="t-meta">
              {total} {total === 1 ? "registration" : "registrations"}
              {unlinked > 0 && (
                <>
                  {" · "}
                  <span className="text-afa-red font-semibold">
                    {unlinked} roster{" "}
                    {unlinked === 1 ? "entry" : "entries"} not matched
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href="/director/registrations/new"
            className="btn-action shrink-0"
          >
            + Add team
          </Link>
          <Link href="/director" className="btn-transient shrink-0">
            Director Home
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="t-strong">No teams have registered yet.</p>
          <p className="t-meta">
            They arrive here the moment someone submits{" "}
            <Link href="/register" className="underline">
              the form
            </Link>
            , or you can add one above.
          </p>
        </div>
      ) : (
        <TeamTable
          registrations={registrations}
          classes={classes}
          divisions={divisions}
          wide
        />
      )}
    </div>
  );
}
