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

/**
 * True when preferred is just the full legal name again (migration noise),
 * not a real nickname. Those should collapse to first name only.
 */
export function preferredIsFullLegal({
  preferredName,
  legalFirstName,
  legalLastName,
  name,
} = {}) {
  const preferred = String(preferredName ?? "").trim().toLowerCase();
  if (!preferred) return false;
  const first = String(legalFirstName ?? "").trim();
  const last = String(legalLastName ?? "").trim();
  const legal = [first, last].filter(Boolean).join(" ").toLowerCase();
  if (legal && preferred === legal) return true;
  const legacy = String(name ?? "").trim().toLowerCase();
  if (legacy && preferred === legacy && /\s/.test(legacy)) return true;
  // "Kaydee Anderson" with only first known: still two tokens = not a nickname default
  if (!legal && /\s/.test(preferred) && preferred === legacy) return true;
  return false;
}

/** Effective preferred: explicit nickname, else first name only. */
export function effectivePreferredName({
  preferredName,
  legalFirstName,
  legalLastName,
  name,
} = {}) {
  const preferred = String(preferredName ?? "").trim();
  const first = String(legalFirstName ?? "").trim();
  if (
    preferred &&
    !preferredIsFullLegal({
      preferredName: preferred,
      legalFirstName: first,
      legalLastName,
      name,
    })
  ) {
    return preferred;
  }
  if (first) return first;
  // No legal first: first token of preferred/full if multi-word, else as-is
  if (preferred) {
    if (/\s/.test(preferred)) return preferred.split(/\s+/)[0];
    return preferred;
  }
  const legacy = String(name ?? "").trim();
  if (!legacy) return "";
  return legacy.split(/\s+/)[0] || legacy;
}

/** Name shown on rosters, links, score sheets. */
export function composeDisplayName({
  preferredName,
  legalFirstName,
  legalLastName,
  name,
} = {}) {
  return (
    effectivePreferredName({
      preferredName,
      legalFirstName,
      legalLastName,
      name,
    }) || ""
  );
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

  // Preferred defaults to first name only — never store full legal as preferred.
  preferredName = effectivePreferredName({
    preferredName,
    legalFirstName: first,
    legalLastName: last,
    name: legacyName,
  }) || null;

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

/**
 * Director-facing roster label: full legal name, with preferred in
 * parentheses only when it differs from first name (a real nickname).
 * Falls back to roster `name` when legal parts are missing.
 */
export function directorPersonLabel({
  legalFirstName,
  legalLastName,
  preferredName,
  name,
} = {}) {
  const first = String(
    legalFirstName ?? ""
  ).trim();
  const last = String(legalLastName ?? "").trim();
  const legal = composeLegalName({ legalFirstName: first, legalLastName: last });
  const preferred = effectivePreferredName({
    preferredName,
    legalFirstName: first,
    legalLastName: last,
    name,
  });
  if (legal) {
    if (
      preferred &&
      preferred.toLowerCase() !== first.toLowerCase() &&
      preferred.toLowerCase() !== legal.toLowerCase()
    ) {
      return `${legal} (${preferred})`;
    }
    return legal;
  }
  return String(name ?? preferred ?? "").trim() || "—";
}
