// AFA World Series 2026 — Men's D. Transcribed from the director's sheet
// (AFA WORLDS MEN'S D, 16-team 3-game guarantee). This file is the single
// source for supabase/load-2026-worlds-mens-d.sql and its test. Do not edit
// the SQL by hand: change this file and run
//   node scripts/worlds-2026-mens-d/build-sql.mjs
//
// Each game: n = the sheet's game number, side = winners | losers | final,
// a / b = top / bottom line on the sheet. A token is a team name, or
// W12 / L12 (winner / loser of game 12). day = THU (Nov 12) or FRI (Nov 13),
// at = 24h wall-clock time as printed, park = H (Hunter) or P (Pioneer).
//
// The sheet is the PrintYourBrackets 16-team 3GG with games 17–20 numbered
// bottom-up instead of top-down (sheet G20 = PYB G17, G19 = 18, G18 = 19,
// G17 = 20). Everything else matches PYB game for game. The test proves it.
//
// Times and fields read from the PDF's text layer (pdftotext -layout).

export const TOURNAMENT_ID = "e87a664d-e165-41c0-9a41-deb86b0dfd2e"; // 2026-afa-world-series
export const DIVISION_NAME = "Men's D";

export const DAYS = { THU: "2026-11-12", FRI: "2026-11-13" };

export const VENUES = [
  {
    key: "H",
    name: "Hunter Park",
    address: "500 E Mesquite Blvd, Mesquite, NV 89027",
    field_prefix: "Hunter",
  },
  {
    key: "P",
    name: "Pioneer Park",
    address: "501 Hillside Drive, Mesquite, NV 89027",
    field_prefix: "Pioneer",
  },
].map((v) => ({
  ...v,
  map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.address}`)}`,
}));

// Sheet is ALL CAPS; these are the display names.
export const TEAMS = [
  "Banana Slugs", "Vice", "Ragin Rhinos", "Phat Kids",
  "Los Homies", "Cage Bombs", "Glove Workz", "Channel 4",
  "Jaded", "Fallen", "SIS", "Da Bumbs",
  "Elite", "208 Mafia", "435 Outlaws", "Castlewood",
];

const g = (n, side, a, b, day, at, park, field) => ({ n, side, a, b, day, at, park, field });

export const GAMES = [
  // Winners, Thursday at Hunter
  g(1, "winners", "Banana Slugs", "Vice", "THU", "14:00", "H", 1),
  g(2, "winners", "Ragin Rhinos", "Phat Kids", "THU", "14:00", "H", 2),
  g(3, "winners", "Los Homies", "Cage Bombs", "THU", "14:00", "H", 3),
  g(4, "winners", "Glove Workz", "Channel 4", "THU", "15:00", "H", 1),
  g(5, "winners", "Jaded", "Fallen", "THU", "15:00", "H", 2),
  g(6, "winners", "SIS", "Da Bumbs", "THU", "15:00", "H", 3),
  g(7, "winners", "Elite", "208 Mafia", "THU", "16:00", "H", 1),
  g(8, "winners", "435 Outlaws", "Castlewood", "THU", "16:00", "H", 2),
  // Losers round 1, Thursday at Hunter
  g(9, "losers", "L1", "L2", "THU", "16:00", "H", 3),
  g(10, "losers", "L3", "L4", "THU", "17:00", "H", 1),
  g(11, "losers", "L5", "L6", "THU", "17:00", "H", 2),
  g(12, "losers", "L7", "L8", "THU", "17:00", "H", 3),
  // Winners round 2, Thursday at Hunter
  g(13, "winners", "W1", "W2", "THU", "18:00", "H", 1),
  g(14, "winners", "W3", "W4", "THU", "18:00", "H", 2),
  g(15, "winners", "W5", "W6", "THU", "18:00", "H", 3),
  g(16, "winners", "W7", "W8", "THU", "19:00", "H", 1),
  // Losers: 3GG crossover — losers of 9–12 get their third game here.
  g(17, "losers", "L11", "W12", "FRI", "09:00", "P", 3),
  g(18, "losers", "L12", "W11", "FRI", "08:00", "P", 3),
  g(19, "losers", "L9", "W10", "FRI", "08:00", "P", 2),
  g(20, "losers", "L10", "W9", "FRI", "08:00", "P", 1),
  // Losers: winners-round-2 losers drop in
  g(21, "losers", "L16", "W20", "FRI", "09:00", "P", 1),
  g(22, "losers", "L15", "W19", "FRI", "09:00", "P", 2),
  g(23, "losers", "L14", "W18", "FRI", "10:00", "P", 2),
  g(24, "losers", "L13", "W17", "FRI", "10:00", "P", 3),
  // Winners round 3, Friday at Pioneer
  g(25, "winners", "W13", "W14", "FRI", "10:00", "P", 1),
  g(26, "winners", "W15", "W16", "FRI", "11:00", "P", 3),
  g(27, "losers", "W21", "W22", "FRI", "11:00", "P", 1),
  g(28, "losers", "W23", "W24", "FRI", "11:00", "P", 2),
  g(29, "losers", "L25", "W27", "FRI", "12:00", "P", 1),
  g(30, "losers", "L26", "W28", "FRI", "12:00", "P", 2),
  g(31, "winners", "W25", "W26", "FRI", "12:00", "P", 3),
  g(32, "losers", "W29", "W30", "FRI", "13:00", "P", 3),
  g(33, "losers", "L31", "W32", "FRI", "14:00", "P", 3),
  // Finals
  g(34, "final", "W31", "W33", "FRI", "15:00", "P", 3),
  g(35, "final", "W34", "L34", "FRI", "16:00", "P", 3), // "Loser of 34 If First Loss"
];

export function venueOf(park) {
  const v = VENUES.find((x) => x.key === park);
  if (!v) throw new Error(`unknown park ${park}`);
  return v;
}

/** "Hunter F1" — the games.field text. */
export function fieldText(game) {
  return `${venueOf(game.park).field_prefix} F${game.field}`;
}

/** { kind: "team", name } | { kind: "W"|"L", n } */
export function parseToken(tok) {
  const m = /^([WL])(\d+)$/.exec(tok);
  return m ? { kind: m[1], n: Number(m[2]) } : { kind: "team", name: tok };
}

// Mesquite is Pacific. tournaments.timezone; the sheet's clock times are
// stored as true Pacific instants and the site shows them as "2 PM PST".
export const TIME_ZONE = "America/Los_Angeles";

// The classless "Men's" placeholder division the load removes (J.D.,
// 2026-11-08: Men's D is the only men's division). Every column as the
// public site served it on 2026-11-08 (divisions(*) in the /tournaments
// payload), so the rollback recreates it exactly.
export const OLD_MENS = {
  id: "cc1281b4-3877-42c9-b644-0dcc79f516d5",
  tournament_id: TOURNAMENT_ID,
  name: "Men's",
  display_name: "Men's",
  gender: "mens",
  class_id: null,
  bracket_type: "double_elim",
  sort_order: 0,
  day_date: "2026-11-12",
  day_label: "Thu, Nov 12",
  min_teams: 6,
  max_teams: null,
  min_men: 10,
  min_women: 0,
  seed_order: null,
  third_life_teams: [],
  parent_division_id: null,
  source_url: null,
  bracket_confirmed_at: null,
  bracket_confirmed_by: null,
  created_at: "2026-07-21T18:18:17.136295+00:00",
};
