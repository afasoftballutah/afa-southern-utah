/**
 * Director seed order helpers (no-pool path and generate input).
 * Seed #1 is first in the array.
 */

/** Director seed ref label, e.g. Seed #3 */
export function directorSeedRef(rank1Based) {
  return `Seed #${rank1Based}`;
}

/** Parse "Seed #3" or "[Seed #3]" → 3, else null */
export function parseDirectorSeedRef(ref) {
  if (!ref) return null;
  const m = /^\[?Seed #(\d+)\]?$/i.exec(String(ref).trim());
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Normalize a proposed order against the live team list.
 * Keeps only names still registered; appends missing teams at the end.
 * @returns {string[]} full permutation of teamNames
 */
export function normalizeSeedOrder(teamNames, proposed) {
  const live = (teamNames ?? []).map((n) => String(n).trim()).filter(Boolean);
  const liveSet = new Set(live);
  const seen = new Set();
  const ordered = [];
  for (const name of proposed ?? []) {
    const n = String(name).trim();
    if (!n || !liveSet.has(n) || seen.has(n)) continue;
    ordered.push(n);
    seen.add(n);
  }
  for (const n of live) {
    if (!seen.has(n)) ordered.push(n);
  }
  return ordered;
}

/** True when every registered team appears exactly once. */
export function isCompleteSeedOrder(teamNames, seedOrder) {
  const live = (teamNames ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (live.length < 2) return false;
  const order = (seedOrder ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (order.length !== live.length) return false;
  const set = new Set(order);
  if (set.size !== live.length) return false;
  return live.every((n) => set.has(n));
}

/**
 * Map Seed #k → team name from ordered list.
 * @returns {Record<string, string>}
 */
export function directorSeedMap(seedOrder) {
  const map = {};
  (seedOrder ?? []).forEach((name, i) => {
    map[directorSeedRef(i + 1)] = name;
  });
  return map;
}
