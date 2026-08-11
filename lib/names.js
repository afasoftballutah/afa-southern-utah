// Sorting people the way a roster sheet does: by last name.
//
// JD, 2026-07-27: "Ideally, alphabetized by last name."
//
// This is display and sort only. The stored name is never rewritten — a
// person's name is what they wrote down, and guessing wrong about which word
// is the surname must not change what the waiver says.

import { composeDisplayName } from "@/lib/person-name";

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

/**
 * Split a written name into the part to sort on and the rest.
 *
 * Deliberately simple, because the failure mode of clever is bad: a
 * two-word name puts the last word last, a suffix is skipped over, and
 * anything with one word sorts on itself. A name like "Maria de la Cruz"
 * will sort under C, which is wrong for some people and right for others —
 * when someone complains, the fix is a stored sort_name column, not more
 * regex.
 */
export function splitName(full) {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", suffix: "" };
  if (parts.length === 1) return { first: "", last: parts[0], suffix: "" };

  let suffix = "";
  let end = parts.length - 1;
  if (SUFFIXES.has(parts[end].toLowerCase())) {
    suffix = parts[end];
    end -= 1;
  }
  if (end <= 0) return { first: "", last: parts[0], suffix };

  return {
    first: parts.slice(0, end).join(" "),
    last: parts[end],
    suffix,
  };
}

/** "Kaydee Anderson" -> "Anderson, Kaydee". "Cher" -> "Cher". */
export function lastNameFirst(full) {
  const { first, last, suffix } = splitName(full);
  if (!last) return String(full ?? "");
  const tail = suffix ? ` ${suffix}` : "";
  return first ? `${last}, ${first}${tail}` : `${last}${tail}`;
}

/**
 * Directory label: "Anderson, Kay" (preferred+last) or "Anderson, Kaydee"
 * (first+last). Sort key is still last name first.
 */
export function directoryNameLabel({
  legalFirstName,
  legalLastName,
  preferredName,
  fullName,
} = {}) {
  const display = composeDisplayName({
    preferredName,
    legalFirstName,
    legalLastName,
    name: fullName,
  });
  if (!display || display === "—") {
    return lastNameFirst(fullName) || "—";
  }
  return lastNameFirst(display) || display;
}

/** Lowercased key so sorting is stable and case-blind. */
export function lastNameKey(full) {
  const { first, last } = splitName(full);
  return `${last} ${first}`.trim().toLowerCase();
}

/**
 * Age in whole years, in league time.
 *
 * Uses leagueToday rather than the server's clock: a request just after
 * midnight UTC is still yesterday in St George, and a birthday should not
 * arrive early because the server sits in a different timezone.
 */
export function ageFrom(birthDate, today) {
  if (!birthDate) return null;
  const b = String(birthDate).slice(0, 10);
  const t = String(today).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  let age = Number(t.slice(0, 4)) - Number(b.slice(0, 4));
  // Not had their birthday yet this year.
  if (t.slice(5) < b.slice(5)) age -= 1;
  return age >= 0 ? age : null;
}

/** "1985-01-20 [41]" — the shape a director reads on a roster sheet. */
export function bornWithAge(birthDate, today) {
  if (!birthDate) return "—";
  const age = ageFrom(birthDate, today);
  const b = String(birthDate).slice(0, 10);
  return age == null ? b : `${b} [${age}]`;
}
