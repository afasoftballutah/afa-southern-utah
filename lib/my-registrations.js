// Manager registrations remembered on this device (localStorage only).
//
// After a manager registers (or opens their manage link, or recovers via
// email lookup), we keep the PRIVATE manage token here so the next visit
// to /register can offer "My teams" without a password.
//
// This is not a login. Clearing site data clears it. Another phone will
// not have it until they register again, open a manage link, or look up
// by email.

import { readMe, writeMe } from "./me";
import { sameRegistrationName, sameRegistrationCombo } from "./register-key";

export {
  registrationNameKey,
  sameRegistrationName,
  sameRegistrationCombo,
} from "./register-key";

const KEY = "afa-my-registrations";

/**
 * @typedef {{
 *   teamName: string,
 *   tournamentName?: string,
 *   tournamentSlug?: string,
 *   divisionId?: string,
 *   manageToken: string,
 *   rosterToken?: string,
 *   manageLink?: string,
 *   rosterLink?: string,
 *   managerEmail?: string,
 *   managerName?: string,
 *   genderKey?: "womens"|"mens"|"coed"|string,
 *   genderLabel?: string,
 *   levelLabel?: string,
 *   seatLabel?: string,
 *   savedAt: string,
 * }} MyRegistration
 */

/** @returns {MyRegistration[]} */
export function readMyRegistrations() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r?.manageToken && r?.teamName);
  } catch {
    return [];
  }
}

/** @param {MyRegistration[]} list */
function writeAll(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // private browsing / quota — ignore
  }
}

/**
 * Upsert one registration by manageToken (or teamName+tournamentName).
 * @param {Partial<MyRegistration> & { manageToken: string, teamName: string }} entry
 */
export function rememberRegistration(entry) {
  if (typeof window === "undefined") return;
  if (!entry?.manageToken || !entry?.teamName) return;

  const list = readMyRegistrations();
  const idx = list.findIndex(
    (r) =>
      r.manageToken === entry.manageToken ||
      sameRegistrationCombo(r, entry)
  );

  const next = {
    teamName: entry.teamName,
    tournamentName: entry.tournamentName || "",
    tournamentSlug: entry.tournamentSlug || "",
    divisionId: entry.divisionId || list[idx]?.divisionId || "",
    manageToken: entry.manageToken,
    rosterToken: entry.rosterToken || "",
    manageLink:
      entry.manageLink ||
      `${window.location.origin}/register/manage/${entry.manageToken}`,
    rosterLink:
      entry.rosterLink ||
      (entry.rosterToken
        ? `${window.location.origin}/register/roster/${entry.rosterToken}`
        : ""),
    managerEmail: (entry.managerEmail || "").trim().toLowerCase(),
    managerName: entry.managerName || list[idx]?.managerName || "",
    genderKey: entry.genderKey || list[idx]?.genderKey || "",
    genderLabel: entry.genderLabel || list[idx]?.genderLabel || "",
    levelLabel: entry.levelLabel || list[idx]?.levelLabel || "",
    seatLabel: entry.seatLabel || list[idx]?.seatLabel || "",
    savedAt: new Date().toISOString(),
  };

  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.unshift(next);

  // Cap list — managers rarely need dozens
  writeAll(list.slice(0, 30));
}

/** @param {string} manageToken */
export function forgetRegistration(manageToken) {
  if (typeof window === "undefined") return;
  const gone = readMyRegistrations().find((r) => r.manageToken === manageToken);
  writeAll(readMyRegistrations().filter((r) => r.manageToken !== manageToken));
  if (gone?.teamName) syncMeAfterForget(gone.teamName);
}

/** Drop every remembered row for this club name so the phone can register another. */
export function forgetTeamOnDevice(teamName) {
  if (typeof window === "undefined") return;
  if (!teamName) return;
  writeAll(
    readMyRegistrations().filter((r) => !sameRegistrationName(r.teamName, teamName))
  );
  syncMeAfterForget(teamName);
}

function syncMeAfterForget(teamName) {
  const me = readMe();
  if (!me || !sameRegistrationName(me.teamName, teamName)) return;
  const left = readMyRegistrations();
  writeMe(left[0] ? { teamName: left[0].teamName, source: "picked" } : null);
}

/** Team this phone is locked to — remembered registrations first, then afa-me. */
export function deviceTeamName() {
  const mine = readMyRegistrations();
  if (mine[0]?.teamName) return mine[0].teamName;
  return readMe()?.teamName || "";
}

export function localRegistrationForCombo({
  tournamentSlug,
  divisionId,
  genderKey,
  levelLabel,
  teamName,
} = {}) {
  const name = teamName || deviceTeamName();
  if (!name) return null;
  return (
    readMyRegistrations().find((r) =>
      sameRegistrationCombo(r, {
        teamName: name,
        tournamentSlug,
        divisionId,
        genderKey,
        levelLabel,
      })
    ) ?? null
  );
}

/** Another saved row for this club — used to prefill manager/roster. */
export function localPrefillSource({ tournamentSlug, teamName } = {}) {
  const name = teamName || deviceTeamName();
  if (!name) return null;
  const list = readMyRegistrations().filter((r) =>
    sameRegistrationName(r.teamName, name)
  );
  if (list.length === 0) return null;
  return (
    list.find((r) => r.tournamentSlug && r.tournamentSlug === tournamentSlug) ||
    list[0]
  );
}

/** Parse tokens out of absolute or relative manage/roster URLs */
export function tokensFromLinks({ manageLink, rosterLink } = {}) {
  let manageToken = "";
  let rosterToken = "";
  if (manageLink) {
    const m = String(manageLink).match(/\/register\/manage\/([^/?#]+)/i);
    if (m) manageToken = decodeURIComponent(m[1]);
  }
  if (rosterLink) {
    const m = String(rosterLink).match(/\/register\/roster\/([^/?#]+)/i);
    if (m) rosterToken = decodeURIComponent(m[1]);
  }
  return { manageToken, rosterToken };
}
