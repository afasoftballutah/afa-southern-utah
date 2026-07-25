"use client";

import { useMemo } from "react";
import Matchup from "@/components/ui/Matchup";
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

  // Slide seed-fed games as late as they can go (JD, 2026-07-25: "if there
  // is a gap in the round ahead of the matchup, move the matchup to that
  // round so all the branches are short").
  //
  // Why only seed-fed games: their inputs are TEXT ([A #1]), not drawn
  // lines, so moving one rightward costs nothing and shortens its outgoing
  // branch. A game fed by other GAMES cannot move without lengthening its
  // own incoming connectors by exactly what it saves — no net gain, so
  // those stay put, adjacent to their deepest feeder.
  //
  // Gold's Game 2 is the case that motivated this: seed-fed, sitting in
  // column 0, throwing a long line across an empty column to Game 7.
  // Only DRAWN consumers constrain the slide. A loser drop is not inked
  // (see drawnFeedersOf), so it produces no line — yet counting it here
  // pinned games in place for the sake of an invisible edge. Gold's Game 4
  // is the case: its winner feeds Game 8 two columns right, but its loser
  // feeds Game 6 one column right, so the min-over-consumers held it at
  // column 0 and its connector then had to cross the whole of column 1 —
  // colliding with the traffic in that gutter (JD, 2026-07-25: "the lines
  // are crossing again").
  const consumers = new Map(); // round -> [rounds it feeds WITH A LINE]
  for (const round of byRound.keys()) {
    for (const f of drawnFeedersOf(byRound.get(round), byRound, roundByGameId)) {
      if (!consumers.has(f)) consumers.set(f, []);
      consumers.get(f).push(round);
    }
  }
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 20) {
    moved = false;
    for (const round of byRound.keys()) {
      // Only games with NO DRAWN INCOMING LINE may slide. Their inputs are
      // text (a seed, or a loser-drop that isn't inked), so moving them
      // costs nothing. A game fed by a drawn line cannot move without
      // lengthening that line by exactly what it saves — and sliding
      // everything, as an earlier pass did, drags the whole bracket right
      // and empties the first columns entirely.
      if (drawnFeedersOf(byRound.get(round), byRound, roundByGameId).length > 0) continue;
      const outs = consumers.get(round) ?? [];
      if (outs.length === 0) continue; // feeds nothing (a final) — leave it
      const latest = Math.min(...outs.map((r) => memo.get(r))) - 1;
      if (latest > memo.get(round)) {
        memo.set(round, latest);
        moved = true;
      }
    }
  }
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
  const bandRounds = [...byRound.keys()].filter((r) => band.get(r) === bandName);
  const ordered = [...bandRounds].sort((a, b) => depthByRound.get(a) - depthByRound.get(b) || a - b);
  const rowByRound = new Map();
  const placedByColumn = new Map();
  let rootCounter = 0;
  for (const r of ordered) {
    const bandFeeders = feedersOf(byRound.get(r), byRound, roundByGameId).filter((f) => band.get(f) === bandName);
    let row;
    if (bandFeeders.length === 0) {
      row = rootCounter;
      rootCounter += 1;
    } else {
      const feederRows = bandFeeders.map((f) => rowByRound.get(f));
      row =
        feederRows.length === 1 ? feederRows[0] : feederRows.reduce((a, b) => a + b, 0) / feederRows.length;
    }
    const d = depthByRound.get(r);
    if (!placedByColumn.has(d)) placedByColumn.set(d, []);
    const placed = placedByColumn.get(d);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of placed) {
        if (Math.abs(row - p.row) < MIN_GAP) {
          const nudged = p.row + MIN_GAP;
          if (nudged > row) {
            row = nudged;
            changed = true;
          }
        }
      }
    }
    placed.push({ round: r, row });
    rowByRound.set(r, row);
  }
  return rowByRound;
}

function xForCol(depth) {
  return LEFT_PAD + depth * (CELL_W + GUTTER);
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
        continue;
      }

      if (target.depth === source.depth + 1) {
        // Rule 2 — adjacent columns, the standard 3-segment elbow. The
        // single gutter between the two columns is the only place a
        // vertical can go, so there is no clearance search to run.
        const gx = Math.round(x1 + GUTTER / 2);
        connectors.push(`M ${x1} ${Math.round(y1)} H ${gx} V ${Math.round(y2)} H ${x2}`);
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

export default function DrawnBracket({ games }) {
  const layout = useMemo(() => computeLayout(games), [games]);

  if (!layout || layout.cycle) {
    if (layout?.cycle) {
      console.error("DrawnBracket: cycle detected in the feed graph — rendering the list instead.");
    }
    return <FallbackList games={games} />;
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight }}>
        <svg className="absolute inset-0 pointer-events-none" width={layout.totalWidth} height={layout.totalHeight}>
          {layout.connectors.map((d, i) => (
            <path key={i} d={d} stroke="var(--afa-navy)" strokeWidth={1} fill="none" shapeRendering="crispEdges" />
          ))}
        </svg>
        {layout.headers.map((h, i) => (
          <div
            key={i}
            className="absolute font-display text-afa-navy text-[13px] tracking-wide text-center pointer-events-none"
            style={{ left: h.x, top: 0, width: h.w, height: HEADER_H }}
          >
            {h.label}
          </div>
        ))}
        {layout.bandCaptions.map((c, i) => (
          <div
            key={i}
            className="absolute text-[11px] font-bold uppercase tracking-wide text-afa-muted pointer-events-none"
            style={{
              left: c.x ?? 4,
              top: c.y,
              width: c.x != null ? CELL_W : LEFT_PAD - 12,
            }}
          >
            {c.label}
          </div>
        ))}
        {layout.cells.map(({ round, game, x, y }) => (
          <div key={round} data-game-round={round} className="absolute" style={{ left: x, top: y, width: CELL_W }}>
            {/* No caption prop — the game unit is the two-pill Matchup
                alone (spec law 2, 2026-07-22). The caption renders below,
                as its own element, outside every centering/connector calc
                above: it occupies the gap beneath the box without ever
                shifting the box's center or a connector's endpoint. */}
            <Matchup
              team1={game.team1_name}
              team2={game.team2_name}
              score1={game.team1_score}
              score2={game.team2_score}
              isFinal={game.status === "final"}
              className="[&>p]:whitespace-nowrap [&>p]:overflow-hidden [&>p]:text-ellipsis"
            />
            <p
              data-game-caption={round}
              className="mt-1 text-[11px] font-bold uppercase tracking-wide text-afa-muted whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {compactCaption(game)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
