/**
 * Live registration uniqueness. Do not change.
 * Matches registrations_one_live_per_division:
 *   (tournament_id, division_id, lower(btrim(team_name)))
 *   where status <> 'withdrawn'
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
