/**
 * Legal name vs preferred (display) name.
 *
 * - Legal first + last: waiver / identity matching / record keeping
 * - Preferred: what they go by (nickname or short form)
 * - Display everywhere: preferred + last, or first + last if no preferred
 */

export function composeLegalName({ legalFirstName, legalLastName } = {}) {
  return [legalFirstName, legalLastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * True when preferred is just the full legal name again (migration noise),
 * not a real nickname.
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
  if (!legal && /\s/.test(preferred) && preferred === legacy) return true;
  return false;
}

/**
 * The "call" name (first word of how they go by): preferred nickname, else
 * legal first. Not used alone on lists — see composeDisplayName.
 */
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
    // If they typed full "Preferred Last" as preferred, keep only first token
    // when last name is stored separately (avoid "Kay Kay Anderson")
    const last = String(legalLastName ?? "").trim().toLowerCase();
    if (last && preferred.toLowerCase().endsWith(` ${last}`)) {
      const withoutLast = preferred.slice(0, -(last.length + 1)).trim();
      if (withoutLast) return withoutLast;
    }
    return preferred;
  }
  if (first) return first;
  if (preferred) {
    if (/\s/.test(preferred)) return preferred.split(/\s+/)[0];
    return preferred;
  }
  const legacy = String(name ?? "").trim();
  if (!legacy) return "";
  return legacy.split(/\s+/)[0] || legacy;
}

/**
 * Name shown on rosters, director lists, manage links, score sheets:
 *   preferred + last  if preferred is set (and not just full legal)
 *   first + last      otherwise
 */
export function composeDisplayName({
  preferredName,
  legalFirstName,
  legalLastName,
  name,
} = {}) {
  const last = String(legalLastName ?? "").trim();
  const call = effectivePreferredName({
    preferredName,
    legalFirstName,
    legalLastName,
    name,
  });
  if (call && last) {
    // Don't double the last name if call already ends with it
    if (call.toLowerCase().endsWith(` ${last.toLowerCase()}`)) return call;
    if (call.toLowerCase() === last.toLowerCase()) return call;
    return `${call} ${last}`;
  }
  if (call) return call;
  if (last) return last;
  return String(name ?? "").trim() || "";
}

/**
 * Normalize person payload from forms (camelCase) into DB columns + display name.
 * Players: no phone. Coaches/managers may keep phone.
 */
export function personFieldsFromInput(input = {}, { allowPhone = false } = {}) {
  const legalFirstName = String(
    input.legalFirstName ?? input.legal_first_name ?? ""
  ).trim();
  const legalLastName = String(
    input.legalLastName ?? input.legal_last_name ?? ""
  ).trim();
  let preferredName =
    String(input.preferredName ?? input.preferred_name ?? "").trim() || null;
  const email = String(input.email ?? "").trim() || null;
  const phone = allowPhone
    ? String(input.phone ?? "").trim() || null
    : null;

  const legacyName = String(input.name ?? "").trim();
  let first = legalFirstName;
  let last = legalLastName;
  if (!first && !last && legacyName) {
    const parts = legacyName.split(/\s+/);
    first = parts[0] || "";
    last = parts.slice(1).join(" ") || "";
  }

  // Store preferred as call name only (not full legal, not full display)
  const call = effectivePreferredName({
    preferredName,
    legalFirstName: first,
    legalLastName: last,
    name: legacyName,
  });
  preferredName = call || null;
  // Don't persist preferred if it's identical to legal first
  if (
    preferredName &&
    first &&
    preferredName.toLowerCase() === first.toLowerCase()
  ) {
    preferredName = null;
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

/**
 * Same as composeDisplayName — preferred+last or first+last everywhere
 * (director, manage, public roster). Legal-only format is for matching/PDFs
 * via composeLegalName when needed.
 */
export function directorPersonLabel(args = {}) {
  return composeDisplayName(args) || "—";
}
