// What class a team is eligible for, from the ratings of the players on it.
//
// JD, 2026-07-27: "D can have up to 3 Cs. Open can be anyone. E can have up to
// three Ds or a C and one D. REC can have nobody letter-ranked."
//
// Two ladders, and keeping them apart is the whole design:
//
//   player rating   A, B, C, D, E, or unranked   what a person is
//   team class      Rec, E, D, Open              what a team plays in
//
// A class is therefore an ELIGIBILITY question — the LOWEST class whose limits
// this roster does not break — not a lookup of any one player. Lowest, because
// a team that could play E may also play D or Open; the rules say what you are
// barred from, not what you must choose.
//
// Two more things shape the answer:
//   - The TOURNAMENT says which classes exist. A D team at a Rec/E event plays
//     E, because there is no D to put them in.
//   - The result is a SUGGESTION. The director enters the team. A suggestion
//     that overrode them would be worse than none.

/** Strongest first. A rating not in this list is treated as unranked. */
export const RATINGS = ["A", "B", "C", "D", "E"];

const isRanked = (r) => RATINGS.includes(r);

// ---------------------------------------------------------------------------
// THE RULES. League policy, written once, in the order they are checked.
//
// `limits` is read as: a roster BREAKS this class if any limit is exceeded.
// `null` means no limit at that rating.
//
// UNANSWERED, and it matters: nothing above C is specified. A and B are
// treated as barring everything except Open, which is the conservative read —
// an A player cannot quietly appear on a D team. If A or B are allowed
// somewhere, that is a one-line change to the rule below.
// ---------------------------------------------------------------------------
const RULES = {
  Rec: {
    // "REC can have nobody letter-ranked."
    test: (n) => n.A + n.B + n.C + n.D + n.E === 0,
    describe: () => "no letter-ranked players",
  },
  E: {
    // "E can have up to three Ds or a C and one D."
    test: (n) =>
      n.A + n.B === 0 &&
      ((n.C === 0 && n.D <= 3) || (n.C === 1 && n.D <= 1)),
    describe: () => "up to three D, or one C and one D",
  },
  D: {
    // "D can have up to 3 Cs."
    test: (n) => n.A + n.B === 0 && n.C <= 3,
    describe: () => "up to three C",
  },
  Open: {
    // "Open can be anyone."
    test: () => true,
    describe: () => "anyone",
  },
};

/** Why a roster is barred from a class, in the words a director would use. */
function whyNot(className, n) {
  if (className === "Rec") {
    const ranked = RATINGS.filter((r) => n[r] > 0).map((r) => `${n[r]} ${r}`);
    return `Rec takes nobody letter-ranked, and this roster has ${ranked.join(", ")}.`;
  }
  if (n.A + n.B > 0) {
    const high = ["A", "B"].filter((r) => n[r] > 0).map((r) => `${n[r]} ${r}`);
    return `${high.join(" and ")} on the roster — only Open takes those.`;
  }
  if (className === "E") {
    if (n.C > 1) return `E takes at most one C, and this roster has ${n.C}.`;
    if (n.C === 1) return `With a C on the roster, E takes only one D. This has ${n.D}.`;
    return `E takes up to three D, and this roster has ${n.D}.`;
  }
  if (className === "D") return `D takes up to three C, and this roster has ${n.C}.`;
  return `Not eligible for ${className}.`;
}

/**
 * @param {{rating: string|null}[]} players  the active roster
 * @param {{id: string, name: string, sort_order: number}[]} classes
 * @param {string[]|null} offeredClassIds  classes this tournament runs
 */
export function suggestClass(players, classes, offeredClassIds = null) {
  const roster = players ?? [];
  const n = Object.fromEntries(RATINGS.map((r) => [r, 0]));
  let unranked = 0;
  for (const p of roster) {
    if (isRanked(p.rating)) n[p.rating] += 1;
    else unranked += 1;
  }

  const ranked = [...(classes ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const counts = RATINGS.filter((r) => n[r] > 0).map((r) => ({ name: r, count: n[r] }));

  if (roster.length === 0) {
    return {
      classId: null, className: null, counts, ratedCount: 0, unranked: 0,
      cappedFrom: null, blocked: [], reason: "No players on the roster yet.",
    };
  }

  // Lowest class this roster does not break.
  const blocked = [];
  let chosen = null;
  for (const c of ranked) {
    const rule = RULES[c.name];
    if (!rule) continue; // a class with no rule written is not suggested
    if (rule.test(n)) {
      chosen = c;
      break;
    }
    blocked.push({ name: c.name, why: whyNot(c.name, n) });
  }
  if (!chosen) {
    return {
      classId: null, className: null, counts, ratedCount: roster.length - unranked,
      unranked, cappedFrom: null, blocked,
      reason: "No class on file has a rule that fits this roster.",
    };
  }

  // The tournament caps it — a D team at a Rec/E event plays E.
  let cappedFrom = null;
  if (Array.isArray(offeredClassIds) && offeredClassIds.length > 0) {
    const offered = ranked.filter((c) => offeredClassIds.includes(c.id));
    if (offered.length > 0 && !offered.some((c) => c.id === chosen.id)) {
      cappedFrom = chosen.name;
      const higher = offered.find((c) => c.sort_order > chosen.sort_order);
      chosen = higher ?? offered[offered.length - 1];
    }
  }

  let reason =
    counts.length === 0
      ? `Nobody on this roster is letter-ranked, so Rec is open to them.`
      : `${chosen.name} is the lowest class this roster fits: ${RULES[chosen.name].describe()}.`;
  if (blocked.length > 0) reason += ` ${blocked[blocked.length - 1].why}`;
  if (cappedFrom) {
    reason += ` This tournament does not run ${cappedFrom}, so ${chosen.name} is the closest it offers.`;
  }
  if (unranked > 0) {
    reason += ` ${unranked} ${unranked === 1 ? "player has" : "players have"} no rating yet, so this could change.`;
  }

  return {
    classId: chosen.id,
    className: chosen.name,
    counts,
    ratedCount: roster.length - unranked,
    unranked,
    cappedFrom,
    blocked,
    reason,
  };
}

/** "1 C · 3 D · 5 E" — the breakdown a director reads to check the suggestion. */
export function formatCounts(counts) {
  if (!counts?.length) return "nobody rated";
  return counts.map((c) => `${c.count} ${c.name}`).join(" · ");
}
