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
const BOX_H = 124;
const HEADER_H = 26;
const TOP_PAD = 16;
const LEFT_PAD = 72; // reserved margin for the Winners/Losers/Final captions
const BAND_GAP = 56; // tight vertical gap between the winners and losers bands
const MIN_GAP = 1; // row units — the "clear gap" floor between two games in one column

function parseSlots(game, byRound) {
  return ["team1_name", "team2_name"].map((slot) => {
    const m = FEED_RE.exec(game?.[slot] ?? "");
    if (m && byRound.has(Number(m[2]))) return { type: m[1], round: Number(m[2]) };
    return null;
  });
}
function feedersOf(game, byRound) {
  return parseSlots(game, byRound)
    .filter(Boolean)
    .map((s) => s.round);
}

// Column (x) = longest-path depth from the feed graph, memoised DFS. A
// game with no feed slots is depth 0; otherwise 1 + max(feeder depths).
// This is band-blind on purpose — a losers game's column comes only from
// its feeders' columns, never adjusted to align with a band. Returns null
// if a cycle is detected (malformed data) so the caller can bail to the
// fallback list rather than looping forever.
function computeDepths(byRound) {
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
    const feeders = feedersOf(byRound.get(round), byRound);
    const d = feeders.length === 0 ? 0 : 1 + Math.max(...feeders.map(depth));
    visiting.delete(round);
    memo.set(round, d);
    return d;
  }
  for (const round of byRound.keys()) depth(round);
  return cycle ? null : memo;
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
function computeBands(byRound, depthByRound) {
  const rounds = [...byRound.keys()].sort((a, b) => depthByRound.get(a) - depthByRound.get(b) || a - b);
  const band = new Map();
  for (const r of rounds) {
    const slots = parseSlots(byRound.get(r), byRound);
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
function computeBandRows(byRound, depthByRound, band, bandName) {
  const bandRounds = [...byRound.keys()].filter((r) => band.get(r) === bandName);
  const ordered = [...bandRounds].sort((a, b) => depthByRound.get(a) - depthByRound.get(b) || a - b);
  const rowByRound = new Map();
  const placedByColumn = new Map();
  let rootCounter = 0;
  for (const r of ordered) {
    const bandFeeders = feedersOf(byRound.get(r), byRound).filter((f) => band.get(f) === bandName);
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

// A Y band clear of every box in the given intervening columns, closest
// to preferY. A connector whose target is more than one column ahead of
// its feeder (a cross-depth feed — the whole reason tree.js can't draw
// these brackets) must jog through a trunk Y that clears every column it
// passes over, or its line would be drawn straight through an unrelated
// box. Returns null only if no such band exists anywhere; the caller then
// routes below the whole diagram instead.
function findClearBand(depths, preferY, rects) {
  if (depths.length === 0) return preferY;
  const ys = rects.flatMap((r) => [r.y, r.y + BOX_H]);
  const lo = Math.min(...ys) - 400;
  const hi = Math.max(...ys) + 400;
  let candidate = [[-Infinity, Infinity]];
  for (const d of depths) {
    const boxes = rects.filter((r) => r.depth === d).sort((a, b) => a.y - b.y);
    const bands = [];
    let cursor = lo;
    for (const b of boxes) {
      if (b.y > cursor) bands.push([cursor, b.y]);
      cursor = Math.max(cursor, b.y + BOX_H);
    }
    bands.push([cursor, hi]);
    const next = [];
    for (const [cs, ce] of candidate) {
      for (const [bs, be] of bands) {
        const s = Math.max(cs, bs);
        const e = Math.min(ce, be);
        if (s < e) next.push([s, e]);
      }
    }
    candidate = next;
  }
  if (candidate.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const [s, e] of candidate) {
    const y = Math.min(Math.max(preferY, s), e);
    const dist = Math.abs(y - preferY);
    if (dist < bestDist) {
      bestDist = dist;
      best = y;
    }
  }
  return best;
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
  for (const g of real) byRound.set(g.round, g);

  const depthByRound = computeDepths(byRound);
  if (!depthByRound) return { cycle: true };

  const rounds = [...byRound.keys()];
  const maxDepth = Math.max(...rounds.map((r) => depthByRound.get(r)));
  const band = computeBands(byRound, depthByRound);

  const winnersRows = computeBandRows(byRound, depthByRound, band, "winners");
  const losersRows = computeBandRows(byRound, depthByRound, band, "losers");

  const winnersTop = TOP_PAD + HEADER_H;
  const winnersMaxRow = winnersRows.size ? Math.max(...winnersRows.values()) : 0;
  const winnersHeight = winnersRows.size ? (winnersMaxRow + 1) * ROW_UNIT_H : 0;
  const losersTop = winnersTop + winnersHeight + (losersRows.size ? BAND_GAP : 0);

  const rectByRound = new Map();
  for (const [r, row] of winnersRows) {
    rectByRound.set(r, { round: r, depth: depthByRound.get(r), x: xForCol(depthByRound.get(r)), y: winnersTop + row * ROW_UNIT_H, band: "winners" });
  }
  for (const [r, row] of losersRows) {
    rectByRound.set(r, { round: r, depth: depthByRound.get(r), x: xForCol(depthByRound.get(r)), y: losersTop + row * ROW_UNIT_H, band: "losers" });
  }

  // FINAL: positioned at its own depth column (columns stay depth-based
  // for every band), vertically on the midpoint of its two feeders'
  // actual pixel centers — the winners champion and the losers champion.
  // The if-necessary decider (both feeds pointing at the same prior FINAL
  // round) inherits that round's Y exactly, same as a normal bracket's
  // GF2 sitting on GF1's line.
  const finalRounds = rounds.filter((r) => band.get(r) === "final").sort((a, b) => depthByRound.get(a) - depthByRound.get(b));
  for (const r of finalRounds) {
    const slots = parseSlots(byRound.get(r), byRound).filter(Boolean);
    const sameRound = slots.length === 2 && slots[0].round === slots[1].round;
    let y;
    if (sameRound) {
      y = rectByRound.get(slots[0].round).y;
    } else {
      const centers = slots.map((s) => rectByRound.get(s.round).y + BOX_H / 2);
      y = centers.reduce((a, b) => a + b, 0) / centers.length - BOX_H / 2;
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

  // Connectors: box-edge to box-edge, one per feed relationship. Adjacent
  // columns (the common case) collapse this to the spec's simple 3-segment
  // elbow — feeder's right edge, horizontal to mid-gutter, vertical,
  // horizontal into the fed box's left edge — because the trunk jog lands
  // in the same single gutter for both jump points. This is also exactly
  // what draws a drop-down: a winners-band game's LOSER feeding a losers-
  // band game is just a connector whose two endpoints happen to sit in
  // different bands, so the vertical run naturally spans the band gap. A
  // feed that skips a column jogs through a clear trunk band instead of
  // drawing straight through whatever sits in the column it passes over.
  const connectors = [];
  for (const r of rounds) {
    const target = rectByRound.get(r);
    for (const f of feedersOf(byRound.get(r), byRound)) {
      const source = rectByRound.get(f);
      const x1 = source.x + CELL_W;
      const y1 = source.y + BOX_H / 2;
      const x2 = target.x;
      const y2 = target.y + BOX_H / 2;
      const interveningDepths = [];
      for (let d = source.depth + 1; d < target.depth; d++) interveningDepths.push(d);
      const preferY = (y1 + y2) / 2;
      let trunkY = findClearBand(interveningDepths, preferY, rects);
      if (trunkY == null) {
        trunkY = maxY + 60;
        maxY = trunkY + 40;
      }
      const gx1 = x1 + GUTTER / 2;
      const gx2 = x2 - GUTTER / 2;
      connectors.push(`M ${x1} ${y1} H ${gx1} V ${trunkY} H ${gx2} V ${y2} H ${x2}`);
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
    const firstFinal = rectByRound.get(finalRounds[0]);
    bandCaptions.push({ y: firstFinal.y, label: "Final" });
  }

  return {
    cells: rects.map((r) => ({ round: r.round, game: byRound.get(r.round), x: r.x, y: r.y, band: r.band })),
    connectors,
    headers,
    bandCaptions,
    totalWidth: maxX + TOP_PAD,
    totalHeight: maxY + TOP_PAD,
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
            style={{ left: 4, top: c.y, width: LEFT_PAD - 12 }}
          >
            {c.label}
          </div>
        ))}
        {layout.cells.map(({ round, game, x, y }) => (
          <div key={round} data-game-round={round} className="absolute" style={{ left: x, top: y, width: CELL_W }}>
            <Matchup
              caption={compactCaption(game)}
              team1={game.team1_name}
              team2={game.team2_name}
              score1={game.team1_score}
              score2={game.team2_score}
              isFinal={game.status === "final"}
              className="[&>p]:whitespace-nowrap [&>p]:overflow-hidden [&>p]:text-ellipsis"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
