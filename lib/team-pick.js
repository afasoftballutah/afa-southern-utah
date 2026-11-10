// Which team this device follows on a tournament's pages: a team NAME in a
// DIVISION, never a bare name (JD, 2026-11-09: "cant have both fallens get
// highlighted reuse the logic from the front"). Fallen in Men's D and Fallen
// in Men's E are two teams. This is the same identity the tournament page's
// Find my team uses (lib/team-search.js teamSearchKey: name + division).
//
// Storage stays where it was so every page keeps sharing one memory:
//   afa-team-<slug>           the team name (read by name-only pickers too)
//   afa-team-<slug>-division  its division id, when the picker knew it
// A name with no division is an older pick; resolveTeamPick sorts it out.

import { teamSearchKey } from "@/lib/team-search";

/** A picker option: { key, name, divisionId, divisionName }. */
export function teamOptions(teams, currentDivisionId = null) {
  const seen = new Set();
  const out = [];
  for (const t of teams ?? []) {
    const o =
      typeof t === "string"
        ? { name: t, divisionId: currentDivisionId, divisionName: null }
        : { name: t.name, divisionId: t.divisionId ?? currentDivisionId, divisionName: t.divisionName ?? null };
    if (!o.name) continue;
    // teamSearchKey is the identity; the key is the same pair in a form an
    // <option value> can carry (no NUL).
    const id = teamSearchKey(o);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ key: `${o.divisionId ?? ""}|${o.name}`, ...o });
  }
  return out;
}

/**
 * The option a remembered pick { name, divisionId? } stands for, or null.
 * With a division: that exact team. Without one (an older pick, or a
 * name-only picker): the only team by that name; if several share it, the
 * one in a division this device registered in (hintDivisionIds); otherwise
 * nothing, rather than lighting up a stranger's games.
 */
export function resolveTeamPick(pick, options, hintDivisionIds = []) {
  const name = String(pick?.name ?? "").trim();
  if (!name) return null;
  const same = (options ?? []).filter((o) => o.name === name);
  if (pick.divisionId) return same.find((o) => o.divisionId === pick.divisionId) ?? null;
  if (same.length === 1) return same[0];
  const hinted = same.filter((o) => o.divisionId && hintDivisionIds.includes(o.divisionId));
  return hinted.length === 1 ? hinted[0] : null;
}

/**
 * Picker options grouped by division for a <select>, in the timeline legend's
 * order (Men's, Women's, Coed; then by name). One group when every option is
 * in one division or none say which.
 */
export function groupTeamOptions(options) {
  const named = (options ?? []).some((o) => o.divisionName);
  const divisions = new Set((options ?? []).map((o) => o.divisionName ?? ""));
  if (!named || divisions.size < 2) {
    return [{ label: null, options: [...(options ?? [])].sort((a, b) => a.name.localeCompare(b.name)) }];
  }
  const rank = (n) => (/women/i.test(n) ? 1 : /\bmen/i.test(n) ? 0 : /coed/i.test(n) ? 2 : 3);
  const groups = new Map();
  for (const o of options) {
    const label = o.divisionName ?? "Other";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(o);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([label, opts]) => ({ label, options: opts.sort((a, b) => a.name.localeCompare(b.name)) }));
}

const divisionKey = (storageKey) => `${storageKey}-division`;

/** The remembered pick under `afa-team-<slug>`: { name, divisionId } or null. */
export function readStoredPick(storageKey) {
  if (typeof window === "undefined") return null;
  try {
    const name = window.localStorage.getItem(storageKey);
    if (!name) return null;
    return { name, divisionId: window.localStorage.getItem(divisionKey(storageKey)) || null };
  } catch {
    return null;
  }
}

/** Remember { name, divisionId? } (or forget with null). A name-only pick clears the division. */
export function writeStoredPick(storageKey, pick) {
  if (typeof window === "undefined") return;
  try {
    if (!pick?.name) {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(divisionKey(storageKey));
      return;
    }
    window.localStorage.setItem(storageKey, pick.name);
    if (pick.divisionId) window.localStorage.setItem(divisionKey(storageKey), pick.divisionId);
    else window.localStorage.removeItem(divisionKey(storageKey));
  } catch {
    // private browsing — the pick still works for this visit
  }
}
