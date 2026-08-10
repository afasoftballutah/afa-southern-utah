/**
 * Legal name vs preferred (display) name.
 *
 * - Legal first + last: on the waiver / identity matching
 * - Preferred: what the person goes by on rosters and score sheets
 * - Display: preferred if set, else legal full name
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
  const legal = composeLegalName({ legalFirstName, legalLastName });
  if (legal) return legal;
  return String(name ?? "").trim();
}

/**
 * Normalize person payload from forms (camelCase) into DB columns + display name.
 * Players: no phone. Coaches/managers may keep phone.
 */
export function personFieldsFromInput(input = {}, { allowPhone = false } = {}) {
  const legalFirstName = String(input.legalFirstName ?? input.legal_first_name ?? "").trim();
  const legalLastName = String(input.legalLastName ?? input.legal_last_name ?? "").trim();
  const preferredName = String(input.preferredName ?? input.preferred_name ?? "").trim() || null;
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
