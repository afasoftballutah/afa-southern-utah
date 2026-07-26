"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Matchup from "@/components/ui/Matchup";
import BracketMatchup from "@/components/bracket/BracketMatchup";
import { useHighlightTeam } from "@/components/bracket/HighlightTeamContext";
import { useDrops } from "@/components/bracket/DropsContext";
import { useFocusRound } from "@/components/bracket/FocusRoundContext";
import { mootIfRounds } from "@/lib/bracket/if-game";
import { formatFieldTime, LEAGUE_TZ } from "@/lib/bracket/tree";

// DrawnBracket — lays out ANY bracket from its feed graph (dispatch-brief-15),
// for brackets lib/bracket/tree.js can't draw. tree.js assumes every round
// either halves its feeder count or passes 1:1; a 9- or 10-entrant bracket
// has byes, so a game's two feeders can sit at different depths (Gold's
// Game 13 is fed by Game 7, three columns deep, and Game 8, two columns
// deep). lib/bracket/tree.js, components/bracket/TreeCanvas.js, and
// components/bracket/BracketTree.js stay untouched — they serve the
// engine-generated double-elim brackets, which are always regular.
//
// Reads only `round` (the league's printed GAME NUMBER), team1_name/
// team2_name (a pool seed like "[A #1]", a feed like "Winner of Game 5",
// or a real team name), field, scheduled_time, scores and status off the
// `games` rows already fetched for the division. Reuses the site's own
// Matchup unit and formatFieldTime so a matchup looks identical everywhere.
//
// BANDS (JD ruling, mid-build): losing does not advance you — a losers
// game still has to be WON to survive, so the drawing separates a WINNERS
// band (top) from a LOSERS band (below it, offset by a fixed gap) with a
// FINAL joining the two at the far right. Columns stay purely depth-based
// (longest-path from the feed graph) regardless of band — a losers game
// sits one column later than the winners game whose LOSER feeds it, never
// snapped back to line up with it. That raggedness is correct: a
// bye-heavy bracket is genuinely uneven.

const FEED_RE = /^(Winner|Loser) of Game (\d+)$/;

// Fixed cell geometry — sizing contract: 180-220px box width, never
// shrinks at any viewport. If the tree is wider than the viewport it
// scrolls horizontally instead (see the wrapping div below).
const CELL_W = 200;
const GUTTER = 48;
const ROW_UNIT_H = 155;
// BOX_H is the two-pill unit ONLY (spec law 2, 2026-07-22): the caption is
// rendered outside this component's Matchup call and excluded from every
// centering/overlap/connector calc below. Since caption is never passed to
// Matchup here, its rendered height is now identical for every cell (two
// truncated single-line rows, no variable-height content), so this is a
// true constant rather than an approximation: border-t-2(2) + p-3 top(12)
// + row(py-1.5 12 + text-sm 20 = 32) + divide-y hairline(1) + row(32) +
// p-3 bottom(12) + border bottom(1) = 92px. Confirmed against a real
// getBoundingClientRect() read in verification (dispatch-brief-18).
const BOX_H = 92;
const HEADER_H = 26;
const TOP_PAD = 16;
const LEFT_PAD = 72; // reserved margin for the Winners/Losers/Final captions
const BAND_GAP = 56; // tight vertical gap between the winners and losers bands
const MIN_GAP = 1; // row units — the "clear gap" floor between two games in one column
const CAPTION_ROOM = 24; // canvas padding reserved below the lowest box so its caption (outside all layout math) never clips

// A slot's feed comes from the SOURCE COLUMNS first, and only falls back to
// parsing the placeholder text (JD, 2026-07-25: "what happened to the tourney
// branch?").
//
// The bug this fixes: the drawing used to derive every edge from text like
// "Winner of Game 3". The moment that game was scored, propagation replaced
// the text with the winner's real name — and the edge vanished, taking the
// whole branch out of the picture. A played game literally erased its own
// line. `team*_source_game_id` survives propagation precisely because it is
// the durable relationship; the text is only the visible placeholder.
function parseSlots(game, byRound, roundByGameId) {
  return [
    ["team1_name", "team1_source_game_id", "team1_source_result"],
    ["team2_name", "team2_source_game_id", "team2_source_result"],
  ].map(([nameKey, srcKey, resKey]) => {
    const srcId = game?.[srcKey];
    if (srcId && roundByGameId?.has(srcId)) {
      const round = roundByGameId.get(srcId);
      if (byRound.has(round)) {
        const res = String(game?.[resKey] ?? "winner").toLowerCase();
        return { type: res === "loser" ? "Loser" : "Winner", round };
      }
    }
    const m = FEED_RE.exec(game?.[nameKey] ?? "");
    if (m && byRound.has(Number(m[2]))) return { type: m[1], round: Number(m[2]) };
    return null;
  });
}
function feedersOf(game, byRound, roundByGameId) {
  return parseSlots(game, byRound, roundByGameId)
    .filter(Boolean)
    .map((s) => s.round);
}

// Feeds that get a DRAWN LINE. Loser drops are deliberately not drawn
// (JD, 2026-07-24, marking them up on a screenshot as "lines we don't
// need"): a loser drop always crosses from the winners band to the losers
// band, so it renders as a long vertical running the height of the whole
// bracket, and several of them stack in the same gutter into one
// meaningless stripe. The slot already SAYS "Loser of Game 4" in words —
// drawing it too states the same fact twice, in the noisiest way
// available. Loser feeds still drive column and row placement; they just
// aren't inked.
function drawnFeedersOf(game, byRound, roundByGameId) {
  return parseSlots(game, byRound, roundByGameId)
    .filter((s) => s && s.type === "Winner")
    .map((s) => s.round);
}

// Column (x) = longest-path depth from the feed graph, memoised DFS. A
// game with no feed slots is depth 0; otherwise 1 + max(feeder depths).
// This is band-blind on purpose — a losers game's column comes only from
// its feeders' columns, never adjusted to align with a band. Returns null
// if a cycle is detected (malformed data) so the caller can bail to the
// fallback list rather than looping forever.
function computeDepths(byRound, roundByGameId) {
  const memo = new Map();
  const visiting = new Set();
  let cycle = false;
  function depth(round) {
    if (memo.has(round)) return memo.get(round);
    if (visiting.has(round)) {
      cycle = true;
      return 0;
    }
    visiting.add(round);
    const feeders = feedersOf(byRound.get(round), byRound, roundByGameId);
    const d = feeders.length === 0 ? 0 : 1 + Math.max(...feeders.map(depth));
    visiting.delete(round);
    memo.set(round, d);
    return d;
  }
  for (const round of byRound.keys()) depth(round);
  if (cycle) return null;

  // NO SLIDING. A round is a FACT about the tournament — how many games a
  // team had to win to be standing there — not a layout variable. Earlier
  // passes moved games rightward to shorten connectors, which made the
  // column headers lie: Gold's Games 1-4 are all Round 1 (every slot comes
  // straight from a pool), yet two of them were being drawn in Round 2.
  // Crossings are solved by the TREE layout in computeBandRows, vertically,
  // never by moving a game out of its true round (JD, 2026-07-25).
  return memo;
}

// Band classification, processed in ascending-depth order so every
// feeder is already classified by the time a game asks for its band.
//   - LOSERS: any literal "Loser of Game N" slot (a drop-down — never
//     part of a Final, which is always fed by the WINNER of each side),
//     OR a "Winner of Game N" feed from a game already LOSERS (that
//     winner is still playing inside the losers bracket).
//   - FINAL: both slots are "Winner of" feeds, one from the winners band
//     and one from the losers band — the champion of each side. The
//     if-necessary decider (both slots referencing the same already-FINAL
//     round, one as its winner and one as its loser) is FINAL too.
//   - WINNERS: everything else (seed-fed games, and games fed only by
//     winners-band winners).
function computeBands(byRound, depthByRound, roundByGameId) {
  const rounds = [...byRound.keys()].sort((a, b) => depthByRound.get(a) - depthByRound.get(b) || a - b);
  const band = new Map();
  for (const r of rounds) {
    const slots = parseSlots(byRound.get(r), byRound, roundByGameId);
    const hasLoserFeed = slots.some((s) => s && s.type === "Loser");
    const winnerSlots = slots.filter((s) => s && s.type === "Winner");
    const winnerFeedBands = winnerSlots.map((s) => band.get(s.round));

    const sameRoundBoth =
      slots[0] &&
      slots[1] &&
      slots[0].round === slots[1].round &&
      ((slots[0].type === "Winner" && slots[1].type === "Loser") ||
        (slots[0].type === "Loser" && slots[1].type === "Winner"));
    if (sameRoundBoth && band.get(slots[0].round) === "final") {
      band.set(r, "final");
      continue;
    }
    if (hasLoserFeed) {
      band.set(r, "losers");
      continue;
    }
    if (slots[0] && slots[1] && winnerSlots.length === 2) {
      const bandsPresent = new Set(winnerFeedBands);
      if (bandsPresent.has("winners") && bandsPresent.has("losers")) {
        band.set(r, "final");
        continue;
      }
    }
    if (winnerFeedBands.includes("losers")) {
      band.set(r, "losers");
      continue;
    }
    band.set(r, "winners");
  }
  return band;
}

// Row units, computed independently PER BAND. A game with no same-band
// feeder is a root of that band's own sequence and takes the next
// sequential row unit (in column, then game-number, order) — generalizing
// "depth-0 games occupy sequential row units" to "band-root games occupy
// sequential row units," since a losers-band game fed entirely by
// winners-band losers (e.g. Gold's Game 6) has no losers-band predecessor
// to inherit a row from. A game with same-band feeders centers on their
// mean (one feeder inherits it exactly); collisions within the same
// column are nudged down to keep a clear gap, same as before.
function computeBandRows(byRound, depthByRound, band, bandName, roundByGameId) {
  // A bracket is a SYMMETRIC BINARY TREE and must be laid out from the root
  // backwards (JD, 2026-07-25): the final sits at the centre, its two feeders
  // take the upper and lower halves of its span, and so on down. Each subtree
  // then owns a CONTIGUOUS vertical band, which is what makes crossings
  // structurally impossible rather than something to detect and patch.
  //
  // What this replaces placed each game at the AVERAGE of its feeders' rows,
  // with roots numbered by an arbitrary counter. Nothing owned a band, so a
  // subtree could land anywhere the arithmetic put it — Gold's Game 2 sat on
  // a low branch while its winner belonged to Game 7 up top, and the
  // connector had to climb across the branch below it.
  //
  // Implementation: leaves are numbered in depth-first traversal order, and
  // every parent takes the midpoint of its children. Traversal order is what
  // guarantees contiguity; the midpoint is what makes it look like a bracket.
  const bandRounds = [...byRound.keys()].filter((r) => band.get(r) === bandName);
  if (bandRounds.length === 0) return new Map();

  const inBand = new Set(bandRounds);
  const childrenOf = new Map(); // round -> feeder rounds inside this band
  const consumed = new Set();
  for (const r of bandRounds) {
    const kids = feedersOf(byRound.get(r), byRound, roundByGameId)
      .filter((f) => inBand.has(f))
      .sort((a, b) => (depthByRound.get(b) ?? 0) - (depthByRound.get(a) ?? 0) || a - b);
    childrenOf.set(r, kids);
    for (const k of kids) consumed.add(k);
  }

  // Roots: games nothing else in this band feeds from — deepest last so the
  // tree reads top to bottom in play order.
  const roots = bandRounds
    .filter((r) => !consumed.has(r))
    .sort((a, b) => (depthByRound.get(b) ?? 0) - (depthByRound.get(a) ?? 0) || a - b);

  const rowByRound = new Map();
  let nextLeafRow = 0;
  const seen = new Set();

  function place(round) {
    if (seen.has(round)) return rowByRound.get(round);
    seen.add(round);
    const kids = childrenOf.get(round) ?? [];
    if (kids.length === 0) {
      const row = nextLeafRow;
      nextLeafRow += 1;
      rowByRound.set(round, row);
      return row;
    }
    const kidRows = kids.map(place);
    const row = (Math.min(...kidRows) + Math.max(...kidRows)) / 2;
    rowByRound.set(round, row);
    return row;
  }

  for (const root of roots) place(root);
  // Anything unreachable from a root (malformed data) still gets a row so it
  // renders rather than vanishing.
  for (const r of bandRounds) if (!rowByRound.has(r)) place(r);

  return rowByRound;
}


function xForCol(depth) {
  return LEFT_PAD + depth * (CELL_W + GUTTER);
}

// Pill centres inside the 92px card, which is where a drop lands. Kept
// here rather than imported so the pure section stays standalone (the
// prototype's exporter slices it out and runs it on its own). These must
// agree with SIDE_Y in components/bracket/BracketMatchup.js.
const PILL_CENTERS = [27, 65];

/**
 * A BYE enters at the top of its matchup (spec 5.4). Duplicated from the
 * rendering side's needs on purpose: the drop routing has to aim at the
 * row as DRAWN, so both must agree, and the pure section cannot import.
 * Returns slot indices in display order.
 */
function rowOrderFor(game, roundByGameId) {
  const kind = (ref, srcId, res) => (ref ? "seed" : srcId ? String(res ?? "winner") : null);
  const when = (ref, srcId) => (ref ? 0 : srcId ? roundByGameId.get(srcId) ?? Infinity : Infinity);
  const k1 = kind(game.team1_seed_ref, game.team1_source_game_id, game.team1_source_result);
  const k2 = kind(game.team2_seed_ref, game.team2_source_game_id, game.team2_source_result);
  if (!k1 || !k2 || k1 === k2) return [0, 1];
  return when(game.team2_seed_ref, game.team2_source_game_id) <
    when(game.team1_seed_ref, game.team1_source_game_id)
    ? [1, 0]
    : [0, 1];
}

// An axis-aligned polyline with rounded corners, so a drop reads as one
// continuous fall rather than a set of joined sticks.
function roundedPath(pts, r) {
  const p = pts.filter((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
  if (p.length < 2) return "";
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const inX = Math.sign(b.x - a.x), inY = Math.sign(b.y - a.y);
    const outX = Math.sign(c.x - b.x), outY = Math.sign(c.y - b.y);
    const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    d += ` L ${b.x - inX * rr} ${b.y - inY * rr} Q ${b.x} ${b.y} ${b.x + outX * rr} ${b.y + outY * rr}`;
  }
  const last = p[p.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * LOSER DROPS (spec 5.5). Reverses the 2026-07-24 ruling that they should
 * not be drawn: drawn straight, they stacked into a stripe of parallel
 * verticals. Drawn like this they do not.
 *
 *   - Only OUT of the winners bracket. A losers-bracket game's loser is
 *     eliminated. The one other "loser of" edge is the grand final
 *     feeding the if-necessary game, which is a rematch, not a fall, and
 *     is drawn separately.
 *   - Each winners card in a column takes its own exit tick along its
 *     bottom edge, 1/(M+1), 2/(M+1)... where M counts WINNERS games in
 *     that column only. Four games in round 1 exit at a fifth, two
 *     fifths, three fifths and four fifths, so their falls are
 *     structurally incapable of overlapping.
 *   - A drop falls clear of the winners band before it goes anywhere
 *     sideways, crosses the corridor in a lane of its own, descends in
 *     its own gutter, and enters on the destination's row.
 *
 * The corridor is measured to the LOSERS band, not to "any band that is
 * not winners": the Final sits vertically between the two, and including
 * it put the corridor's ceiling below its floor and collapsed eight lanes
 * into 12px of hatching.
 */
function computeDrops(rounds, byRound, roundByGameId, rectByRound) {
  const rects = [...rectByRound.values()];
  const winners = rects.filter((r) => r.band === "winners");
  const losers = rects.filter((r) => r.band === "losers");
  if (!winners.length) return [];

  const byColumn = new Map();
  winners.forEach((r) => {
    if (!byColumn.has(r.x)) byColumn.set(r.x, []);
    byColumn.get(r.x).push(r);
  });
  const exitX = new Map();
  const laneOfColumn = new Map();
  byColumn.forEach((col) => {
    col.sort((a, b) => a.y - b.y);
    col.forEach((r, i) => {
      exitX.set(r.round, r.x + CELL_W * ((i + 1) / (col.length + 1)));
      laneOfColumn.set(r.round, i);
    });
  });

  const clearOf = Math.max(...winners.map((r) => r.y + BOX_H));
  const nextBand = losers.length ? Math.min(...losers.map((r) => r.y)) : clearOf + 130;
  const corridorTop = clearOf + 14;
  const corridorBot = Math.max(corridorTop + 12, nextBand - 14);

  const drops = [];
  for (const r of rounds) {
    const target = rectByRound.get(r);
    const game = byRound.get(r);
    if (!target || !game) continue;
    const order = rowOrderFor(game, roundByGameId);
    [
      [game.team1_source_game_id, game.team1_source_result, 0],
      [game.team2_source_game_id, game.team2_source_result, 1],
    ].forEach(([srcId, res, slot]) => {
      if (!srcId || String(res ?? "winner").toLowerCase() !== "loser") return;
      const srcRound = roundByGameId.get(srcId);
      const source = srcRound != null ? rectByRound.get(srcRound) : null;
      if (!source || source.band !== "winners") return;
      drops.push({
        from: srcRound,
        to: r,
        slot,
        x1: exitX.get(srcRound),
        y1: source.y + BOX_H,
        x2: target.x,
        y2: target.y + PILL_CENTERS[order.indexOf(slot)],
        column: source.depth,
        columnLane: laneOfColumn.get(srcRound) ?? 0,
      });
    });
  }
  if (!drops.length) return [];

  // Farthest-right destination takes the highest lane: its long run then
  // sits above the shorter ones and each descent crosses as few other
  // lanes as possible.
  drops.sort((a, b) => b.x2 - a.x2 || a.y2 - b.y2);
  const perDest = new Map();
  drops.forEach((d) => {
    perDest.set(d.x2, (perDest.get(d.x2) ?? -1) + 1);
    d.dropX = d.x2 - (16 + perDest.get(d.x2) * 11);
  });

  const room = corridorBot - corridorTop;
  const gap = Math.max(10, Math.min(18, room / (drops.length + 1)));
  const start = corridorTop + (room - gap * (drops.length - 1)) / 2;

  // Every line leaving a round takes its own step along a purple-to-light-
  // blue spectrum, first out of a round at the purple end. They run behind
  // the cards, and a colour is what lets you pick one back up on the far
  // side. Advancement lines stay one navy: they never run behind anything.
  const byCol = new Map();
  drops.forEach((d) => {
    if (!byCol.has(d.column)) byCol.set(d.column, []);
    byCol.get(d.column).push(d);
  });
  byCol.forEach((g) => {
    g.sort((a, b) => a.columnLane - b.columnLane);
    g.forEach((d, i) => {
      const t = g.length > 1 ? i / (g.length - 1) : 0;
      const h = Math.round(280 - t * 82);
      const s = Math.round(50 + t * 12);
      const l = Math.round(50 + t * 10);
      d.color = `hsl(${h} ${s}% ${l}%)`;
      d.badge = `hsl(${h} ${s}% ${Math.min(l, 46)}%)`;
    });
  });

  return drops.map((d, i) => {
    const laneY = Math.round(start + i * gap);
    return {
      from: d.from,
      to: d.to,
      slot: d.slot,
      color: d.color,
      badge: d.badge,
      d: roundedPath(
        [
          { x: d.x1, y: d.y1 },
          { x: d.x1, y: laneY },
          { x: d.dropX, y: laneY },
          { x: d.dropX, y: d.y2 },
          { x: d.x2, y: d.y2 },
        ],
        9
      ),
    };
  });
}

/**
 * The if-necessary game is a REMATCH, so it gets two lines from the one
 * game that feeds it: the solid one the routing above already draws for
 * the winner, and this dotted one for the loser, who has earned the right
 * to play again. Routed short and low rather than through the corridor —
 * the two games sit side by side, and this is a step back into the ring,
 * not a fall out of the bracket.
 */
function computeRematches(rounds, byRound, roundByGameId, rectByRound) {
  const out = [];
  for (const r of rounds) {
    const game = byRound.get(r);
    const target = rectByRound.get(r);
    if (!game || !target) continue;
    const a = game.team1_source_game_id;
    const b = game.team2_source_game_id;
    if (!a || !b || a !== b) continue;
    const loserSlot =
      String(game.team1_source_result ?? "").toLowerCase() === "loser"
        ? 0
        : String(game.team2_source_result ?? "").toLowerCase() === "loser"
        ? 1
        : -1;
    const srcRound = roundByGameId.get(a);
    const source = srcRound != null ? rectByRound.get(srcRound) : null;
    if (loserSlot < 0 || !source) continue;
    const order = rowOrderFor(game, roundByGameId);
    const x1 = source.x + CELL_W / 2;
    const y1 = source.y + BOX_H;
    out.push({
      from: srcRound,
      to: r,
      d: roundedPath(
        [
          { x: x1, y: y1 },
          { x: x1, y: y1 + 24 },
          { x: target.x - 18, y: y1 + 24 },
          { x: target.x - 18, y: target.y + PILL_CENTERS[order.indexOf(loserSlot)] },
          { x: target.x, y: target.y + PILL_CENTERS[order.indexOf(loserSlot)] },
        ],
        9
      ),
    });
  }
  return out;
}

// Routing law (dispatch-brief-18, replacing the old "clear trunk band"
// jog): every horizontal run must sit at the Y of one of its two
// endpoints — never an arbitrary mid-Y that reads as a line through empty
// space. A vertical run is always drawn inside a gutter, and a gutter
// never holds a box, so a vertical never needs a clearance check — only a
// horizontal can cross a box, and only when it passes over an
// intervening column. This is that one check: does any box sitting in
// column `depth` occupy the Y a horizontal run would pass through there.
function crossesBoxAtY(depth, y, rects) {
  return rects.some((r) => r.depth === depth && y > r.y && y < r.y + BOX_H);
}

/**
 * Pure layout function — no React, so it can be verified standalone.
 * Returns null for an empty game list, `{ cycle: true }` if the feed
 * graph has a cycle (malformed data) — both tell the component to render
 * the plain list instead. Otherwise returns cells (one per game, with its
 * pixel position and band), connectors (one path per feed relationship),
 * column headers, band captions, and the canvas size.
 */
export function computeLayout(games) {
  const real = (games ?? []).filter((g) => g && g.round != null);
  if (real.length === 0) return null;

  const byRound = new Map();
  const roundByGameId = new Map();
  for (const g of real) {
    byRound.set(g.round, g);
    if (g.id) roundByGameId.set(g.id, g.round);
  }

  const depthByRound = computeDepths(byRound, roundByGameId);
  if (!depthByRound) return { cycle: true };

  const rounds = [...byRound.keys()];
  const maxDepth = Math.max(...rounds.map((r) => depthByRound.get(r)));
  const band = computeBands(byRound, depthByRound, roundByGameId);

  const winnersRows = computeBandRows(byRound, depthByRound, band, "winners", roundByGameId);
  const losersRows = computeBandRows(byRound, depthByRound, band, "losers", roundByGameId);

  const winnersTop = TOP_PAD + HEADER_H;
  const winnersMaxRow = winnersRows.size ? Math.max(...winnersRows.values()) : 0;
  const winnersHeight = winnersRows.size ? (winnersMaxRow + 1) * ROW_UNIT_H : 0;
  const losersTop = winnersTop + winnersHeight + (losersRows.size ? BAND_GAP : 0);

  // Every rect.y is rounded to a whole pixel here, once, at the source —
  // row averaging (a game centered on two feeders' mean row) can produce
  // a half-unit row, and BOX_H is even, so rounding here is sufficient to
  // keep every downstream center (rect.y + BOX_H / 2) a whole pixel too,
  // rather than sprinkling Math.round across every call site (routing law
  // item 4 — no 0.5 coordinates).
  const rectByRound = new Map();
  for (const [r, row] of winnersRows) {
    rectByRound.set(r, { round: r, depth: depthByRound.get(r), x: xForCol(depthByRound.get(r)), y: Math.round(winnersTop + row * ROW_UNIT_H), band: "winners" });
  }
  for (const [r, row] of losersRows) {
    rectByRound.set(r, { round: r, depth: depthByRound.get(r), x: xForCol(depthByRound.get(r)), y: Math.round(losersTop + row * ROW_UNIT_H), band: "losers" });
  }

  // FINAL: positioned at its own depth column (columns stay depth-based
  // for every band), vertically on the midpoint of its two feeders'
  // actual pixel centers — the winners champion and the losers champion.
  // The if-necessary decider (both feeds pointing at the same prior FINAL
  // round) inherits that round's Y exactly, same as a normal bracket's
  // GF2 sitting on GF1's line.
  const finalRounds = rounds.filter((r) => band.get(r) === "final").sort((a, b) => depthByRound.get(a) - depthByRound.get(b));
  for (const r of finalRounds) {
    const slots = parseSlots(byRound.get(r), byRound, roundByGameId).filter(Boolean);
    const sameRound = slots.length === 2 && slots[0].round === slots[1].round;
    let y;
    if (sameRound) {
      y = rectByRound.get(slots[0].round).y;
    } else {
      const centers = slots.map((s) => rectByRound.get(s.round).y + BOX_H / 2);
      y = Math.round(centers.reduce((a, b) => a + b, 0) / centers.length - BOX_H / 2);
    }
    rectByRound.set(r, { round: r, depth: depthByRound.get(r), x: xForCol(depthByRound.get(r)), y, band: "final" });
  }

  const rects = [...rectByRound.values()];
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects) {
    maxX = Math.max(maxX, rect.x + CELL_W);
    maxY = Math.max(maxY, rect.y + BOX_H);
  }

  // Connectors: box-edge to box-edge, one per feed relationship. Routing
  // law (dispatch-brief-18) — every horizontal run sits at the Y of one of
  // its two endpoints, never an arbitrary mid-Y:
  //   1. Same Y (within 1px): one straight horizontal, no jog at all.
  //   2. Adjacent columns: the standard 3-segment elbow through the single
  //      mid-gutter between them.
  //   3. Cross-column (a feed 2+ columns back — a team that waits): the
  //      horizontal runs at the FEEDER's own Y straight across the
  //      intervening columns to the gutter immediately before the
  //      destination, then one vertical, then one horizontal at the
  //      destination's own Y into its left edge — the paper-bracket
  //      bye/wait line. If that feeder-Y run would cross a box in one of
  //      the intervening columns, the vertical moves EARLIER (into the
  //      nearest clear gutter, walking back toward the source) so both
  //      horizontals still sit only at their own endpoints' Y — never at
  //      a third, made-up height. A vertical is never checked for
  //      clearance: it always runs inside a gutter, and a gutter never
  //      holds a box. This is also exactly what draws a drop-down: a
  //      winners-band game's LOSER feeding a losers-band game is just a
  //      connector whose two endpoints sit in different bands, so the
  //      vertical run naturally spans the band gap without any special
  //      case.
  const connectors = [];
  // Endpoints kept alongside the path strings so the markers can be drawn
  // without measuring the DOM: a server render has no getPointAtLength.
  const connectorEnds = [];
  const joggedFeeds = []; // feeds where the vertical had to move earlier than the gutter right before the destination — reported per brief step 2
  for (const r of rounds) {
    const target = rectByRound.get(r);
    for (const f of drawnFeedersOf(byRound.get(r), byRound, roundByGameId)) {
      const source = rectByRound.get(f);
      const x1 = source.x + CELL_W;
      const y1 = source.y + BOX_H / 2;
      const x2 = target.x;
      const y2 = target.y + BOX_H / 2;

      if (Math.abs(y1 - y2) < 1) {
        // Rule 1 — same center, dead straight, no elbow at all.
        connectors.push(`M ${x1} ${Math.round(y1)} H ${Math.round(x2)}`);
        connectorEnds.push({ fromRound: f, toRound: r, a: { x: x1, y: Math.round(y1) }, b: { x: Math.round(x2), y: Math.round(y1) } });
        continue;
      }

      if (target.depth === source.depth + 1) {
        // Rule 2 — adjacent columns, the standard 3-segment elbow. The
        // single gutter between the two columns is the only place a
        // vertical can go, so there is no clearance search to run.
        const gx = Math.round(x1 + GUTTER / 2);
        connectors.push(`M ${x1} ${Math.round(y1)} H ${gx} V ${Math.round(y2)} H ${x2}`);
        connectorEnds.push({ fromRound: f, toRound: r, a: { x: x1, y: Math.round(y1) }, b: { x: x2, y: Math.round(y2) } });
        continue;
      }

      // Rule 3 — cross-column. Walk the split point back from the gutter
      // right before the destination (the default: the whole feeder-Y run
      // crosses every intervening column) toward the source, one gutter
      // at a time, until both resulting horizontals are clear of every
      // box in the columns they pass over.
      const interveningDepths = [];
      for (let d = source.depth + 1; d < target.depth; d++) interveningDepths.push(d);
      let splitAt = interveningDepths.length; // y1-run covers interveningDepths[0..splitAt-1]
      while (splitAt > 0) {
        const y1Clear = interveningDepths.slice(0, splitAt).every((d) => !crossesBoxAtY(d, y1, rects));
        const y2Clear = interveningDepths.slice(splitAt).every((d) => !crossesBoxAtY(d, y2, rects));
        if (y1Clear && y2Clear) break;
        splitAt -= 1;
      }
      if (splitAt < interveningDepths.length) joggedFeeds.push({ from: f, to: r, splitAt });
      const lastY1Depth = splitAt > 0 ? interveningDepths[splitAt - 1] : source.depth;
      const gx = Math.round(xForCol(lastY1Depth) + CELL_W + GUTTER / 2);
      connectors.push(`M ${x1} ${Math.round(y1)} H ${gx} V ${Math.round(y2)} H ${x2}`);
      connectorEnds.push({ fromRound: f, toRound: r, a: { x: x1, y: Math.round(y1) }, b: { x: x2, y: Math.round(y2) } });
    }
  }

  const headers = [];
  for (let d = 0; d <= maxDepth; d++) {
    headers.push({ x: xForCol(d), w: CELL_W, label: `Round ${d + 1}` });
  }

  // Band captions, left margin — one per band actually present, vertically
  // pinned near that band's own top.
  const bandCaptions = [];
  if (winnersRows.size) bandCaptions.push({ y: winnersTop, label: "Winners" });
  if (losersRows.size) bandCaptions.push({ y: losersTop, label: "Losers" });
  if (finalRounds.length) {
    // The Final is NOT a horizontal band. Winners and Losers run the width
    // of the drawing, so a left-margin caption labels them correctly; the
    // Final is two games at the far right. Captioning it in the margin
    // stranded the word beside empty space seven columns from its games
    // (JD, 2026-07-24). It sits above its own first game instead.
    const firstFinal = rectByRound.get(finalRounds[0]);
    bandCaptions.push({ x: firstFinal.x, y: firstFinal.y - 20, label: "Final" });
  }

  return {
    cells: rects.map((r) => ({ round: r.round, game: byRound.get(r.round), x: r.x, y: r.y, band: r.band })),
    connectors,
    connectorEnds,
    // Loser drops and the if-necessary rematch, computed off the same
    // rects the advancement lines use, so they cannot disagree about
    // where a game is (spec 5.5, 5.6).
    drops: computeDrops(rounds, byRound, roundByGameId, rectByRound),
    rematches: computeRematches(rounds, byRound, roundByGameId, rectByRound),
    rowOrders: Object.fromEntries(rounds.map((r) => [r, rowOrderFor(byRound.get(r), roundByGameId)])),
    joggedFeeds,
    headers,
    bandCaptions,
    totalWidth: maxX + TOP_PAD,
    // + CAPTION_ROOM: the caption below the lowest box sits outside every
    // layout calc above (rect.y/maxY are pill-pair-only), so the canvas
    // needs a little extra room reserved beneath it or that last caption
    // would have nothing to sit in.
    totalHeight: maxY + TOP_PAD + CAPTION_ROOM,
  };
}

// The site-wide caption, unabbreviated — kept for the fallback list, which
// is the same transcribed-list rendering the page showed before this
// component existed. Only the DRAWN bracket's cells use the compact form.
function fullCaption(g) {
  return [`Game ${g.round}`, formatFieldTime(g)].filter(Boolean).join(" · ");
}

// Compact caption for the drawn bracket ONLY — a 180-220px box has no room
// for "Game 2 · Sat 9:00 PM · Field 5". Dense diagrams abbreviate; the
// bracket already uses G-numbers (the paper convention), so this extends
// existing vocabulary rather than inventing one: "G2 · SAT 9P · F5".
// Reuses LEAGUE_TZ from lib/bracket/tree.js (read-only import) rather than
// re-deriving the timezone. Any part that's missing (no time, no field)
// is omitted along with its separator — never a dangling " · ".
// The card's own caption, which no longer carries the game number: that
// moved into the badge inside the card's top-left corner (spec 5.2). Same
// abbreviation rules as compactCaption, minus the G-part.
function scheduleCaption(g) {
  return compactCaption(g).replace(/^G\d+\s*·\s*/, "");
}

function compactCaption(g) {
  const parts = [`G${g.round}`];
  if (g.scheduled_time) {
    const d = new Date(g.scheduled_time);
    const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }).toUpperCase();
    const full = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: LEAGUE_TZ,
    });
    const m = /^(\d+):(\d+)\s*([AP])M$/.exec(full);
    if (m) {
      const [, hour, minute, meridiem] = m;
      const time = minute === "00" ? `${hour}${meridiem}` : `${hour}:${minute}${meridiem}`;
      parts.push(`${day} ${time}`);
    } else {
      parts.push(day);
    }
  }
  if (g.field) {
    const m = /field\s*#?\s*(\S+)/i.exec(g.field);
    parts.push(m ? `F${m[1]}` : g.field);
  }
  return parts.join(" · ");
}

// The label that names an outcome in the consequences view. Sits above
// the card's own caption so the two do not collide.
function OutcomeTag({ children, color }) {
  return (
    <span
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-5 z-[4] whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[.07em] text-white"
      style={{ background: color || "var(--afa-navy)", boxShadow: "0 2px 5px -1px rgba(22,35,61,.35)" }}
    >
      {children}
    </span>
  );
}

// The current transcribed-list rendering — used both as the true fallback
// (cycle detected, or nothing to draw) and, being identical markup, means
// falling back never reads as a regression from what the page showed
// before this component existed. Full, readable captions — unabbreviated,
// same as the schedule and pool pages.
function FallbackList({ games }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {(games ?? []).map((g) => (
        <Matchup
          key={g.id}
          caption={fullCaption(g)}
          team1={g.team1_name}
          team2={g.team2_name}
          score1={g.team1_score}
          score2={g.team2_score}
          isFinal={g.status === "final"}
        />
      ))}
    </div>
  );
}

/**
 * @param onSelectGame  when supplied, tapping a game calls this instead of
 *   toggling the consequences view. That is the difference between the
 *   public bracket (tap to see what happens if you win) and the
 *   scorekeeper's (tap to edit). One renderer, two verbs.
 * @param selectedRound the game the caller has open, ringed the same way
 *   focus is.
 * @param conflictRounds games sharing a field and a time with another
 *   game, flagged on the card.
 */
export default function DrawnBracket({
  games,
  division,
  seeds,
  onSelectGame,
  selectedRound = null,
  conflictRounds,
  highlightTeam = null,
}) {
  // The page supplies it directly on the scorekeeper side; on the public
  // side it arrives from the team picker through context.
  const followed = useHighlightTeam();
  const team = highlightTeam ?? followed;
  const layout = useMemo(() => computeLayout(games), [games]);
  const scrollerRef = useRef(null);
  // Off by default (JD, 2026-07-25). The drop lines answer "where does a
  // loser go", which is a second question — the first is "who plays who",
  // and a dozen coloured curves across the sheet is not the first thing a
  // reader should have to look past to get it.
  const [ownShowDrops, setOwnShowDrops] = useState(false);
  // A page may own the switch and put it in its own toolbar; otherwise
  // the drawing carries it.
  const dropsCtl = useDrops();
  const showDrops = dropsCtl ? dropsCtl.showDrops : ownShowDrops;
  const setShowDrops = dropsCtl ? dropsCtl.setShowDrops : setOwnShowDrops;
  // Tap a game to see its consequences (spec 5.7). The question a manager
  // actually has standing on the field is "what happens to us if we win
  // this", and the answer was spread across the whole drawing.
  const [focus, setFocus] = useState(null);

  // Arriving from a result somewhere else: open on THAT game, and put it
  // on screen. Applied once — after that the drawing is the reader's.
  const arrivedAt = useFocusRound();
  const [honoured, setHonoured] = useState(false);
  useEffect(() => {
    if (honoured || arrivedAt == null) return;
    if (!layout.cells.some((c) => c.round === arrivedAt)) return;
    setFocus(arrivedAt);
    setHonoured(true);
  }, [arrivedAt, honoured, layout.cells]);

  // A team carries its POOL SEED everywhere it appears (spec 5.3). The
  // seeds map is supplied by the page when it knows pool results; without
  // it a propagated name simply renders without a tag rather than
  // borrowing the game number, which would say something different.
  const seedTagFor = useMemo(() => {
    const byTeam = seeds?.byTeam ?? null;
    return (name) => (byTeam ? byTeam.get(name) ?? null : null);
  }, [seeds]);
  const resolveSeed = useMemo(() => {
    const byRef = seeds?.byRef ?? null;
    return (ref) => {
      if (!ref) return null;
      const m = /\[?\s*([A-Za-z])\s*#\s*(\d+)\s*\]?/.exec(ref);
      if (!m) return null;
      const label = `${m[1].toUpperCase()}${m[2]}`;
      return { label, name: byRef ? byRef.get(label) ?? null : null };
    };
  }, [seeds]);

  if (!layout || layout.cycle) {
    if (layout?.cycle) {
      console.error("DrawnBracket: cycle detected in the feed graph — rendering the list instead.");
    }
    return <FallbackList games={games} />;
  }

  // The if-necessary game, read out of the data rather than hardcoded: a
  // game whose two slots both point at the same feeder is a rematch, which
  // is exactly what "if necessary" means (spec 5.6).
  const ifRounds = new Set(layout.rematches.map((r) => r.to));
  // An if-game the undefeated team made unnecessary by winning the first
  // final (JD, 2026-07-26). It is not "still to come", it is never
  // happening, and saying "If necessary" over an empty card leaves people
  // waiting for a game that will not be played.
  const moot = useMemo(() => mootIfRounds(games ?? []), [games]);
  const roundById = new Map((games ?? []).map((g) => [g.id, g.round]));

  // The badge on a game wears the colour of the drop LEAVING it, so a game
  // and the fall it produces are tied together before you trace anything.
  // A navy badge means this game sends nobody down.
  const badgeOf = new Map(layout.drops.map((d) => [d.from, d.badge]));
  // And the slot a drop lands in wears the colour of the line arriving,
  // so "[Loser 1]" and its line are obviously the same fact. With drops
  // off both go back to muted: a colour referring to a line you cannot
  // see is noise.
  const slotTintOf = new Map(layout.drops.map((d) => [`${d.to}:${d.slot}`, d.color]));

  // Where a focused game's two outcomes lead. Both are stated in the data,
  // so this is a lookup rather than a guess. A game whose winner feeds
  // nothing is the last one played, and winning it wins the tournament.
  const winTo = focus
    ? layout.cells.find(({ game }) =>
        [["team1_source_game_id", "team1_source_result", 0], ["team2_source_game_id", "team2_source_result", 1]].some(
          ([k, r]) => game[k] && roundById.get(game[k]) === focus && String(game[r] ?? "winner").toLowerCase() === "winner"
        )
      )
    : null;
  const loseTo = focus ? layout.drops.find((d) => d.from === focus) : null;
  const focusRole = (round) =>
    round === focus || round === selectedRound ? "focus" : winTo && winTo.round === round ? "win" : loseTo && loseTo.to === round ? "lose" : focus ? "dim" : null;

  // A team's own run through the bracket. Every game they are in is
  // outlined; the earliest one still unplayed is their NEXT one and gets
  // the brighter ring, because on a bracket this wide it is the single
  // thing they opened the page to find.
  const mine = useMemo(() => {
    if (!team) return { rounds: new Set(), won: new Set(), lost: new Set(), next: null };
    const norm = (n) => String(n ?? "").trim().toLowerCase();
    const target = norm(team);
    const rounds = new Set();
    const won = new Set();
    const lost = new Set();
    let next = null;
    for (const { round, game } of layout.cells) {
      const isOne = norm(game.team1_name) === target;
      const isTwo = norm(game.team2_name) === target;
      if (!isOne && !isTwo) continue;
      rounds.add(round);
      if (game.status === "final") {
        // Which way it went decides which LINE they rode out of it.
        const s1 = game.team1_score;
        const s2 = game.team2_score;
        if (s1 !== null && s2 !== null && s1 !== s2) {
          const theyWon = isOne ? s1 > s2 : s2 > s1;
          (theyWon ? won : lost).add(round);
        }
        continue;
      }
      const when = game.scheduled_time ? new Date(game.scheduled_time).getTime() : Infinity;
      if (!next || when < next.when) next = { round, when };
    }
    return { rounds, won, lost, next: next?.round ?? null };
  }, [team, layout.cells]);

  // The segments that trace their run (JD, 2026-07-26: "can we actually
  // show the lines that trace a team through the bracket, win or lose").
  // A connector belongs to a team when they played BOTH ends of it —
  // advancement lines for the games they won, drop lines for the ones
  // they lost. The drop half is drawn for them even when loser paths are
  // off: that is their path, not the general answer to "where do losers
  // go", and it is half the story of how they got where they are.
  // Blue for the wins, red for the loss (JD, 2026-07-26). The advancement
  // line a team rode forward and the dotted line they fell down are two
  // different things that happened to them, and colouring them the same
  // navy made a run read as one continuous march.
  const WIN_GLOW = "drop-shadow(0 0 5px rgba(30,58,110,.65))";
  const LOSS_GLOW = "drop-shadow(0 0 5px rgba(200,42,54,.6))";

  const minePath = useMemo(() => {
    if (mine.rounds.size === 0) return { connectors: new Set(), drops: new Set() };
    // A line belongs to a team only if THEY are the one who travelled it.
    // "Played both ends" was not enough: The Pliggas lost Silver game 15
    // and came back through the losers side, but 15 -> 18 is the WINNERS
    // advancement line — GWZ's route — and they played both games, so it
    // lit up as theirs (JD, 2026-07-26). An advancement line is only
    // yours if you WON the game it leaves; a drop is only yours if you
    // lost it.
    const connectors = new Set();
    layout.connectorEnds.forEach((e, i) => {
      if (mine.won.has(e.fromRound) && mine.rounds.has(e.toRound)) connectors.add(i);
    });
    const drops = new Set();
    layout.drops.forEach((d, i) => {
      if (mine.lost.has(d.from) && mine.rounds.has(d.to)) drops.add(i);
    });
    return { connectors, drops };
  }, [mine.won, mine.lost, mine.rounds, layout.connectorEnds, layout.drops]);

  // Bring that next game into view. The drawing is wider than any phone,
  // and a highlight you have to go looking for is not much of a highlight.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // Arriving from a link: bring the game into view on BOTH axes. It can
    // sit a thousand pixels down a tall bracket, and landing on a blank
    // stretch of white is not "here is your game".
    if (arrivedAt != null && layout.cells.some((c) => c.round === arrivedAt)) {
      const node = el.querySelector(`[data-game-round="${arrivedAt}"]`);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        return;
      }
    }

    // Following a team: centre their next game horizontally only. Yanking
    // the page vertically because someone picked a name would be rude.
    if (mine.next == null) return;
    const cell = layout.cells.find((c) => c.round === mine.next);
    if (!cell) return;
    el.scrollTo({
      left: Math.max(0, cell.x + CELL_W / 2 - el.clientWidth / 2),
      behavior: "smooth",
    });
  }, [arrivedAt, mine.next, layout.cells]);
  // Winning a game that feeds nothing wins the tournament — unless the
  // only thing it feeds is an if-game that will never be played, which is
  // the same thing.
  const isChampion =
    focus != null && (!winTo || (moot.has(winTo.round) && !moot.has(focus)));

  const endpoints = [
    ...layout.connectorEnds.flatMap(({ a, b }) => [
      { ...a, color: "var(--afa-navy)" },
      { ...b, color: "var(--afa-navy)" },
    ]),
    ...(showDrops
      ? layout.drops.flatMap((d) => {
          const m = /^M\s*([\d.-]+)\s+([\d.-]+)/.exec(d.d);
          const last = /L\s*([\d.-]+)\s+([\d.-]+)$/.exec(d.d);
          const out = [];
          if (m) out.push({ x: +m[1], y: +m[2], color: d.color, drop: true });
          if (last) out.push({ x: +last[1], y: +last[2], color: d.color, drop: true });
          return out;
        })
      : []),
  ];

  return (
    <div>
      {layout.drops.length > 0 && !dropsCtl && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowDrops((v) => !v)}
            aria-pressed={showDrops}
            className={[
              "rounded-full border px-3 text-[12px] font-semibold min-h-9",
              showDrops
                ? "bg-afa-navy/[0.08] border-afa-navy/30 text-afa-navy"
                : "border-afa-ink/15 text-afa-ink/70",
            ].join(" ")}
          >
            {showDrops ? "Hide loser paths" : "Show loser paths"}
          </button>
        </div>
      )}
      {/* The bracket sits on WHITE, not on the page's cream. The tinted
          matchup cards and the drop colours were both chosen against a
          white ground, and on cream the pale end of the spectrum washes
          out. It also gives the drawing an edge to stop against instead
          of bleeding into the page. Full-bleed on a phone, a panel from
          sm up. */}
      <div
        ref={scrollerRef}
        className="-mx-4 sm:mx-0 bg-white sm:rounded-xl overflow-x-auto px-4 py-4"
        style={{
          WebkitOverflowScrolling: "touch",
          boxShadow: "0 1px 2px rgba(22,35,61,.05), 0 10px 26px -18px rgba(22,35,61,.5)",
        }}
      >
        <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight }}>
        {/* Drops go UNDER the advancement lines: where the two share a
            gutter, the solid line should be the one you read. Both sit
            under the cards, so a drop passing behind a card disappears
            rather than crossing a team name. */}
        <svg className="absolute inset-0 pointer-events-none bracket-connectors" width={layout.totalWidth} height={layout.totalHeight}>
          {showDrops &&
            layout.drops.map((d, i) => (
              <path
                key={`drop-${i}`}
                d={d.d}
                stroke={minePath.drops.has(i) ? "var(--afa-red)" : d.color}
                strokeWidth={1.6}
                strokeDasharray="0.1 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={minePath.drops.has(i) ? 2.5 : 1.6}
                opacity={
                  focus != null
                    ? d.from === focus
                      ? 1
                      : 0.07
                    : minePath.drops.has(i)
                      ? 1
                      : minePath.drops.size > 0
                        ? 0.35
                        : 0.85
                }
                style={minePath.drops.has(i) ? { filter: LOSS_GLOW } : undefined}
                fill="none"
              />
            ))}
          {/* Their own drops, drawn whether or not the general loser
              paths are on — same glow the advancement half gets. */}
          {minePath.drops.size > 0 &&
            layout.drops.map((d, i) =>
              minePath.drops.has(i) && !showDrops ? (
                <path
                  key={`mine-drop-${i}`}
                  d={d.d}
                  stroke="var(--afa-red)"
                  strokeWidth={2.5}
                  strokeDasharray="0.1 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={focus != null ? 0.12 : 1}
                  fill="none"
                  style={{ filter: LOSS_GLOW }}
                />
              ) : null
            )}
          {showDrops &&
            layout.rematches.map((d, i) => (
              <path
                key={`rematch-${i}`}
                d={d.d}
                stroke="var(--afa-navy)"
                strokeWidth={1.6}
                strokeDasharray="0.1 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.75}
                fill="none"
              />
            ))}
          {layout.connectors.map((d, i) => {
            const from = layout.connectorEnds[i]?.fromRound;
            const lit = focus != null && from === focus;
            // A followed team's own segment: thicker, and the rest of the
            // drawing steps back so the path reads as a line you can
            // follow rather than as one line among forty.
            const isMine = minePath.connectors.has(i);
            const stepBack = focus == null && minePath.connectors.size > 0 && !isMine;
            return (
              <path
                key={i}
                d={d}
                stroke="var(--afa-navy)"
                strokeWidth={lit || isMine ? 2.5 : 1}
                opacity={focus != null && !lit ? 0.08 : stepBack ? 0.25 : 1}
                fill="none"
                style={isMine ? { filter: WIN_GLOW } : undefined}
                shapeRendering={lit || isMine ? undefined : "crispEdges"}
              />
            );
          })}
        </svg>

        {/* A dot at each end of every connector, sitting exactly ON the
            card's border. Drawn in a layer ABOVE the cards so it reads as
            a full circle rather than the half one a card would clip. */}
        <svg className="absolute inset-0 pointer-events-none z-[2]" width={layout.totalWidth} height={layout.totalHeight}>
          {endpoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.drop ? 2.1 : 1.55} fill={p.color} />
          ))}
        </svg>

        {/* Round headers are gone (spec 5.2). Every game carries its own
            number, time and field, a bracket's shape says which round it
            is, and the headers were the only thing crowding the captions
            that now sit above each card. */}

        {layout.bandCaptions.map((c, i) => (
          <div
            key={i}
            className={[
              "absolute text-[11px] font-bold uppercase tracking-wide pointer-events-none",
              c.x != null ? "text-afa-navy text-center" : "text-afa-muted",
            ].join(" ")}
            style={{
              left: c.x ?? 4,
              // FINAL sits UNDER its game: above it lands in the strip the
              // time-and-field field claims. The layout hands this caption
              // in 20px above its game, so the game's top is c.y + 20.
              top: c.x != null ? c.y + 20 + BOX_H + 7 : c.y,
              width: c.x != null ? CELL_W : LEFT_PAD - 12,
            }}
          >
            {c.label}
          </div>
        ))}

        {layout.cells
          .filter(({ round }) => ifRounds.has(round))
          .map(({ round, x, y }) => (
            <div
              key={`if-${round}`}
              className="absolute text-[11px] font-bold uppercase tracking-wide italic text-afa-muted text-center pointer-events-none"
              style={{ left: x, top: y + BOX_H + 7, width: CELL_W }}
            >
              {moot.has(round) ? "N/A \u2014 not needed" : "If necessary"}
            </div>
          ))}

        {layout.cells.map(({ round, game, x, y }) => {
          const role = focusRole(round);
          return (
          <div
            key={round}
            data-game-round={round}
            data-role={role || undefined}
            className="absolute cursor-pointer transition-opacity duration-200"
            // A followed team's games recede with everything else once a
            // game is in focus (JD, 2026-07-26). They keep their outline,
            // which at this opacity reads as a faint navy edge — enough to
            // see where their run sits without competing with the one
            // question the focus is answering.
            style={{
              left: x,
              top: y,
              width: CELL_W,
              // A game that will never be played sits back from the ones
              // that were — present on the sheet, plainly not pending.
              opacity: role === "dim" ? 0.22 : moot.has(round) && role == null ? 0.45 : 1,
            }}
            onClick={() =>
              onSelectGame ? onSelectGame(round) : setFocus((f) => (f === round ? null : round))
            }
          >
            {/* One game in focus, its two outcomes named. */}
            {role === "win" && <OutcomeTag>Winner</OutcomeTag>}
            {role === "lose" && <OutcomeTag color={loseTo?.color}>Loser</OutcomeTag>}
            {role === "focus" && isChampion && !onSelectGame && (
              <OutcomeTag color="var(--afa-red)">Champion</OutcomeTag>
            )}
            {conflictRounds?.has(round) && (
              <OutcomeTag color="var(--afa-red)">Field clash</OutcomeTag>
            )}
            <BracketMatchup
              game={game}
              division={division}
              caption={scheduleCaption(game)}
              order={layout.rowOrders[round]}
              badgeColor={showDrops ? badgeOf.get(round) : null}
              slotTint={
                showDrops
                  ? { 0: slotTintOf.get(`${round}:0`), 1: slotTintOf.get(`${round}:1`) }
                  : {}
              }
              resolveSeed={resolveSeed}
              seedTagFor={seedTagFor}
              ring={
                role === "focus"
                  ? "focus"
                  : role === "win" || role === "lose"
                  ? "dest"
                  : round === mine.next && role !== "dim"
                  ? "next"
                  : mine.rounds.has(round)
                  ? "mine"
                  : null
              }
            />
          </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
