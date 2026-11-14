// "Already registered? Find my teams" — which registrations an email owns.
//
// The email is stored on the registration the manager filled in. Entries a
// director loaded from a sheet (the AFA World Series, for one) carry no
// manager email, but are attached to the same club's `teams` row (the
// same row the club's team page is built from). Once one registration
// matches the email exactly, every other entry on that SAME team row is
// the same club's, so it comes back too (JD, 2026-11-10: "Why aren't these
// linked to the WS teams too").
//
// Only the team row links them. Never the name alone: two "Fallen" with
// different managers are different clubs, and a placeholder ("Tbd") team
// row is not a club identity, so it never pulls in anything.

import crypto from "node:crypto";
import { isPlaceholderManager } from "./register-key";

/**
 * Team rows the matched registrations prove the email owns.
 * @param {Array<{ team_id?: string|null }>} matched  registrations whose manager_email equals the email
 * @param {Array<{ id: string, merged_into_id?: string|null, manager_name?: string|null }>} teams  those teams rows
 * @returns {string[]} root team ids (merged rows resolve to the row they merged into)
 */
export function ownedTeamIds(matched, teams) {
  const byId = new Map((teams ?? []).map((t) => [t.id, t]));
  const out = new Set();
  for (const r of matched ?? []) {
    const t = r?.team_id ? byId.get(r.team_id) : null;
    if (!t) continue;
    if (isPlaceholderManager(t.manager_name)) continue;
    out.add(t.merged_into_id ?? t.id);
  }
  return [...out];
}

/**
 * Direct email matches first, then the club's other entries, each once.
 * @param {Array<{ id: string }>} direct
 * @param {Array<{ id: string }>} linked
 */
export function withLinkedEntries(direct, linked) {
  const seen = new Set((direct ?? []).map((r) => r.id));
  const extra = [];
  for (const r of linked ?? []) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    extra.push(r);
  }
  const when = (r) => String(r.submitted_at ?? "");
  return [...(direct ?? []), ...extra.sort((a, b) => when(b).localeCompare(when(a)))];
}

/** Normalize an address for exact match: trim, lower-case, strip ilike wildcards. */
export function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[%_]/g, "")
    .slice(0, 200);
}

/**
 * Compare two strings in constant time (SHA-256 then timingSafeEqual).
 * Used for emails (and any token compared in JS) so length or prefix
 * does not leak through early return.
 */
export function timingSafeEqualString(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** True when a stored manager_email matches the lookup query. */
export function emailsMatch(stored, query) {
  return timingSafeEqualString(normalizeEmail(stored), normalizeEmail(query));
}

/**
 * Shape returned to the manager after an exact email match, including
 * manage/roster credentials. Never use this for a name search.
 * `seat` is the public division seat mark (gender/level), not a credential.
 */
export function recoveryTeamPayload(row, origin, seat = null) {
  return {
    teamName: row.team_name,
    status: row.status,
    tournamentName: row.tournaments?.name || "",
    tournamentSlug: row.tournaments?.slug || "",
    submittedAt: row.submitted_at,
    manageToken: row.manage_token,
    rosterToken: row.roster_token,
    divisionId: row.divisions?.id || "",
    manageLink: `${origin}/register/manage/${row.manage_token}`,
    rosterLink: row.roster_token
      ? `${origin}/register/roster/${row.roster_token}`
      : null,
    genderKey: seat?.genderKey || "",
    genderLabel: seat?.genderLabel || "",
    levelLabel: seat?.levelLabel || "",
    seatLabel: seat?.seatLabel || "",
    managerName: row.manager_name || "",
  };
}
