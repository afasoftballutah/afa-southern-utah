import { getServiceClient } from "@/lib/supabase";
import { seatFromDivision } from "@/lib/division-layout";
import {
  ownedTeamIds,
  withLinkedEntries,
  normalizeEmail,
  emailsMatch,
  recoveryTeamPayload,
} from "@/lib/register-lookup";
import { createIpRateLimiter, tooManyRequests } from "@/lib/ip-rate-limit";

// Manager recovery WITHOUT a password: look up registrations by the
// manager_email they used when they registered. Returns manage + roster
// links only for exact email matches (case-insensitive).
//
// Name / team search is not a credential — those names are already on
// the public tournament pages — so this route never looks up by name.
// The "Find my team" UI on a tournament page searches the public list
// in the browser and does not call this API.
//
// Still no outbound email/SMS — they type the email they already know.
// Rate-limited per IP so this cannot be used as a bulk scrape of teams.

export const runtime = "nodejs";

const REG_SELECT =
  "id, team_name, status, manage_token, roster_token, manager_email, manager_name, submitted_at, team_id, tournaments(name, slug, start_date), divisions(id, name, display_name, gender)";

const limiter = createIpRateLimiter(12, 15 * 60 * 1000);

function isEmailShape(email) {
  // Loose check — managers type real addresses; we only need a key match
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeEmail(body?.email);
  if (!email || !isEmailShape(email)) {
    return Response.json(
      { error: "Enter the manager email from registration." },
      { status: 400 }
    );
  }

  const hit = limiter.limited(request);
  if (hit.limited) {
    return tooManyRequests(hit.retryAfterSec);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(REG_SELECT)
    .ilike("manager_email", email)
    .order("submitted_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("register lookup failed", error);
    return Response.json({ error: "Lookup failed. Try again." }, { status: 500 });
  }
  let rows = (data || []).filter((r) => emailsMatch(r.manager_email, email));

  // The same club's other entries: a director-loaded tournament (Worlds)
  // has no manager email on its registration, but sits on the same team
  // row. Only that row links them (lib/register-lookup.js).
  const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))];
  if (teamIds.length) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, merged_into_id, manager_name")
      .in("id", teamIds);
    const owned = ownedTeamIds(rows, teams);
    if (owned.length) {
      // Rows merged into an owned team count as that team.
      const { data: merged } = await supabase
        .from("teams")
        .select("id")
        .in("merged_into_id", owned);
      const ids = [...new Set([...owned, ...(merged || []).map((t) => t.id)])];
      const { data: linked, error: linkErr } = await supabase
        .from("registrations")
        .select(REG_SELECT)
        .in("team_id", ids)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (linkErr) console.error("register lookup (linked) failed", linkErr);
      else rows = withLinkedEntries(rows, linked);
    }
  }

  const origin = new URL(request.url).origin;
  const teams = rows.map((r) =>
    recoveryTeamPayload(r, origin, seatFromDivision(r.divisions))
  );

  // Same shape whether 0 or many — no "email exists" oracle beyond list length
  return Response.json({ ok: true, email, teams });
}
