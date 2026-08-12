import { getServiceClient } from "@/lib/supabase";
import { registrationNameKey } from "@/lib/register-key";

// Public: is this tournament + division + team name already live?
// Same key as registrations_one_live_per_division. No PII.

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tournamentId = body?.tournamentId;
  const divisionId = body?.divisionId;
  const key = registrationNameKey(body?.teamName);
  if (!tournamentId || !divisionId || !key) {
    return Response.json(
      { error: "Team, tournament, and division are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("registrations")
    .select("team_name, status")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .neq("status", "withdrawn");

  if (error) {
    console.error("register check failed", error);
    return Response.json({ error: "Could not check that name" }, { status: 500 });
  }

  const taken = (data || []).some(
    (r) => registrationNameKey(r.team_name) === key
  );
  return Response.json({ ok: true, taken });
}
