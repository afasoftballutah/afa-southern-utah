import { getServiceClient } from "@/lib/supabase";
import { seatFromDivision } from "@/lib/division-layout";

// Manager recovery WITHOUT a password: look up registrations by the
// manager_email they used when they registered. Returns manage + roster
// links only for exact email matches (case-insensitive).
//
// Still no outbound email/SMS — they type the email they already know.
// Rate-limited per IP so this cannot be used as a bulk scrape of teams.

export const runtime = "nodejs";

/** @type {Map<string, { count: number, windowStart: number }>} */
const hits = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 12;

function clientIp(request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_PER_WINDOW;
}

function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    // strip control chars / wildcards that could widen ilike
    .replace(/[%_]/g, "")
    .slice(0, 200);
}

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
      { error: "Enter the email you used when you registered." },
      { status: 400 }
    );
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many tries. Wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const supabase = getServiceClient();
  // Case-insensitive exact match (no wildcards in email after normalize)
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, team_name, status, manage_token, roster_token, manager_email, submitted_at, tournaments(name, slug, start_date), divisions(name, display_name, gender)"
    )
    .ilike("manager_email", email)
    .order("submitted_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("register lookup failed", error);
    return Response.json({ error: "Lookup failed. Try again." }, { status: 500 });
  }

  // Defense in depth: require normalized equality even if ilike matched oddly
  const rows = (data || []).filter(
    (r) => String(r.manager_email || "").trim().toLowerCase() === email
  );

  const origin = new URL(request.url).origin;
  const teams = rows.map((r) => {
    const seat = seatFromDivision(r.divisions);
    return {
      teamName: r.team_name,
      status: r.status,
      tournamentName: r.tournaments?.name || "",
      tournamentSlug: r.tournaments?.slug || "",
      submittedAt: r.submitted_at,
      manageToken: r.manage_token,
      rosterToken: r.roster_token,
      manageLink: `${origin}/register/manage/${r.manage_token}`,
      rosterLink: r.roster_token
        ? `${origin}/register/roster/${r.roster_token}`
        : null,
      genderKey: seat?.genderKey || "",
      genderLabel: seat?.genderLabel || "",
      levelLabel: seat?.levelLabel || "",
      seatLabel: seat?.seatLabel || "",
    };
  });

  // Same shape whether 0 or many — no "email exists" oracle beyond list length
  return Response.json({ ok: true, email, teams });
}
