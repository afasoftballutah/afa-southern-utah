/**
 * Site-wide preferred region (map picker on home).
 * Stored in localStorage + a cookie so client pages stay in sync.
 * null / "all" = no filter (show every region).
 */

import { REGION_LABEL, REGION_ORDER } from "@/lib/data";

export const REGION_PREF_KEY = "afa_region";
export const REGION_PREF_EVENT = "afa-region-change";

/** Valid stored values including "all". */
export function isValidRegionPref(value) {
  if (value == null || value === "" || value === "all") return true;
  return REGION_ORDER.includes(value);
}

export function regionPrefLabel(value) {
  if (!value || value === "all") return "All regions";
  return REGION_LABEL[value] ?? value;
}

/** Read preference in the browser (null = all). */
export function getRegionPref() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REGION_PREF_KEY);
    if (!raw || raw === "all") return null;
    return isValidRegionPref(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Persist preference. Pass null or "all" to clear the filter.
 * Dispatches REGION_PREF_EVENT so open tabs/components re-render.
 */
export function setRegionPref(region) {
  if (typeof window === "undefined") return;
  const next =
    !region || region === "all" || !isValidRegionPref(region) ? null : region;
  try {
    if (next) window.localStorage.setItem(REGION_PREF_KEY, next);
    else window.localStorage.removeItem(REGION_PREF_KEY);
  } catch {
    /* private mode */
  }
  // Cookie for any future SSR readers (1 year)
  try {
    const maxAge = 60 * 60 * 24 * 365;
    if (next) {
      document.cookie = `${REGION_PREF_KEY}=${encodeURIComponent(next)}; path=/; max-age=${maxAge}; samesite=lax`;
    } else {
      document.cookie = `${REGION_PREF_KEY}=; path=/; max-age=0; samesite=lax`;
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(REGION_PREF_EVENT, { detail: { region: next } })
  );
  // storage event only fires in *other* tabs; fire a synthetic one locally
  // via the custom event consumers.
}

/** useSyncExternalStore subscribe — localStorage + custom event. */
export function subscribeRegionPref(callback) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e) => {
    if (e.key === REGION_PREF_KEY || e.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(REGION_PREF_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(REGION_PREF_EVENT, callback);
  };
}

/** Snapshot for useSyncExternalStore — always a string so React detects clear. */
export function getRegionPrefSnapshot() {
  return getRegionPref() ?? "";
}

export function getRegionPrefServerSnapshot() {
  return "";
}

/**
 * Map hotspot definitions for the brand map art.
 * left/top are exact centers of the red stars in region-map-overlay.png
 * (measured from the PNG; percentages of the square image).
 * Idaho has a star but is not a live region yet.
 */
export const REGION_MAP_HOTSPOTS = [
  {
    id: "idaho",
    region: null,
    label: "Idaho",
    left: "39.88%",
    top: "30.28%",
    disabled: true,
    note: "Coming soon",
  },
  {
    id: "northern_utah",
    region: "northern_utah",
    label: "Northern Utah",
    left: "48.18%",
    top: "44.69%",
  },
  {
    id: "nevada",
    region: "nevada",
    label: "Nevada",
    left: "28.15%",
    top: "52.91%",
  },
  {
    id: "colorado",
    region: "colorado",
    label: "Colorado",
    left: "74.18%",
    top: "55.57%",
  },
  {
    id: "southern_utah",
    region: "southern_utah",
    label: "Southern Utah",
    left: "42.01%",
    top: "60.10%",
  },
  {
    id: "arizona",
    region: "arizona",
    label: "Arizona",
    left: "47.97%",
    top: "77.19%",
  },
];
