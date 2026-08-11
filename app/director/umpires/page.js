import { requireDirectorPage } from "@/lib/staff-gate";
import { getServiceClient } from "@/lib/supabase";
import { leagueToday } from "@/lib/tournament-state";
import {
  isSuspensionActive,
  listOpenUmpireSuspensions,
  loadSuspensionsForUmpires,
  suspensionScopeLabel,
} from "@/lib/suspensions";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import UmpireRoster from "@/components/scorekeeper/UmpireRoster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Umpires — Director" };

function mapRow(r) {
  const preferred = r.preferred_name?.trim() || "";
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: r.preferred_name || "",
    cardNumber: r.card_number,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    phone: r.phone,
    email: r.email,
    pitchFast: r.pitch_fast,
    pitchSlow: r.pitch_slow,
    status: r.status,
    notes: r.notes,
    displayName: preferred || `${r.last_name}, ${r.first_name}`,
  };
}

async function loadUmpires() {
  try {
    const supabase = getServiceClient();
    const [
      { data, error },
      openSuspensions,
      { data: tourRows },
    ] = await Promise.all([
      supabase
        .from("umpires")
        .select("*")
        .order("last_name")
        .order("first_name"),
      listOpenUmpireSuspensions(supabase),
      supabase
        .from("tournaments")
        .select("id, name, start_date")
        .eq("is_placeholder", false)
        .order("start_date", { ascending: false }),
    ]);
    if (error) {
      if (error.message?.includes("umpires") || error.code === "42P01") {
        return {
          umpires: [],
          needsMigration: true,
          tournaments: [],
          suspensionsByUmpire: {},
        };
      }
      throw error;
    }

    const tournaments = (tourRows ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
    }));
    const tourNameBy = new Map(tournaments.map((t) => [t.id, t.name]));
    const today = leagueToday();

    // All rows (open + a bit of history) for the suspend dialog lift UI.
    const allForDialog = await loadSuspensionsForUmpires(
      supabase,
      (data ?? []).map((r) => r.id)
    );

    const byUmp = new Map();
    for (const s of allForDialog) {
      if (!byUmp.has(s.umpire_id)) byUmp.set(s.umpire_id, []);
      byUmp.get(s.umpire_id).push({
        ...s,
        tournament_name: s.tournament_id
          ? tourNameBy.get(s.tournament_id)
          : null,
      });
    }

    const umpires = (data ?? []).map((r) => {
      const base = mapRow(r);
      const list = byUmp.get(r.id) ?? [];
      const currentlySuspended = list.some(
        (s) =>
          !s.lifted_at &&
          isSuspensionActive(s, {
            asOf: today,
            tournamentId: s.tournament_id,
          })
      );
      const activeNotes = list
        .filter(
          (s) =>
            !s.lifted_at &&
            isSuspensionActive(s, {
              asOf: today,
              tournamentId: s.tournament_id,
            })
        )
        .map((s) => suspensionScopeLabel(s, tourNameBy));
      return {
        ...base,
        suspended: currentlySuspended,
        suspensionLabels: activeNotes,
        suspensions: list,
      };
    });

    return {
      umpires,
      needsMigration: false,
      tournaments,
      openSuspensionCount: openSuspensions.length,
    };
  } catch {
    return {
      umpires: [],
      needsMigration: true,
      tournaments: [],
      openSuspensionCount: 0,
    };
  }
}

export default async function UmpiresPage() {
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Umpires</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const { umpires, needsMigration, tournaments, openSuspensionCount } =
    await loadUmpires();

  const active = umpires.filter((u) => u.status !== "inactive").length;
  const suspendedNow = umpires.filter((u) => u.suspended).length;

  return (
    <DirectorShell
      title="Umpires"
      count={
        umpires.length === 0
          ? "Add people to the roster"
          : suspendedNow > 0
            ? `${active} active · ${suspendedNow} suspended · ${umpires.length} on file`
            : `${active} active · ${umpires.length} on file`
      }
      back="/director"
    >
      {needsMigration && (
        <div className="card p-4 border border-amber-300 bg-amber-50">
          <p className="t-strong">Database migration needed</p>
          <p className="t-meta mt-1">
            Run <code className="text-sm">supabase/migration-2026-08-10-umpires.sql</code>{" "}
            in the Supabase SQL editor, then refresh this page.
          </p>
        </div>
      )}
      <UmpireRoster
        initial={umpires}
        canEdit
        tournaments={tournaments}
      />
    </DirectorShell>
  );
}
