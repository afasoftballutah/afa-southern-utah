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

function managerEmailKey(email) {
  return String(email ?? "").trim().toLowerCase();
}

function managerNameKey(name) {
  return String(name ?? "")
    .replace(/’/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Sheet stubs use "TBD" — that is not a real manager and must not match. */
export function isPlaceholderManager(name) {
  const n = managerNameKey(name);
  return !n || n === "tbd" || n === "n/a" || n === "na" || n === "unknown";
}

/**
 * Same manager on two registrations? Email wins when both have one.
 * If either side is missing an email, the printed manager name is enough
 * (Fallen Coed was saved with a name and no email).
 * Placeholder managers (TBD) never match — those are different clubs.
 */
export function sameManager(a, b) {
  if (!a || !b) return false;
  const ea = managerEmailKey(a.managerEmail ?? a.manager_email);
  const eb = managerEmailKey(b.managerEmail ?? b.manager_email);
  if (ea && eb) return ea === eb;
  const na = managerNameKey(a.managerName ?? a.manager_name);
  const nb = managerNameKey(b.managerName ?? b.manager_name);
  if (isPlaceholderManager(na) || isPlaceholderManager(nb)) return false;
  return Boolean(na && na === nb);
}

/**
 * Another live seat for the same club at the same event
 * (Fallen Men's D + Fallen Coed D).
 */
export function isSiblingSeat(source, other) {
  if (!source || !other) return false;
  if (source.id && other.id && source.id === other.id) return false;
  const tourA = source.tournamentId ?? source.tournament_id;
  const tourB = other.tournamentId ?? other.tournament_id;
  if (tourA && tourB && tourA !== tourB) return false;
  const nameA = source.teamName ?? source.team_name;
  const nameB = other.teamName ?? other.team_name;
  if (!sameRegistrationName(nameA, nameB)) return false;
  const status = other.status ?? null;
  if (status === "withdrawn") return false;
  return sameManager(source, other);
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
