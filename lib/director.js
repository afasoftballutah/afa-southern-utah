import { getServiceClient } from "@/lib/supabase";
import { composeDisplayName } from "@/lib/person-name";
import {
  buildTournamentSignedSet,
  isSignedForTournament,
  tournamentPersonKey,
} from "@/lib/tournament-waiver";
import { isMissingAuditSchema } from "@/lib/sign-audit";

const ROSTER_MEMBER_COLS =
  "id, player_id, registration_id, name, role, signed_at, signed_ip, signed_place, signed_via, removed_at, email, phone, address, legal_first_name, legal_last_name, preferred_name, gender, birth_date, signing_token";
const ROSTER_MEMBER_COLS_LEGACY =
  "id, player_id, registration_id, name, role, signed_at, removed_at, email, phone, address, legal_first_name, legal_last_name, preferred_name, gender, birth_date, signing_token";

async function loadRosterMembers(supabase) {
  const first = await supabase.from("roster_members").select(ROSTER_MEMBER_COLS);
  if (!first.error) return first.data ?? [];
  if (!isMissingAuditSchema(first.error)) {
    console.error("roster_members load failed", first.error);
    return [];
  }
  const legacy = await supabase
    .from("roster_members")
    .select(ROSTER_MEMBER_COLS_LEGACY);
  return legacy.data ?? [];
}

// Every read the control center does. Service-role only — these queries touch
// names, dates of birth, emails and phone numbers, and no public page may
// call them.
//
// The league is tens of teams and hundreds of people, so these load whole
// tables and join in memory. That is deliberate: it keeps every page one
// round trip and the filtering instant. If it ever outgrows that it needs
// paging, not a different shape.

/**
 * Everything the control center counts on its front page.
 *
 * “On file” and “waiver missing” match the Players list: directory people
 * PLUS active roster names managers entered that are not linked yet
 * (unconfirmed — no player_id).
 *
 * Waiver missing is tournament-scoped: one signature covers all of a
 * person's seats in that event.
 */
export async function getDirectorCounts() {
  const supabase = getServiceClient();
  const [players, teams, registrations, tournaments, members, regTours] =
    await Promise.all([
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .is("merged_into_id", null),
      supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .is("merged_into_id", null),
      supabase.from("registrations").select("id, status"),
      supabase
        .from("tournaments")
        .select("id, start_date, end_date, registration_closes, is_placeholder"),
      supabase
        .from("roster_members")
        .select(
          "id, player_id, signed_at, removed_at, registration_id, birth_date, legal_first_name, legal_last_name, name"
        )
        .is("removed_at", null),
      supabase.from("registrations").select("id, tournament_id"),
    ]);

  const regs = registrations.data ?? [];
  const active = members.data ?? [];
  const regBy = new Map((regTours.data ?? []).map((r) => [r.id, r]));
  const signedSet = buildTournamentSignedSet(active, regBy);

  // People still needing a signature for at least one tournament seat.
  // Key = person identity; if they have any active seat not covered by a
  // tournament signature, they count once.
  const needsSig = new Set();
  for (const m of active) {
    if (isSignedForTournament(m, regBy, signedSet)) continue;
    const key =
      tournamentPersonKey(m) ||
      (m.player_id ? `p:${m.player_id}` : null) ||
      `m:${m.id}`;
    needsSig.add(key);
  }

  const confirmed = players.count ?? 0;
  const provisional = active.filter((m) => !m.player_id).length;

  return {
    players: confirmed + provisional,
    teams: teams.count ?? 0,
    registrations: regs.filter((r) => r.status !== "withdrawn").length,
    outstandingSignatures: needsSig.size,
    tournaments: (tournaments.data ?? []).filter((t) => !t.is_placeholder)
      .length,
    tournamentRows: tournaments.data ?? [],
  };
}

/** Every person, with the teams and tournaments they have played for. */
export async function listPeople() {
  const supabase = getServiceClient();
  const [
    { data: players },
    { data: members },
    { data: registrations },
    { data: tournaments },
    { data: divisions },
    { data: classes },
  ] = await Promise.all([
    supabase.from("players").select("*").order("full_name"),
    loadRosterMembers(supabase).then((data) => ({ data })),
    supabase
      .from("registrations")
      .select("id, team_name, tournament_id, division_id, class, manager_member_id, manager_name, manager_email, manager_phone"),
    supabase.from("tournaments").select("id, name, start_date"),
    supabase
      .from("divisions")
      .select("id, name, display_name, gender, class_id"),
    supabase.from("classes").select("id, name"),
  ]);

  const regBy = new Map((registrations ?? []).map((r) => [r.id, r]));
  const tourBy = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const divBy = new Map((divisions ?? []).map((d) => [d.id, d]));
  const classBy = new Map((classes ?? []).map((c) => [c.id, c.name]));
  // One signature covers every seat for that person in the same tournament.
  const signedTourSet = buildTournamentSignedSet(members ?? [], regBy);

  /** Division gender as W / M / Coed for the appearances list. */
  function divisionGenderShort(g) {
    if (g === "womens") return "W";
    if (g === "mens") return "M";
    if (g === "coed") return "Coed";
    return "—";
  }

  function appearanceFrom(m) {
    const reg = regBy.get(m.registration_id);
    const div = divBy.get(reg?.division_id);
    const tour = tourBy.get(reg?.tournament_id);
    const divisionLabel = div?.display_name ?? div?.name ?? null;
    const signed =
      Boolean(m.signed_at) ||
      isSignedForTournament(m, regBy, signedTourSet);
    return {
      memberId: m.id,
      registrationId: m.registration_id,
      teamName: reg?.team_name ?? "—",
      tournamentId: reg?.tournament_id ?? null,
      // Director can open / copy this for the player to sign (one per seat;
      // one signature covers the whole tournament for that person).
      signingToken: m.signing_token || null,
      signPath: m.signing_token
        ? `/register/sign/${m.signing_token}`
        : null,
      // Class matters as much as the name. JD, 2026-07-27: "Fallen D is
      // different than Fallen E. Very important." The registration carries
      // what the manager entered; the division carries what the league ran,
      // and the division wins when both exist.
      className:
        (div?.class_id ? classBy.get(div.class_id) : null) ??
        reg?.class ??
        null,
      gender: div?.gender ?? null,
      genderShort: divisionGenderShort(div?.gender),
      divisionLabel,
      tournamentName: tour?.name ?? "—",
      startDate: tour?.start_date ?? null,
      role: reg?.manager_member_id === m.id ? "manager" : m.role,
      signed,
      signedAt: m.signed_at ?? null,
      signedPlace: m.signed_place ?? null,
      signedVia: m.signed_via ?? null,
      signedIp: m.signed_ip ?? null,
      removed: Boolean(m.removed_at),
      email: m.email,
      phone: m.phone,
      address: m.address ? String(m.address).trim() : null,
      // Most players give no contact details — only coaches and the manager
      // do. For a director chasing a waiver the manager IS who you call, so
      // carry theirs as a labelled fallback rather than showing nothing.
      managerName: reg?.manager_name ?? null,
      managerEmail: reg?.manager_email ?? null,
      managerPhone: reg?.manager_phone ?? null,
    };
  }

  const byPlayer = new Map();
  for (const m of members ?? []) {
    if (!m.player_id) continue;
    if (!byPlayer.has(m.player_id)) byPlayer.set(m.player_id, []);
    byPlayer.get(m.player_id).push(appearanceFrom(m));
  }

  // Roster names managers entered that are not linked to a directory person
  // yet (no birth-date match / not confirmed). Still show on Players.
  const provisional = (members ?? [])
    .filter((m) => !m.player_id && !m.removed_at)
    .map((m) => {
      const appearance = appearanceFrom(m);
      const fullName =
        composeDisplayName({
          preferredName: m.preferred_name,
          legalFirstName: m.legal_first_name,
          legalLastName: m.legal_last_name,
          name: m.name,
        }) ||
        String(m.name || "").trim() ||
        "—";
      return {
        // Synthetic id — not a players row. Page gates edit/merge/delete.
        id: `roster:${m.id}`,
        provisional: true,
        roster_member_id: m.id,
        full_name: fullName,
        legal_first_name: m.legal_first_name || null,
        legal_last_name: m.legal_last_name || null,
        preferred_name: m.preferred_name || null,
        birth_date: m.birth_date || null,
        gender: m.gender || null,
        rating: null,
        // Only this person's email — never the manager/coach as a default.
        email: m.email ? String(m.email).trim() || null : null,
        address: appearance.address || null,
        appearances: [appearance],
      };
    });

  // Compact unmatched list kept for any older callers.
  const unmatched = provisional.map((p) => ({
    memberId: p.roster_member_id,
    name: p.full_name,
    teamName: p.appearances[0]?.teamName ?? "—",
    tournamentName: p.appearances[0]?.tournamentName ?? "—",
  }));

  const confirmed = (players ?? [])
    .filter((p) => !p.merged_into_id)
    .map((p) => {
      const appearances = (byPlayer.get(p.id) ?? []).slice().sort((a, b) => {
        // Newest tournament first in the expand list.
        const ad = a.startDate || "";
        const bd = b.startDate || "";
        if (ad !== bd) return bd.localeCompare(ad);
        return String(a.tournamentName).localeCompare(String(b.tournamentName));
      });
      // Directory address: prefer a field on the player row when present;
      // otherwise the newest roster line that carried one.
      const rosterAddress =
        appearances.find((a) => a.address)?.address ?? null;
      const email =
        p.email || appearances.find((a) => a.email)?.email || null;
      return {
        ...p,
        provisional: false,
        // A person has a RATING (A/B/C/D/E or unranked). A team has a CLASS.
        // Different ladders — see lib/class.js. Directors often say "class"
        // for the letter on the person; the list column is labeled Class.
        rating: p.rating ?? null,
        // A PERSON's gender (M/F). Not divisions.gender (mens/womens/coed),
        // which describes a team. JD, 2026-07-27.
        gender: p.gender ?? null,
        email,
        address: p.address || rosterAddress || null,
        appearances,
      };
    });

  return {
    classes: classes ?? [],
    // Directory people + manager-entered names not confirmed yet.
    players: [...confirmed, ...provisional],
    unmatched,
  };
}

/** One person, everything about them. */
export async function getPerson(id) {
  const { players } = await listPeople();
  return players.find((p) => p.id === id) ?? null;
}

/** Format cents as $375 (no decimals). Null stays null. */
export function moneyCents(cents) {
  if (cents == null || Number.isNaN(cents)) return null;
  return `$${Math.round(cents / 100)}`;
}

/**
 * What a registration is due / has paid / still owes, from the tournament fee.
 *
 * - Due = tournaments.entry_fee_cents (null when no fee on file).
 * - Paid = amount_paid_cents when set; if only paid_at is set, assume full due.
 * - Balance = max(0, due − paid). Null when fee is unknown.
 * - External = registration_url set (money may never hit this app).
 *
 * Nothing here processes payments — paid_at / amount_paid_cents are
 * director-entered records of off-site money.
 */
export function registrationMoney(reg, tournament) {
  const dueCents =
    tournament?.entry_fee_cents != null ? Number(tournament.entry_fee_cents) : null;
  const external = Boolean(String(tournament?.registration_url ?? "").trim());
  let paidCents = 0;
  if (reg?.amount_paid_cents != null) {
    paidCents = Number(reg.amount_paid_cents);
  } else if (reg?.paid_at && dueCents != null) {
    paidCents = dueCents;
  }
  const balanceCents =
    dueCents == null ? null : Math.max(0, dueCents - paidCents);
  const fullyPaid =
    balanceCents === 0 ||
    (dueCents == null && Boolean(reg?.paid_at));
  return {
    dueCents,
    paidCents,
    balanceCents,
    external,
    fullyPaid,
    hasFee: dueCents != null,
  };
}

/** Roll up live (non-withdrawn) registrations for a team list row. */
export function teamMoneySummary(registrations) {
  const live = (registrations ?? []).filter((r) => r.status !== "withdrawn");
  let dueTotal = 0;
  let paidTotal = 0;
  let balanceTotal = 0;
  let knownFee = 0;
  let unknownUnpaid = 0;
  for (const r of live) {
    if (r.dueCents != null) {
      knownFee += 1;
      dueTotal += r.dueCents;
      paidTotal += r.paidCents ?? 0;
      balanceTotal += r.balanceCents ?? 0;
    } else if (!r.fullyPaid) {
      unknownUnpaid += 1;
    }
  }
  return {
    liveCount: live.length,
    dueTotal: knownFee > 0 ? dueTotal : null,
    paidTotal: knownFee > 0 ? paidTotal : null,
    balanceTotal: knownFee > 0 ? balanceTotal : null,
    unknownUnpaid,
    hasUnpaid: balanceTotal > 0 || unknownUnpaid > 0,
    fullyPaid: live.length > 0 && balanceTotal === 0 && unknownUnpaid === 0,
  };
}

/** Every team, with the tournaments they entered. */
export async function listTeams() {
  const supabase = getServiceClient();
  const [
    { data: teams },
    { data: registrations },
    { data: tournaments },
    { data: classes },
    { data: divisions },
  ] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase
      .from("registrations")
      .select(
        "id, team_id, team_name, tournament_id, division_id, class, status, paid_at, amount_paid_cents, manager_name, manager_email, manager_phone"
      ),
    supabase
      .from("tournaments")
      .select("id, name, start_date, entry_fee_cents, registration_url"),
    supabase.from("classes").select("id, name"),
    supabase
      .from("divisions")
      .select("id, name, display_name, gender, class_id"),
  ]);

  const tourBy = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const classBy = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const divBy = new Map((divisions ?? []).map((d) => [d.id, d]));

  const byTeam = new Map();
  for (const r of registrations ?? []) {
    if (!r.team_id) continue;
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
    const tour = tourBy.get(r.tournament_id);
    const div = divBy.get(r.division_id);
    const money = registrationMoney(r, tour);
    const divisionLabel = div?.display_name ?? div?.name ?? null;
    const divisionClass =
      (div?.class_id ? classBy.get(div.class_id) : null) ?? r.class ?? null;
    // One clean scope token ("Coed D", "Men's Open") — never "Coed D · Coed D".
    const scope = registrationScope(div, divisionClass ?? r.class);
    const teamTitle = r.team_name || "—";
    const paid = Boolean(r.paid_at);
    byTeam.get(r.team_id).push({
      registrationId: r.id,
      tournamentId: r.tournament_id,
      tournamentName: tour?.name ?? "—",
      startDate: tour?.start_date ?? null,
      status: r.status,
      paid,
      amountPaidCents: r.amount_paid_cents ?? null,
      managerName: r.manager_name,
      managerEmail: r.manager_email,
      managerPhone: r.manager_phone,
      className: r.class ?? divisionClass ?? null,
      divisionId: r.division_id ?? null,
      divisionLabel,
      gender: div?.gender ?? null,
      // Switch-team list: grouped by division; each option is team + manager + pay.
      switchGroup: scope || "Unassigned division",
      switchLabel: [
        teamTitle,
        r.manager_name ? `mgr ${r.manager_name}` : null,
        paid ? "paid" : "unpaid",
      ]
        .filter(Boolean)
        .join(" · "),
      // Flat one-liner when a picker has no optgroups.
      switchLabelFlat: [teamTitle, scope || null, r.manager_name ? `mgr ${r.manager_name}` : null, paid ? "paid" : "unpaid"]
        .filter(Boolean)
        .join(" · "),
      ...money,
    });
  }

  return (teams ?? [])
    .filter((t) => !t.merged_into_id)
    .map((t) => {
      const registrations = byTeam.get(t.id) ?? [];
      const money = teamMoneySummary(registrations);
      return {
        ...t,
        // Same fallback the player list uses, or the two screens disagree
        // about the same team: teams.class_id when the division carries one,
        // otherwise whatever the manager wrote on the registration. No
        // division on file has a class yet, so today it is always the latter.
        className:
          (t.class_id ? classBy.get(t.class_id) : null) ??
          registrations.find((r) => r.className)?.className ??
          null,
        registrations,
        money,
      };
    });
}

export async function getTeam(id) {
  const teams = await listTeams();
  return teams.find((t) => t.id === id) ?? null;
}

/** Gender as a director would say it, not as the column stores it. */
export function genderLabel(gender) {
  return { mens: "Men's", womens: "Women's", coed: "Coed" }[gender] ?? null;
}

/** Words that already imply gender when present in a division/class label. */
const GENDER_STEMS = {
  mens: ["men", "mens", "men's"],
  womens: ["women", "womens", "women's"],
  coed: ["coed", "co-ed"],
};

function labelImpliesGender(label, gender) {
  const s = String(label ?? "").toLowerCase();
  if (!s) return false;
  const stems = GENDER_STEMS[gender] ?? [];
  return stems.some((w) => s.includes(w));
}

/**
 * "Coed · D" — the scope line used everywhere a team is named.
 *
 * Deduplicated: a division named "Coed" already says gender ("Coed · Coed"
 * is wrong), and "Coed D" already says both gender and class ("Coed · Coed D"
 * is also wrong).
 */
export function scopeLabel(gender, className) {
  const g = genderLabel(gender);
  const c = String(className ?? "").trim() || null;
  if (!c) return g ?? "";
  if (!g) return c;
  if (g.toLowerCase() === c.toLowerCase()) return g;
  // Division already carries gender (e.g. "Coed D", "Men's Open")
  if (labelImpliesGender(c, gender)) return c;
  return `${g} · ${c}`;
}

/** True when `cls` is already a whole token of the division label (not a substring — "D" is in "Coed"). */
function divisionIncludesClass(div, cls) {
  const d = String(div ?? "").toLowerCase().trim();
  const c = String(cls ?? "").toLowerCase().trim();
  if (!d || !c) return false;
  if (d === c) return true;
  return d.split(/[\s/·.\-]+/).filter(Boolean).includes(c);
}

/**
 * Subtitle for a registration: tournament context without stacking
 * "Coed · Coed D · D". Prefer the division display name; only append the
 * class ladder letter when it is not already a token in that name.
 */
export function registrationScope(division, enteredClassName) {
  const div = String(division?.display_name ?? division?.name ?? "").trim();
  const cls = String(enteredClassName ?? "").trim();
  const gender = division?.gender ?? null;

  if (div) {
    if (!cls) return div;
    // "Coed D" already has class token D — do not append again
    if (divisionIncludesClass(div, cls)) return div;
    return `${div} · ${cls}`;
  }
  return scopeLabel(gender, cls || null);
}

/**
 * How each team finished at each tournament: "2nd (4-2)".
 *
 * Keyed `tournamentId|normalized team name`, because that is what a roster
 * entry can be matched on — a registration knows its team by NAME, and games
 * carry names too.
 *
 * Loads every game once for the whole page rather than per row. The league is
 * one tournament of games today; when that stops being true this needs a
 * narrower query, not a different shape.
 */
export async function resultsByTeamAndTournament() {
  const supabase = getServiceClient();
  const [{ data: divisions }, { data: bracket }, { data: pool }, { data: status }] =
    await Promise.all([
      supabase.from("divisions").select("id, tournament_id"),
      supabase
        .from("games")
        .select("division_id, team1_name, team2_name, team1_score, team2_score, status, is_bye"),
      supabase
        .from("pool_games")
        .select("division_id, team1_name, team2_name, team1_score, team2_score, status"),
      supabase.from("team_status").select("tournament_id, team_name, state, placement"),
    ]);

  const tournamentOf = new Map((divisions ?? []).map((d) => [d.id, d.tournament_id]));
  const norm = (n) => String(n ?? "").replace(/\u2019/g, "'").trim().replace(/\s+/g, " ").toLowerCase();
  const out = new Map();

  const tally = (rows, isBracket) => {
    for (const g of rows ?? []) {
      if (g.status !== "final") continue;
      if (isBracket && g.is_bye) continue;
      const tid = tournamentOf.get(g.division_id);
      if (!tid) continue;
      for (const side of [1, 2]) {
        const name = side === 1 ? g.team1_name : g.team2_name;
        if (!name) continue;
        const mine = side === 1 ? g.team1_score : g.team2_score;
        const theirs = side === 1 ? g.team2_score : g.team1_score;
        if (mine == null || theirs == null) continue;
        const key = `${tid}|${norm(name)}`;
        if (!out.has(key)) out.set(key, { w: 0, l: 0, placement: null });
        const rec = out.get(key);
        if (mine > theirs) rec.w += 1;
        else if (mine < theirs) rec.l += 1;
      }
    }
  };
  tally(bracket, true);
  tally(pool, false);

  for (const s of status ?? []) {
    const key = `${s.tournament_id}|${norm(s.team_name)}`;
    if (!out.has(key)) out.set(key, { w: 0, l: 0, placement: null });
    out.get(key).placement = s.state === "champion" ? "1st" : (s.placement ?? null);
  }

  return {
    get(tournamentId, teamName) {
      return out.get(`${tournamentId}|${norm(teamName)}`) ?? null;
    },
  };
}

/** "2nd (4-2)", "(4-2)", or "—". */
export function formatResult(result) {
  if (!result) return "—";
  const record = result.w + result.l > 0 ? `(${result.w}-${result.l})` : "";
  return [result.placement, record].filter(Boolean).join(" ") || "—";
}

/**
 * How a director says a venue: "Canyons", "St. George, UT".
 *
 * JD, 2026-07-28: "what happened to my 'Canyons St. George, UT' idea?" — it
 * never got built; I only stripped the leading "The".
 *
 * The locality is in one of two places depending on who typed the row:
 * venue_address for some, and after the first comma of venue_name for the
 * rest ("Lakeside Park, Orem, UT"). Both are read here so neither has to be
 * cleaned up first.
 */
export function venueParts(venueName, venueAddress) {
  const raw = String(venueName ?? "").trim();
  if (!raw) return { name: "", locality: null };

  const comma = raw.indexOf(",");
  const head = comma === -1 ? raw : raw.slice(0, comma).trim();
  const tail = comma === -1 ? null : raw.slice(comma + 1).trim();

  const name = head
    .replace(/^the\s+/i, "")
    .replace(/\s+sports\s+complex$/i, "")
    .trim();

  return { name: name || head, locality: venueAddress?.trim() || tail || null };
}

/** The one line a director reads: "Canyons" or "Canyons · St. George, UT". */
export function venueLabel(venueName, venueAddress) {
  const { name, locality } = venueParts(venueName, venueAddress);
  return [name, locality].filter(Boolean).join(" · ");
}

/**
 * Back from that line to the stored name. The short form is a reading of the
 * venue, not a rename of it — pick "Canyons" and the row still stores "The
 * Canyons Sports Complex", so saving a row you did not mean to edit cannot
 * quietly rewrite it.
 *
 * Anything that matches nothing is a new venue and is stored as typed. That is
 * the point: a fixed dropdown cannot take a field the league just started
 * using, and a bare text box grows a second spelling of one it already has.
 */
export function resolveVenue(typed, venues = []) {
  const t = String(typed ?? "").trim();
  if (!t) return null;
  const key = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const hit = venues.find((v) => key(v) === key(t) || key(venueLabel(v, null)) === key(t));
  return hit ?? t;
}
