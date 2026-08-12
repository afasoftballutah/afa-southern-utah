import { getServiceClient } from "@/lib/supabase";

// Prefill a new registration from a manage token this device already has.
// Never returns data for a name the caller cannot prove they manage.

export const runtime = "nodejs";

function splitName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body?.manageToken || "").trim();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !uuid.test(token)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getServiceClient();
  const { data: reg, error } = await supabase
    .from("registrations")
    .select(
      "id, team_name, tournament_id, division_id, afa_membership_number, manager_name, manager_email, manager_phone, manager_cell, manager_address, manager_city, manager_state, manager_zip, manager_member_id, status"
    )
    .eq("manage_token", token)
    .maybeSingle();

  if (error) {
    console.error("register prefill failed", error);
    return Response.json({ error: "Could not load that team" }, { status: 500 });
  }
  if (!reg) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: members } = await supabase
    .from("roster_members")
    .select(
      "id, role, name, legal_first_name, legal_last_name, preferred_name, gender, player_id, email, phone, removed_at"
    )
    .eq("registration_id", reg.id)
    .is("removed_at", null);

  const list = members ?? [];
  const managerRow =
    list.find((m) => m.id === reg.manager_member_id) ||
    list.find((m) => m.role === "manager") ||
    null;
  const fromLine = splitName(reg.manager_name);

  const manager = {
    legalFirstName: managerRow?.legal_first_name || fromLine.first,
    legalLastName: managerRow?.legal_last_name || fromLine.last,
    preferredName: managerRow?.preferred_name || "",
    name: reg.manager_name || "",
    email: reg.manager_email || managerRow?.email || "",
    phone: reg.manager_phone || managerRow?.phone || "",
    cell: reg.manager_cell || "",
    address: reg.manager_address || "",
    city: reg.manager_city || "",
    state: reg.manager_state || "",
    zip: reg.manager_zip || "",
  };

  const players = list
    .map((m) => {
      const first = String(m.legal_first_name || "").trim();
      const last = String(m.legal_last_name || "").trim();
      const fallback = splitName(m.name);
      return {
        firstName: first || fallback.first,
        lastName: last || fallback.last,
        gender: m.gender === "M" || m.gender === "F" ? m.gender : "",
        playerId: m.player_id || null,
      };
    })
    .filter((p) => p.firstName && p.lastName);

  return Response.json({
    ok: true,
    teamName: reg.team_name,
    tournamentId: reg.tournament_id,
    divisionId: reg.division_id,
    afaMembershipNumber: reg.afa_membership_number || "",
    manager,
    players,
  });
}
