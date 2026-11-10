// One ticker entry from a getRecentScores row (components/ScoreTicker.js).

/** "Women's D G1" + both sides with scores, winner first-class. */
export function tickerItem(g) {
  const s1 = g.score1;
  const s2 = g.score2;
  return {
    id: g.id,
    head: [g.divisionName, g.label].filter(Boolean).join(" "),
    sides: [
      { name: g.team1, score: s1, won: s1 != null && s2 != null && s1 > s2 },
      { name: g.team2, score: s2, won: s1 != null && s2 != null && s2 > s1 },
    ],
  };
}
