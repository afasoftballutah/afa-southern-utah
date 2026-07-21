// Pure double-elimination bracket structure generator. No DB, no I/O — a
// deterministic function from a list of seeded team names to a full set of
// match descriptors, easy to unit-test in isolation before it ever touches
// storage.
//
// Bracket size is padded to the next power of two; unfilled slots are byes.
// Byes are resolved eagerly at generation time (a bye has a determined
// winner immediately — no game needs to be played). Every other match
// either has both teams known directly (winners round 1, from seeding) or
// references its feeder match(es) by (side, round, slot) + which result
// (winner/loser) it needs — those get filled in later, live, as real games
// finish (see propagate.js).
//
// Standard double-elimination shape used here (k = log2(bracketSize)):
//   Winners: rounds 1..k, round r has bracketSize / 2^r matches.
//   Losers: rounds 1..2*(k-1) (0 when k=1 — a 2-team bracket has no losers
//     bracket at all; the winners-round-1 loser goes straight to the final).
//     Round 1 is a "condense" round pairing WR1 losers together. Rounds
//     alternate condense / drop-in from there. Drop-in rounds pair the
//     previous losers-round's survivors against the newly-eliminated
//     winners-bracket losers, in reversed order (the standard anti-rematch
//     heuristic — reduces but doesn't guarantee no repeat matchups; full
//     manual slot editing is the safety net for anything this misses).
//   Final: one grand-final game (winners champ vs losers champ), plus an
//     "if necessary" second game that only matters if the losers-bracket
//     team wins game one (true double-elimination decider).

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Sentinel for a consolation-bracket winners-round-1 slot that will receive
// a real team later (once it's eliminated from the main bracket), as
// opposed to a permanent bye (no team ever). A Symbol never collides with a
// real team name and never leaves this in-memory module.
export const OPEN_ENTRY = Symbol("open-entry");

// Standard bracket seeding order (1-indexed seed ranks), e.g. seedOrder(8)
// === [1, 8, 4, 5, 2, 7, 3, 6] — keeps top seeds apart for as long as
// possible and is the default anyone expects; the director can still drag
// any team to any slot afterward.
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length;
    const next = [];
    for (const s of order) {
      next.push(s, 2 * n + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * @param {(string|Symbol)[]} teamNames - in seed order (rank 1 first). An
 *   entry may be the OPEN_ENTRY sentinel instead of a name — used for the
 *   consolation bracket, whose entrants aren't known at generation time
 *   (see buildConsolationEntryStructure below).
 * @param {'double_elim'|'double_elim_consolation'} format
 * @returns {{ bracketSize: number, matches: Array }}
 *   matches: { side, round, slot, team1, team2, isBye }
 *   team1/team2 are one of:
 *     { type: 'team', name } — known now
 *     { type: 'bye' } — permanent dead end, never gets a team
 *     { type: 'open' } — winners-round-1 only: will get a real team later,
 *       assigned live as teams are eliminated from the main bracket
 *     { type: 'ref', side, round, slot, result: 'winner'|'loser' } — fed by
 *       another match in this same structure
 */
export function buildBracketStructure(teamNames, format = "double_elim") {
  const n = teamNames.length;
  const bracketSize = nextPowerOfTwo(Math.max(n, 2));
  const k = Math.log2(bracketSize);
  const order = seedOrder(bracketSize);
  const seedToTeam = new Map();
  order.forEach((seedRank, i) => {
    // seedRank is 1-indexed; teamNames[seedRank-1] is undefined for byes
    seedToTeam.set(i, teamNames[seedRank - 1] ?? null); // slot i -> team name or null (bye)
  });

  const matches = [];

  // ---- Winners bracket ----
  const winnersMatchCount = (round) => bracketSize / Math.pow(2, round);
  for (let round = 1; round <= k; round++) {
    const count = winnersMatchCount(round);
    for (let slot = 0; slot < count; slot++) {
      let team1, team2;
      if (round === 1) {
        const t1 = seedToTeam.get(slot * 2);
        const t2 = seedToTeam.get(slot * 2 + 1);
        team1 = t1 === OPEN_ENTRY ? { type: "open" } : t1 ? { type: "team", name: t1 } : { type: "bye" };
        team2 = t2 === OPEN_ENTRY ? { type: "open" } : t2 ? { type: "team", name: t2 } : { type: "bye" };
      } else {
        team1 = { type: "ref", side: "winners", round: round - 1, slot: slot * 2, result: "winner" };
        team2 = { type: "ref", side: "winners", round: round - 1, slot: slot * 2 + 1, result: "winner" };
      }
      matches.push({ side: "winners", round, slot, team1, team2 });
    }
  }

  // ---- Losers bracket ----
  // `format` doesn't change this bracket's own shape — it's always a
  // standard double-elim skeleton, whether it's the main bracket or the
  // consolation bracket (built by buildConsolationEntryStructure below,
  // which always passes 'double_elim'). What double_elim_consolation
  // changes is generate.js building a SECOND one of these, fed live by
  // main-bracket eliminations — see JD's ruling, 2026-07-21.
  const totalLosersRounds = 2 * (k - 1);
  for (let i = 1; i <= k - 1; i++) {
    const condenseRound = 2 * i - 1;
    const dropInRound = 2 * i;

    if (i === 1) {
      // L1: condense WR1 losers together
      const wr1Count = winnersMatchCount(1);
      const l1Count = wr1Count / 2;
      for (let slot = 0; slot < l1Count; slot++) {
        matches.push({
          side: "losers",
          round: condenseRound,
          slot,
          team1: { type: "ref", side: "winners", round: 1, slot: slot * 2, result: "loser" },
          team2: { type: "ref", side: "winners", round: 1, slot: slot * 2 + 1, result: "loser" },
        });
      }
    } else {
      const prevCondense = 2 * (i - 1) - 1 + 1; // = previous drop-in round number = 2*(i-1)
      const prevCount = winnersMatchCount(i - 1) / 2; // survivors count from previous drop-in round (see below, matches WR(i) match count / ... )
      const count = winnersMatchCount(i) / 2;
      for (let slot = 0; slot < count; slot++) {
        matches.push({
          side: "losers",
          round: condenseRound,
          slot,
          team1: { type: "ref", side: "losers", round: prevCondense, slot: slot * 2, result: "winner" },
          team2: { type: "ref", side: "losers", round: prevCondense, slot: slot * 2 + 1, result: "winner" },
        });
      }
    }

    // Drop-in round: survivors of the condense round we just built vs the
    // newly-eliminated losers from winners round (i+1), mirrored order.
    const wrDropCount = winnersMatchCount(i + 1);
    for (let slot = 0; slot < wrDropCount; slot++) {
      matches.push({
        side: "losers",
        round: dropInRound,
        slot,
        team1: { type: "ref", side: "losers", round: condenseRound, slot, result: "winner" },
        team2: {
          type: "ref",
          side: "winners",
          round: i + 1,
          slot: wrDropCount - 1 - slot,
          result: "loser",
        },
      });
    }
  }

  // ---- Grand final ----
  const losersFinalRound = totalLosersRounds; // 0 when k === 1
  matches.push({
    side: "final",
    round: 1,
    slot: 0,
    team1: { type: "ref", side: "winners", round: k, slot: 0, result: "winner" },
    team2:
      k === 1
        ? { type: "ref", side: "winners", round: 1, slot: 0, result: "loser" }
        : { type: "ref", side: "losers", round: losersFinalRound, slot: 0, result: "winner" },
  });
  // "If necessary" decider — only matters if the losers-bracket team (team2)
  // wins game one. Always created up front so field/time can be scheduled
  // ahead of it; propagate.js cancels it automatically if it turns out not
  // to be needed.
  matches.push({
    side: "final",
    round: 2,
    slot: 0,
    team1: { type: "ref", side: "final", round: 1, slot: 0, result: "winner" },
    team2: { type: "ref", side: "final", round: 1, slot: 0, result: "loser" },
  });

  return { bracketSize, matches };
}

/**
 * The consolation bracket (JD's ruling, 2026-07-21): a team enters once
 * it's eliminated from the main bracket (its 2nd loss there), starting
 * fresh at 0 losses, in a bracket that mirrors the main bracket's own
 * double-elimination structure. Sized for the maximum possible number of
 * entrants — every registered team except the eventual main-bracket
 * champion is eliminated exactly once, so that's (teamCount - 1). Which
 * specific team fills which slot isn't known until eliminations actually
 * happen in real time, so every real slot starts as OPEN_ENTRY; only the
 * padding (byes, to round out to a power of two) is decided now, using the
 * same seeding algorithm as the main bracket so a bye is never paired
 * against another bye.
 */
export function buildConsolationEntryStructure(entrantCount) {
  return buildBracketStructure(Array(Math.max(entrantCount, 0)).fill(OPEN_ENTRY), "double_elim");
}
