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
