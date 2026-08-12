import { getServiceClient } from "@/lib/supabase";
import { seatFromDivision } from "@/lib/division-layout";
import { isSiblingSeat } from "@/lib/register-key";

// Given a manage token this phone already has, return the other live seats
// for that same club + manager + tournament (Fallen Men's + Fallen Coed).
// Knowledge of one manage token is the credential — we never look up by name.

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pack(row, origin) {
  const seat = seatFromDivision(row.divisions);
  return {
    teamName: row.team_name,
    status: row.status,
    tournamentName: row.tournaments?.name || "",
    tournamentSlug: row.tournaments?.slug || "",
    manageToken: row.manage_token,
    rosterToken: row.roster_token,
    divisionId: row.division_id || row.divisions?.id || "",
    manageLink: `${origin}/register/manage/${row.manage_token}`,
    rosterLink: row.roster_token
      ? `${origin}/register/roster/${row.roster_token}`
      : null,
    genderKey: seat?.genderKey || "",
    genderLabel: seat?.genderLabel || "",
    levelLabel: seat?.levelLabel || "",
    seatLabel: seat?.seatLabel || "",
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body?.manageTokens ?? body?.manageToken;
  const tokens = (Array.isArray(raw) ? raw : [raw])
    .map((t) => String(t || "").trim())
    .filter((t) => UUID.test(t));
  if (tokens.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getServiceClient();
  const { data: sources, error: srcErr } = await supabase
    .from("registrations")
    .select(
      "id, team_name, tournament_id, division_id, status, manage_token, roster_token, manager_email, manager_name, tournaments(name, slug), divisions(id, name, display_name, gender)"
    )
    .in("manage_token", tokens);
  if (srcErr) {
    console.error("register siblings source failed", srcErr);
    return Response.json({ error: "Could not load that team" }, { status: 500 });
  }
  if (!sources?.length) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const tourIds = [...new Set(sources.map((s) => s.tournament_id).filter(Boolean))];
  let live = [];
  if (tourIds.length) {
    const listed = await supabase
      .from("registrations")
      .select(
        "id, team_name, tournament_id, division_id, status, manage_token, roster_token, manager_email, manager_name, tournaments(name, slug), divisions(id, name, display_name, gender)"
      )
      .in("tournament_id", tourIds)
      .neq("status", "withdrawn");
    if (listed.error) {
      console.error("register siblings list failed", listed.error);
      return Response.json({ error: "Could not load teams" }, { status: 500 });
    }
    live = listed.data ?? [];
  }

  const seen = new Set();
  const rows = [];
  for (const src of sources) {
    if (!seen.has(src.id)) {
      seen.add(src.id);
      rows.push(src);
    }
    for (const other of live) {
      if (seen.has(other.id)) continue;
      if (!isSiblingSeat(src, other)) continue;
      seen.add(other.id);
      rows.push(other);
    }
  }

  const origin = new URL(request.url).origin;
  return Response.json({
    ok: true,
    teams: rows.map((r) => pack(r, origin)),
  });
}
