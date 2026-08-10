import { requireDirectorPage } from "@/lib/staff-gate";
import { getServiceClient } from "@/lib/supabase";
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
    const { data, error } = await supabase
      .from("umpires")
      .select("*")
      .order("last_name")
      .order("first_name");
    if (error) {
      if (error.message?.includes("umpires") || error.code === "42P01") {
        return { umpires: [], needsMigration: true };
      }
      throw error;
    }
    return { umpires: (data ?? []).map(mapRow), needsMigration: false };
  } catch {
    return { umpires: [], needsMigration: true };
  }
}

export default async function UmpiresPage() {
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Umpires</h1>
        <PinPad />
      </div>
    );
  }

  const { umpires, needsMigration } = await loadUmpires();

  const active = umpires.filter((u) => u.status !== "inactive").length;

  return (
    <DirectorShell
      title="Umpires"
      count={
        umpires.length === 0
          ? "Empty roster"
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
      <UmpireRoster initial={umpires} canEdit />
    </DirectorShell>
  );
}
