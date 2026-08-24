// Three-game-guarantee double elimination, for any pool size from 4 up.
//
// Pure structure. Given a team count it returns an ordered list of games, each
// one naming its two entrants as either a seed, the winner of an earlier game,
// or the loser of an earlier game. No database, no scheduling, no team names.
// Feed the result real teams elsewhere.
//
// The rules this is built to (JD's, 2026-08-04):
//   1. Standard double-elimination skeleton, byes to the top seeds, play-ins
//      where the pool does not fill a power of two.
//   2. Two losses with a win and you are out. A team that has not won yet
//      takes three losses before it is out.
//   3. Everybody who loses in the same winners round faces the same climb.
//   4. The first losers round pairs teams who cannot have a win yet. The
//      losers of those games meet in a survivor game, and its loser leaves
//      at 0-3.
//   5. Every game on the sheet is played. Nothing is conditional except the
//      grand-final reset, which is conditional by nature.
//   6. Grand final plus reset.
//
// THE TRADEOFF BEHIND opts.reentry
//
// Rule 5 forces a shape that rule 2 does not like. To promise a third game to
// a team that might be 0-2, the sheet has to carry that game whether or not it
// is needed, and it has to name an opponent. Sometimes the only opponent
// available is a team that already has two losses and a win, so under rule 2 is
// already out. Playing it is harmless. Letting its winner carry on is not: that
// team is back on the path to the title after being eliminated.
//
//   reentry: "reference" (default) reproduces the sheet JD drew. Guarantee-game
//     winners rejoin the bracket. On a 9-team pool that lets an eliminated team
//     reach the title on about 2.3% of outcome paths, and the champion can
//     finish carrying two or three losses.
//
//   reentry: "strict" ends the guarantee games where they are played. Nobody
//     who has been eliminated advances and the champion never carries two
//     losses. The cost is rule 3: with those winners gone, some entrants have
//     a shorter climb than others who lost in the same winners round. See the
//     note on rule 3 below.
//
// WHY "strict" CANNOT ALSO HOLD RULE 3
//
// Take the 9-team pool. Five teams reach the losers bracket before the winners
// semifinals: one from round one and four from round two. They have to be
// reduced to two, which is three games, each of which puts one team out. Any
// arrangement of five into two over three games leaves the five at unequal
// depths, and rule 4 pins the round-one loser into the first pairing, which
// rules out the one arrangement that would have worked. The reference sheet
// escapes this by padding the empty slots with guarantee-game winners, so all
// five sit at the same depth. Remove those bodies and the padding goes with
// them. This is a real conflict between rules 2, 4 and 3, not an oversight
// here, and it wants a ruling rather than a guess.

import { PYB_3GG_SHEETS } from "./pyb-3gg-sheets";

function parsePybRef(tok) {
  const s = String(tok);
  if (s[0] === "W") return { W: Number(s.slice(1)) };
  if (s[0] === "L") return { L: Number(s.slice(1)) };
  return { seed: Number(s) };
}

function gamesFromPybSheet(n) {
  const rows = PYB_3GG_SHEETS[n];
  const games = rows.map((row, i) => {
    const [kind, a, b] = row;
    const bracket = kind === "w" ? "winners" : kind === "f" ? "final" : kind === "n" ? "net" : "losers";
    return { id: i + 1, a: parsePybRef(a), b: parsePybRef(b), bracket, round: 1 };
  });
  const winnersDepth = new Map();
  function depth(ref) {
    if (ref.seed !== undefined) return 0;
    const id = ref.W ?? ref.L;
    const g = games[id - 1];
    if (!g) return 0;
    if (winnersDepth.has(id)) return winnersDepth.get(id);
    const d = 1 + Math.max(depth(g.a), depth(g.b));
    winnersDepth.set(id, d);
    return d;
  }
  for (const g of games) g.round = Math.max(1, depth(g.a), depth(g.b));
  let size = 4;
  while (size < n) size *= 2;
  return {
    games,
    meta: {
      n,
      bracketSize: size,
      byes: size - n,
      reentry: "reference",
      source: "printyourbrackets",
      winnersRounds: Math.log2(size),
      unsettled: 0,
    },
  };
}

// Standard bracket seeding order, so 1 meets the lowest seed, 2 sits in the
// far half, and so on. seedOrder(16) is 1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11.
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const width = order.length * 2;
    const next = [];
    for (const s of order) {
      next.push(s);
      next.push(width + 1 - s);
    }
    order = next;
  }
  return order;
}

export function generate3GG(n, opts = {}) {
  const reentry = opts.reentry ?? "reference";
  if (!Number.isInteger(n) || n < 4) throw new Error("generate3GG needs a whole number of teams, 4 or more");
  if (reentry !== "reference" && reentry !== "strict") throw new Error(`generate3GG: unknown reentry mode "${reentry}"`);

  // Seeded PrintYourBrackets 3GG (4–16) is what directors print. Use that
  // sheet when we have it so Generate matches the paper on the table.
  if (PYB_3GG_SHEETS[n] && reentry === "reference") return gamesFromPybSheet(n);

  let size = 4;
  while (size < n) size *= 2;
  const winnersRounds = Math.log2(size);

  const games = [];
  // Two conservative facts per slot reference, both read off the sheet rather
  // than off any particular set of results. The first is the fewest games its
  // occupant can have played, which says who is still owed a game. The second
  // is the most losses it can be carrying on a path where it has not won at
  // all, which says who rule 2 has already put out and who must therefore
  // never appear again. Winless is the part that matters: a team with a win
  // and three losses picking up a spare game is the accepted cost of rule 5,
  // but a winless team playing a fourth is the guarantee eating itself.
  const fewestGames = new Map();
  const winlessLosses = new Map();
  const keyOf = (ref) =>
    ref.seed !== undefined ? `s${ref.seed}` : ref.W !== undefined ? `W${ref.W}` : `L${ref.L}`;
  const played = (ref) => fewestGames.get(keyOf(ref)) ?? 0;
  // -1 means the occupant cannot be winless.
  const winless = (ref) => winlessLosses.get(keyOf(ref)) ?? 0;

  function emit(a, b, bracket, round) {
    const id = games.length + 1;
    games.push({ id, a, b, bracket, round });
    const g = Math.min(played(a), played(b)) + 1;
    const w = Math.max(winless(a), winless(b));
    fewestGames.set(`W${id}`, g);
    fewestGames.set(`L${id}`, g);
    winlessLosses.set(`W${id}`, -1);
    winlessLosses.set(`L${id}`, w < 0 ? -1 : w + 1);
    return id;
  }

  const owedAGame = (ref) => played(ref) < 3;
  // A pairing is illegal when the sheet would still owe its loser a game on
  // some path while on another path that same slot holds a winless team with
  // three losses. Rule 2 put that team out on the third, and rule 5 will not
  // let the follow-up game be conditional, so the pairing has to go.
  const illegal = (a, b) => {
    const g = Math.min(played(a), played(b)) + 1;
    const w = Math.max(winless(a), winless(b));
    return g < 3 && w >= 0 && w + 1 >= 3;
  };

  // ---- winners bracket --------------------------------------------------
  let slots = seedOrder(size).map((s) => (s <= n ? { seed: s } : null));
  const drops = [];
  for (let round = 1; round <= winnersRounds; round++) {
    const next = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      if (a && b) {
        const id = emit(a, b, "winners", round);
        drops.push({ ref: { L: id }, round, bothFresh: a.seed !== undefined && b.seed !== undefined });
        next.push({ W: id });
      } else {
        next.push(a || b);
      }
    }
    slots = next;
  }
  const winnersChampion = slots[0];

  // ---- who arrives in the losers bracket, and in what state -------------
  // A round-one loser has no win. A round-two loser has no win only if both
  // sides of its game came straight from a bye. Anyone dropping from round
  // three on has already won at least once, so one more game settles the
  // guarantee and they need no special handling.
  const noWinYet = drops.filter((d) => d.round === 1 || (d.round === 2 && d.bothFresh));
  const rest = drops.filter((d) => d.round === 2 && !d.bothFresh);
  const entrants = [...noWinYet, ...rest].map((d) => d.ref);

  // The early losers bracket has to hand the same number of teams to the first
  // drop-in round as there are teams dropping into it, which is what makes the
  // rest of the sheet ordinary double elimination.
  const roots = Math.max(1, size / 8);
  let depth = 0;
  while (roots * 2 ** depth < entrants.length) depth++;

  const waiting = [...entrants];
  const spareBodies = [];   // recycled refs available to fill an empty slot
  let owed = [];            // losers the sheet still owes a game

  let filledFromOwed = false;
  function fillSlot(partner) {
    if (waiting.length) return waiting.shift();
    if (reentry === "strict") return null;
    for (let i = 0; i < spareBodies.length; i++) {
      if (partner && illegal(partner, spareBodies[i])) continue;
      return spareBodies.splice(i, 1)[0];
    }
    for (let i = 0; i < owed.length; i++) {
      if (partner && illegal(partner, owed[i])) continue;
      filledFromOwed = true;
      return owed.splice(i, 1)[0];
    }
    return null;
  }

  // Pair off everyone the sheet still owes a game. Two of them meet where
  // possible; a lone one is given a team from the same round that is already
  // out. Rule 5 says the game is on the sheet either way.
  function settleOwed(round, sameRoundSpares) {
    const kept = [];
    while (owed.length) {
      const a = owed.shift();
      let partner = null;
      for (let i = 0; i < owed.length; i++) {
        if (!illegal(a, owed[i])) { partner = owed.splice(i, 1)[0]; break; }
      }
      if (!partner) {
        for (let i = 0; i < sameRoundSpares.length; i++) {
          if (!illegal(a, sameRoundSpares[i])) { partner = sameRoundSpares.splice(i, 1)[0]; break; }
        }
      }
      if (!partner) { kept.push(a); continue; }
      const [x, y] = (partner.L ?? 0) < (a.L ?? 0) ? [partner, a] : [a, partner];
      const id = emit(x, y, "net", round);
      if (reentry === "reference") spareBodies.push({ W: id });
    }
    owed = kept;
  }

  function record(id, spares) {
    const loser = { L: id };
    if (owedAGame(loser)) owed.push(loser);
    else spares.push(loser);
  }

  // ---- early losers bracket: equal-depth trees, one per hand-off slot ----
  const treeRoots = [];
  for (let t = 0; t < roots; t++) {
    let feed = Array.from({ length: 2 ** depth }, () => undefined);
    for (let row = 1; row <= depth; row++) {
      const spares = [];
      const out = [];
      for (let i = 0; i < feed.length; i += 2) {
        // Row one draws its two teams as each game is written rather than all
        // at once: a slot late in the row is often filled by the loser of a
        // game earlier in the same row, which does not exist yet.
        filledFromOwed = false;
        const a = row === 1 ? fillSlot(null) : feed[i];
        const b = row === 1 ? fillSlot(a) : feed[i + 1];
        if (a && b) {
          const id = emit(a, b, filledFromOwed ? "net" : "losers", row);
          record(id, spares);
          out.push({ W: id });
        } else {
          out.push(a || b || null);
        }
      }
      settleOwed(row, spares);
      if (reentry === "reference") spareBodies.push(...spares);
      feed = out;
    }
    treeRoots.push(feed[0]);
  }
  let live = treeRoots.filter(Boolean);
  let round = depth;

  // ---- the ordinary part: absorb winners rounds three and up ------------
  for (let r = 3; r <= winnersRounds; r++) {
    const dropped = drops.filter((d) => d.round === r).map((d) => d.ref);
    round += 1;
    let spares = [];
    let next = [];
    for (let i = 0; i < dropped.length; i++) {
      const a = live[i];
      const b = dropped[i];
      if (a && b) {
        const id = emit(a, b, "losers", round);
        record(id, spares);
        next.push({ W: id });
      } else {
        next.push(a || b);
      }
    }
    live = next.filter(Boolean);
    settleOwed(round, spares);
    if (reentry === "reference") spareBodies.push(...spares);

    if (r < winnersRounds) {
      round += 1;
      spares = [];
      next = [];
      for (let i = 0; i < live.length; i += 2) {
        const a = live[i];
        const b = live[i + 1];
        if (a && b) {
          const id = emit(a, b, "losers", round);
          record(id, spares);
          next.push({ W: id });
        } else {
          next.push(a);
        }
      }
      live = next;
      settleOwed(round, spares);
      if (reentry === "reference") spareBodies.push(...spares);
    }
  }

  const grandFinal = emit(winnersChampion, live[0], "final", 1);
  emit({ W: grandFinal }, { L: grandFinal }, "final", 2);

  return {
    games,
    meta: {
      n,
      bracketSize: size,
      byes: size - n,
      reentry,
      winnersRounds,
      handOffSlots: roots,
      earlyDepth: depth,
      unsettled: owed.length,
    },
  };
}
