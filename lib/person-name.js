/**
 * Legal name vs preferred (display) name.
 *
 * - Legal first + last: on the waiver / identity matching
 * - Preferred: what the person goes by on rosters and score sheets
 * - Display: preferred if set, else legal first name only (not full legal)
 */

export function composeLegalName({ legalFirstName, legalLastName } = {}) {
  return [legalFirstName, legalLastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Name shown on rosters, links, score sheets. */
export function composeDisplayName({
  preferredName,
  legalFirstName,
  legalLastName,
  name,
} = {}) {
  const preferred = String(preferredName ?? "").trim();
  if (preferred) return preferred;
  // Default: first name only — not "First Last".
  const first = String(legalFirstName ?? "").trim();
  if (first) return first;
  const legal = composeLegalName({ legalFirstName, legalLastName });
  if (legal) return legal;
  // Legacy single-name field: use first token only when possible.
  const legacy = String(name ?? "").trim();
  if (!legacy) return "";
  return legacy.split(/\s+/)[0] || legacy;
}

/**
 * Normalize person payload from forms (camelCase) into DB columns + display name.
 * Players: no phone. Coaches/managers may keep phone.
 */
export function personFieldsFromInput(input = {}, { allowPhone = false } = {}) {
  const legalFirstName = String(input.legalFirstName ?? input.legal_first_name ?? "").trim();
  const legalLastName = String(input.legalLastName ?? input.legal_last_name ?? "").trim();
  let preferredName = String(input.preferredName ?? input.preferred_name ?? "").trim() || null;
  const email = String(input.email ?? "").trim() || null;
  const phone = allowPhone
    ? String(input.phone ?? "").trim() || null
    : null;

  // Legacy single "name" field (director bulk paste, old clients)
  const legacyName = String(input.name ?? "").trim();
  let first = legalFirstName;
  let last = legalLastName;
  if (!first && !last && legacyName) {
    const parts = legacyName.split(/\s+/);
    first = parts[0] || "";
    last = parts.slice(1).join(" ") || "";
  }

  // Preferred defaults to first name only (not full legal).
  if (!preferredName && first) preferredName = first;

  const displayName = composeDisplayName({
    preferredName,
    legalFirstName: first,
    legalLastName: last,
    name: legacyName,
  });

  return {
    legalFirstName: first || null,
    legalLastName: last || null,
    preferredName,
    email,
    phone,
    displayName,
    legalName: composeLegalName({
      legalFirstName: first,
      legalLastName: last,
    }),
  };
}

export function hasLegalName(person) {
  return Boolean(
    String(person?.legalFirstName ?? person?.legal_first_name ?? "").trim() &&
      String(person?.legalLastName ?? person?.legal_last_name ?? "").trim()
  );
}
