/**
 * Keys (do not change).
 *
 * Registration (this event): tournament + division + lower(trim(team_name))
 *   — Fallen Men's D and Fallen Coed D are two rows.
 * Club identity (across events): team name + manager + gender
 *   — manager is known by the email they registered with. Not a search field.
 */
export function registrationNameKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function sameRegistrationName(a, b) {
  const left = registrationNameKey(a);
  return Boolean(left) && left === registrationNameKey(b);
}

/** True when two rows share the live registration key. */
export function sameRegistrationCombo(a, b) {
  if (!a || !b) return false;
  if (!sameRegistrationName(a.teamName, b.teamName)) return false;
  if (a.tournamentSlug && b.tournamentSlug && a.tournamentSlug !== b.tournamentSlug) {
    return false;
  }
  if (a.divisionId && b.divisionId) return a.divisionId === b.divisionId;
  if (a.genderKey && b.genderKey) {
    if (a.genderKey !== b.genderKey) return false;
    return String(a.levelLabel || "") === String(b.levelLabel || "");
  }
  return false;
}
