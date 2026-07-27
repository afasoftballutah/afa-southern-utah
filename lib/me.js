// Who this device belongs to.
//
// JD, 2026-07-27: "you had a thing that remembered the team, can we instead
// have it remember a player when the app is loaded?"
//
// The team picker already remembered a choice, but per TOURNAMENT
// (`afa-team-{slug}`), so the same person re-picked the same team every event.
// This is one memory that outlives a tournament.
//
// WHY IT IS STORED, NOT LOOKED UP. players and roster_members have no public
// read grant — service_role only, because they hold real names and dates of
// birth. A public page therefore cannot resolve a person, and must not be
// able to. So identity is whatever this device already learned, held on the
// device, and never sent anywhere:
//
//   picking a team    -> we know the team
//   signing a waiver  -> we know the person AND the team
//
// The value is stored under one key, so nothing here is a tracking identifier
// and clearing site data clears it completely. There is no cookie, no request,
// and no server ever sees it.

const KEY = "afa-me";

/** @typedef {{name?: string, teamName: string, source: "picked"|"signed"}} Me */

/** @returns {Me|null} */
export function readMe() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.teamName ? parsed : null;
  } catch {
    // Bad JSON from an older shape, or storage blocked in private browsing.
    // Forgetting is the safe failure here — never throw on a read.
    return null;
  }
}

/**
 * @param {Me|null} me  null forgets this device
 * A "signed" identity outranks a "picked" one and is not overwritten by a
 * later pick: knowing the person is strictly better than knowing the team,
 * and a stray tap on a picker should not throw that away. Picking a
 * DIFFERENT team is a real change of mind and does replace it.
 */
export function writeMe(me) {
  if (typeof window === "undefined") return;
  try {
    if (!me?.teamName) {
      window.localStorage.removeItem(KEY);
      return;
    }
    const current = readMe();
    if (
      current?.source === "signed" &&
      me.source === "picked" &&
      current.teamName === me.teamName
    ) {
      return;
    }
    window.localStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // Quota or private browsing — the picker still works for this session.
  }
}

/** True when the remembered team is one of the teams in this list. */
export function meIsIn(me, teams) {
  if (!me?.teamName || !Array.isArray(teams)) return false;
  return teams.includes(me.teamName);
}
