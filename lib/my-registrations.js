// Manager registrations remembered on this device (localStorage only).
//
// After a manager registers (or opens their manage link, or recovers via
// email lookup), we keep the PRIVATE manage token here so the next visit
// to /register can offer "My teams" without a password.
//
// This is not a login. Clearing site data clears it. Another phone will
// not have it until they register again, open a manage link, or look up
// by email.

const KEY = "afa-my-registrations";

/**
 * @typedef {{
 *   teamName: string,
 *   tournamentName?: string,
 *   tournamentSlug?: string,
 *   manageToken: string,
 *   rosterToken?: string,
 *   manageLink?: string,
 *   rosterLink?: string,
 *   managerEmail?: string,
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
      (r.teamName === entry.teamName &&
        r.tournamentName &&
        r.tournamentName === entry.tournamentName)
  );

  const next = {
    teamName: entry.teamName,
    tournamentName: entry.tournamentName || "",
    tournamentSlug: entry.tournamentSlug || "",
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
  writeAll(readMyRegistrations().filter((r) => r.manageToken !== manageToken));
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
