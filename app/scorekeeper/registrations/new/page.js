import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import NewRegistration from "@/components/scorekeeper/NewRegistration";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a team — Control Center" };

export default async function NewRegistrationPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Add a team</h1>
        <PinPad />
      </div>
    );
  }

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, start_date, end_date, registration_closes, is_placeholder, divisions(id, name, display_name, sort_order, parent_division_id)")
    .order("start_date");

  // Every tournament that has not finished — a director enters teams for
  // events that are already running, which the public form deliberately does
  // not allow.
  const tournaments = (data ?? [])
    .filter((t) => !t.is_placeholder)
    .map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      open: isRegistrationOpen(t),
      divisions: (t.divisions ?? [])
        .filter((d) => !d.parent_division_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((d) => ({ id: d.id, name: d.display_name ?? d.name })),
    }))
    .filter((t) => t.divisions.length > 0);

  return (
    <DirectorShell title="Add a team" count="Entered by you, not by a manager" back="/scorekeeper/registrations">
      <NewRegistration tournaments={tournaments} />
    </DirectorShell>
  );
}
