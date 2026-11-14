/** Gender order for home Recent Results (Women's, Men's, Coed). */
export const RESULT_GENDER_KEYS = ["womens", "mens", "coed"];

export const RESULT_GENDER_LABELS = {
  womens: "Women's",
  mens: "Men's",
  coed: "Coed",
};

/**
 * Dropdown groups: an "All {Gender}" option plus each division, in
 * Women's / Men's / Coed order. Divisions keep the order already used
 * on the By division cards (Gold first, then sort_order / name).
 */
export function resultDivisionPickerOptions(genderFinals, recentGames = {}) {
  const groups = [];
  for (const key of RESULT_GENDER_KEYS) {
    const finals = genderFinals?.[key] ?? [];
    const games = recentGames?.[key] ?? [];
    const divisions = [];
    const seen = new Set();
    for (const card of finals) {
      if (!card?.key || seen.has(card.key)) continue;
      seen.add(card.key);
      divisions.push({
        value: card.key,
        label: card.divisionName || card.caption || "Division",
      });
    }
    for (const card of games) {
      const id = card.divisionId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      divisions.push({
        value: id,
        label: card.divisionName || "Division",
      });
    }
    if (divisions.length === 0) continue;
    groups.push({
      key,
      label: RESULT_GENDER_LABELS[key],
      allValue: key,
      allLabel: `All ${RESULT_GENDER_LABELS[key]}`,
      divisions,
    });
  }
  return groups;
}

/** Today's default: the first gender that has results (Women's, then Men's, then Coed), "All" view. */
export function defaultResultPickerValue(groups) {
  return groups[0]?.allValue ?? null;
}

/** Show the dropdown when there is more than one gender or more than one division. */
export function shouldShowResultPicker(groups) {
  return groups.length > 1 || groups.some((g) => g.divisions.length > 1);
}

/**
 * Cards for the current picker value. Gender keys keep the existing
 * all-divisions / all-recent-games lists; a division id returns that
 * division only.
 */
export function cardsForResultPicker({
  mode,
  picker,
  genderFinals,
  recentGames,
  recentGamesByDivision,
}) {
  if (!picker) return [];
  const isAll = RESULT_GENDER_KEYS.includes(picker);
  if (mode === "games") {
    if (isAll) return recentGames?.[picker] ?? [];
    return recentGamesByDivision?.[picker] ?? [];
  }
  if (isAll) return genderFinals?.[picker] ?? [];
  for (const key of RESULT_GENDER_KEYS) {
    const hit = (genderFinals?.[key] ?? []).find((c) => c.key === picker);
    if (hit) return [hit];
  }
  return [];
}
