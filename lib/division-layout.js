import { genderKeyFromDivisionName } from "@/lib/poster-deck";

export const GENDER_ROWS = [
  { key: "womens", label: "Women's" },
  { key: "mens", label: "Men's" },
  { key: "coed", label: "Coed" },
];

const LEVEL_ORDER = ["Open", "D", "E", "Rec", "Upper", "Lower"];

export function divisionGenderKey(d) {
  if (d.gender === "womens" || d.gender === "mens" || d.gender === "coed") {
    return d.gender;
  }
  const k = genderKeyFromDivisionName(d.display_name ?? d.name);
  return { w: "womens", m: "mens", c: "coed" }[k] ?? "coed";
}

export function divisionLevelLabel(d) {
  const raw = String(d.display_name ?? d.name ?? "").trim();
  const stripped = raw.replace(/^(women'?s|men'?s|co-?ed)\s+/i, "").trim();
  return stripped || raw || "—";
}

function levelSortIndex(label) {
  const i = LEVEL_ORDER.findIndex(
    (x) => x.toLowerCase() === String(label).toLowerCase()
  );
  return i === -1 ? LEVEL_ORDER.length : i;
}

/** True when the only "level" is the gender itself (no D/E/Open/Rec). */
export function isBareGenderDivision(d, genderLabel) {
  const level = divisionLevelLabel(d)
    .replace(/['’]/g, "")
    .toLowerCase();
  const g = String(genderLabel)
    .replace(/['’]/g, "")
    .toLowerCase();
  if (!level || level === "—") return true;
  if (level === g) return true;
  if (level === g.replace(/s$/, "")) return true;
  return false;
}

/**
 * Top-level divisions grouped into Women's / Men's / Coed columns.
 * Levels sorted Open → D → E → Rec. Bare gender-only columns flag genderOnly.
 */
export function groupDivisionsByGender(divisions = []) {
  const top = (divisions ?? []).filter((d) => !d.parent_division_id);
  return GENDER_ROWS.map((row) => {
    const items = top
      .filter((d) => divisionGenderKey(d) === row.key)
      .slice()
      .sort(
        (a, b) =>
          levelSortIndex(divisionLevelLabel(a)) -
            levelSortIndex(divisionLevelLabel(b)) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          divisionLevelLabel(a).localeCompare(divisionLevelLabel(b))
      );
    if (items.length === 0) return null;
    const genderOnly =
      items.length === 1 && isBareGenderDivision(items[0], row.label);
    return { ...row, items, genderOnly };
  }).filter(Boolean);
}
