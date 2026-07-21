"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  splitSides,
  computeCenters,
  maxCenter,
  computeChampion,
  isGf2Dashed,
  assignGameNumbers,
  slotDisplay,
} from "@/lib/bracket/tree";

// Pixel geometry for the tree. The two team rows of a match are a TIGHT
// pair (a few px apart, reading as one slot), so cellH is just tall enough
// for two ~13px lines. rowH is the vertical step between sibling matches and
// leaves room under each pair for the field/time line. colGap is the fixed
// gutter between round columns; the connector verticals sit at its midpoint
// so every elbow lines up in the same column (a clean nested bracket). numberW
// is the small left gutter for the muted "G7" game-number label so it never
// eats into the name column's width budget (sizing contract #1: name col
// 180-220px, team text >=13px, NO transform:scale on screen — that was the
// marooning bug; scale survives only in the print wrapper below).
const DESKTOP = { cellW: 208, cellH: 40, rowH: 60, colGap: 40, topPad: 24, sideGap: 18, finalGap: 40, numberW: 22 };
const MOBILE = { cellW: 196, cellH: 42, rowH: 66, colGap: 32, topPad: 22, sideGap: 16, finalGap: 30, numberW: 20 };

function scaled(c, scale) {
  const out = {};
  for (const k in c) out[k] = c[k] * scale;
  return out;
}

// One full elbow feeder path: from a match's right edge (x1,y1), a horizontal
// run to the fixed mid-gutter, a vertical to the child's center line, then one
// horizontal into the child's left edge (x2,y2). Square corners, one stroke.
// Two siblings feeding the same child share midX, so their verticals land in
// the same gutter column and read as a single bracket join.
function elbowPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

function formatFieldTime(game) {
  const parts = [];
  if (game.scheduled_time) {
    const d = new Date(game.scheduled_time);
    parts.push(
      d.toLocaleDateString("en-US", { weekday: "short" }) +
        " " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }
  if (game.field) parts.push(game.field);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * One match cell — a TIGHT two-row team pair (spec: rows sit adjacent, read as
 * one slot pair, not two floating lines). No card/box except the If-Necessary
 * decider while it's still dashed-unknown.
 *
 * The pair box is exactly cellH tall and is top-anchored at `y`, so the
 * connector always attaches at its true vertical center (y + cellH/2) — the
 * field/time line flows BELOW the pair and never shifts that center.
 *
 * THE PAPER CONVENTION (JD ruling 7/21): every game carries its number (small,
 * muted, in its own left gutter). Every unfilled slot shows its provenance
 * placeholder ("W2"/"L3"/"awaiting team") in muted ink exactly where the real
 * name will land, via slotDisplay. Field + time render under every game from
 * generation, not gated on the game being pending.
 */
function MatchCell({ game, x, y, w, h, fontClass, dashed, numberByGameId, numberW }) {
  if (!game) return null;
  const pending = game.status === "pending";
  const box = dashed ? "border border-dashed border-afa-muted rounded px-1" : "";
  const gameNumber = numberByGameId?.get(game.id);
  const fieldTime = formatFieldTime(game);

  let pair;
  if (game.is_bye) {
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    pair = (
      <div className="flex flex-col justify-center" style={{ height: h }}>
        <span className={`font-bold truncate ${fontClass}`}>{name}</span>
      </div>
    );
  } else {
    const rows = [
      { ...slotDisplay(game, "team1", numberByGameId), score: game.team1_score, won: game.winner_slot === "team1" },
      { ...slotDisplay(game, "team2", numberByGameId), score: game.team2_score, won: game.winner_slot === "team2" },
    ];
    pair = (
      <div className="flex flex-col justify-center" style={{ height: h, gap: 3 }}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline gap-2 min-w-0 leading-tight">
            <span
              className={`truncate flex-1 min-w-0 ${fontClass} ${
                r.won ? "font-bold" : r.resolved ? "font-normal" : "font-normal text-afa-muted"
              }`}
            >
              {r.text}
            </span>
            <span className="tabular-nums text-afa-ink/60 text-[0.85em] shrink-0 text-right" style={{ minWidth: "1.6em" }}>
              {!pending && r.score != null ? r.score : ""}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="absolute"
      style={{ left: x - numberW, top: y, width: w + numberW }}
      title={
        game.is_bye
          ? undefined
          : `${slotDisplay(game, "team1", numberByGameId).text} vs ${slotDisplay(game, "team2", numberByGameId).text}`
      }
    >
      <div className="flex items-start gap-1">
        {gameNumber != null && (
          <div className="shrink-0" style={{ width: numberW - 2, paddingTop: 2 }} aria-hidden="true">
            <span className="text-[9px] leading-none text-afa-muted tabular-nums">G{gameNumber}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {/* bg-afa-cream masks any connector hairline that passes behind the
              text; the cream is the page background, so it stays invisible. */}
          <div className={`bg-afa-cream ${box}`}>{pair}</div>
          {fieldTime && <div className="text-[0.7em] text-afa-muted truncate mt-0.5 bg-afa-cream">{fieldTime}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Draws one bracket_group ('main' or 'consolation') as a tree: winners on top,
 * losers below, Grand Final + If-Necessary at the far right joining both,
 * champion cell past that. Pure layout from round/slot counts — see
 * lib/bracket/tree.js for why the halving/passthrough math needs no knowledge
 * of bracket size or seeding.
 *
 * CONNECTOR STRUCTURE (JD ruling 7/21 vs the Challonge reference): the lines
 * must DRAW the bracket. Every feeder is a full elbow path (right edge ->
 * mid-gutter -> vertical join to its sibling -> into the child's left edge),
 * continuous 1px NAVY hairlines with square corners, no stubs, no orphans. The
 * two siblings of every child share one gutter column so the elbows nest and
 * the tree shape is legible from across the room. The Final joins short and
 * direct on a single shared vertical (sizing contract #4: no staircase orphans).
 *
 * SIZING CONTRACT (REPLACES scale-to-fit; that was the marooning bug, twice):
 * exactly ONE on-screen render at every viewport width — fixed pixel cells, no
 * transform:scale, horizontal scroll if wider than the container. `fit` adds a
 * SECOND, print-only scaled-to-page variant (`hidden print:block`); it never
 * changes what's on screen.
 */
export default function TreeCanvas({ games, scale = 1, isMobile = false, showRoundStrip = false, fit = false }) {
  const scrollRef = useRef(null);
  const base = isMobile ? MOBILE : DESKTOP;
  const C = useMemo(() => scaled(base, scale), [base, scale]);
  const fontClass = isMobile ? "text-[12px]" : "text-[13px]";
  const numberByGameId = useMemo(() => assignGameNumbers(games), [games]);

  const layout = useMemo(() => {
    const { winners, losers, final } = splitSides(games);
    const centersW = computeCenters(winners);
    const centersL = computeCenters(losers);

    // Every match box extends numberW to the LEFT of its "x" (the game-number
    // gutter) — round 1's column needs a left pad of exactly that much or its
    // gutter renders at a negative coordinate and gets clipped.
    const leftPad = C.numberW;
    const xForCol = (idx) => leftPad + idx * (C.cellW + C.colGap);
    const cellCenterY = (topY) => topY + C.cellH / 2;

    const winnersH = C.topPad * 2 + maxCenter(winners, centersW) * C.rowH + C.cellH;
    const losersH = losers.length ? C.topPad * 2 + maxCenter(losers, centersL) * C.rowH + C.cellH : 0;
    const losersYOffset = winnersH + (losers.length ? C.sideGap : 0);
    const totalMainH = losers.length ? winnersH + C.sideGap + losersH : winnersH;

    const cells = []; // { game, x, y, key }
    const connectors = []; // svg path `d` strings — continuous elbows
    const roundStops = []; // { x, label }
    const posByKey = new Map(); // `${side}-${round}-${slot}` -> { x, y, centerY }

    function layoutSide(rounds, centers, yOffset, sideName) {
      rounds.forEach((r, idx) => {
        const x = xForCol(idx);
        if (sideName === "winners") roundStops.push({ x, label: `R${idx + 1}` });
        r.games.forEach((g) => {
          const center = centers.get(`${r.round}-${g.slot}`) ?? 0;
          const y = C.topPad + center * C.rowH + yOffset;
          const key = `${sideName}-${r.round}-${g.slot}`;
          posByKey.set(key, { x, y, centerY: cellCenterY(y) });
          cells.push({ game: g, x, y, key });
        });
        if (idx > 0) {
          const prev = rounds[idx - 1];
          r.games.forEach((g) => {
            const ratio = r.games.length / prev.games.length;
            const cur = posByKey.get(`${sideName}-${r.round}-${g.slot}`);
            const feeders = ratio === 1 ? [g.slot] : [g.slot * 2, g.slot * 2 + 1];
            feeders.forEach((slot) => {
              const p = prev.games.find((x2) => x2.slot === slot);
              if (!p) return;
              const pp = posByKey.get(`${sideName}-${prev.round}-${p.slot}`);
              connectors.push(elbowPath(pp.x + C.cellW, pp.centerY, cur.x, cur.centerY));
            });
          });
        }
      });
    }

    layoutSide(winners, centersW, 0, "winners");
    layoutSide(losers, centersL, losersYOffset, "losers");

    // Final block: sits to the right of whichever side reaches furthest,
    // vertically centered on the combined winners+losers block.
    const winnersRightX = winners.length ? xForCol(winners.length - 1) + C.cellW : 0;
    const losersRightX = losers.length ? xForCol(losers.length - 1) + C.cellW : 0;
    const finalX0 = Math.max(winnersRightX, losersRightX) + C.finalGap;
    const finalCenterY = totalMainH / 2;

    const [gf1, gf2] = final;
    const finalCells = [];
    if (gf1) {
      const x = finalX0;
      const y = finalCenterY - C.cellH / 2;
      finalCells.push({ game: gf1, x, y });
      // Winners champ and losers champ meet on ONE shared vertical just left
      // of the Grand Final, then a single horizontal runs into it — short and
      // direct, no staircase (sizing contract #4).
      const joinX = finalX0 - C.finalGap / 2;
      const wLast = winners.length ? winners[winners.length - 1].games[0] : null;
      const lLast = losers.length ? losers[losers.length - 1].games[0] : null;
      const wp = wLast ? posByKey.get(`winners-${winners[winners.length - 1].round}-${wLast.slot}`) : null;
      const lp = lLast ? posByKey.get(`losers-${losers[losers.length - 1].round}-${lLast.slot}`) : null;
      if (wp && lp) {
        connectors.push(`M ${wp.x + C.cellW} ${wp.centerY} H ${joinX} V ${finalCenterY} H ${x}`);
        connectors.push(`M ${lp.x + C.cellW} ${lp.centerY} H ${joinX} V ${finalCenterY}`);
      } else if (wp) {
        connectors.push(`M ${wp.x + C.cellW} ${wp.centerY} H ${joinX} V ${finalCenterY} H ${x}`);
      } else if (lp) {
        connectors.push(`M ${lp.x + C.cellW} ${lp.centerY} H ${joinX} V ${finalCenterY} H ${x}`);
      }
    }
    let lastFinalRightX = gf1 ? finalX0 + C.cellW : finalX0;
    if (gf2) {
      const x = finalX0 + C.cellW + C.colGap;
      const y = finalCenterY - C.cellH / 2;
      finalCells.push({ game: gf2, x, y, dashed: isGf2Dashed(gf1) });
      connectors.push(`M ${finalX0 + C.cellW} ${finalCenterY} H ${x}`);
      lastFinalRightX = x + C.cellW;
    }
    roundStops.push({ x: finalX0, label: "GF" });

    const championX = lastFinalRightX + C.finalGap;
    const { championName } = computeChampion(games);
    connectors.push(`M ${lastFinalRightX} ${finalCenterY} H ${championX}`);

    const totalWidth = championX + C.cellW * 1.4 + 24;
    const totalHeight = Math.max(totalMainH, finalCenterY * 2) + 12;

    // Tiny muted section captions — sit inside each side's own topPad gap,
    // never adding extra height of their own.
    const capH = isMobile ? 10 : 11;
    const captions = [];
    if (winners.length) captions.push({ x: 0, y: Math.max(0, C.topPad * 0.15), label: "Winners" });
    if (losers.length) captions.push({ x: 0, y: losersYOffset + Math.max(0, C.topPad * 0.15), label: "Losers" });
    if (gf1 || gf2) captions.push({ x: finalX0, y: Math.max(0, finalCenterY - C.cellH / 2 - capH), label: "Final" });

    return { cells, connectors, finalCells, championX, championY: finalCenterY, championName, totalWidth, totalHeight, roundStops, captions };
  }, [games, C, isMobile]);

  function jumpTo(x) {
    scrollRef.current?.scrollTo({ left: Math.max(0, x - 12), behavior: "smooth" });
  }

  // PRINT-ONLY fit-to-page: measure the full-bleed wrapper and scale the tree
  // so it fills ~90% of that width. Confined to print (sizing contract #3);
  // the on-screen view stays fixed-size + scroll. setFitScale only runs inside
  // the ResizeObserver callback, never synchronously in the effect body.
  const fitWrapRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  useLayoutEffect(() => {
    if (!fit || !fitWrapRef.current) return undefined;
    const el = fitWrapRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && layout.totalWidth > 0) {
        const target = (w * 0.9) / layout.totalWidth;
        setFitScale(Math.min(3, Math.max(0.35, target)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, layout.totalWidth]);

  const canvasBody = (
    <>
      <svg className="absolute inset-0 pointer-events-none bracket-connectors" width={layout.totalWidth} height={layout.totalHeight}>
        {layout.connectors.map((d, i) => (
          <path key={i} d={d} stroke="var(--afa-navy)" strokeWidth={1} fill="none" shapeRendering="crispEdges" />
        ))}
      </svg>
      {layout.captions.map((c, i) => (
        <div
          key={i}
          className="absolute text-[9px] font-semibold uppercase tracking-wide text-afa-muted pointer-events-none"
          style={{ left: c.x, top: c.y }}
        >
          {c.label}
        </div>
      ))}
      {layout.cells.map(({ game, x, y, key }) => (
        <MatchCell key={key} game={game} x={x} y={y} w={C.cellW} h={C.cellH} fontClass={fontClass} numberByGameId={numberByGameId} numberW={C.numberW} />
      ))}
      {layout.finalCells.map(({ game, x, y, dashed }) => (
        <MatchCell key={game.id} game={game} x={x} y={y} w={C.cellW} h={C.cellH} fontClass={fontClass} dashed={dashed} numberByGameId={numberByGameId} numberW={C.numberW} />
      ))}
      {/* Champion cell — the tree's one appearance of the Anton display face. */}
      <div
        className="absolute flex items-center"
        style={{ left: layout.championX, top: layout.championY - C.cellH / 2, width: C.cellW * 1.4, minHeight: C.cellH }}
      >
        <span className={`font-display text-afa-navy truncate ${isMobile ? "text-base" : "text-lg"}`}>
          {layout.championName || "—"}
        </span>
      </div>
    </>
  );

  // The ONE on-screen render, every viewport width, no transform:scale — fixed
  // pixel cells, horizontal scroll if wider than the container. Hidden in
  // print; print gets its own scaled variant below when `fit` is set.
  const screenBody = (
    <div className="print:hidden">
      {showRoundStrip && (
        <div className="flex gap-3 text-[11px] font-semibold text-afa-navy/70 mb-2 px-1 print:hidden">
          {layout.roundStops.map((s, i) => (
            <button key={i} type="button" onClick={() => jumpTo(s.x)} className="hover:text-afa-navy underline decoration-dotted">
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight }}>
          {canvasBody}
        </div>
      </div>
    </div>
  );

  if (!fit) return screenBody;

  return (
    <>
      {screenBody}
      {/* Print-only scaled-to-page variant (sizing contract #3) — never shown
          on screen (`hidden print:block`), so it can't maroon the on-screen
          tree the way the old always-on fit render did. Breaks out to full
          viewport width first so there's real room to scale into. */}
      <div className="hidden print:block relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6 sm:px-10 print:w-full print:left-0 print:right-0 print:mx-0 print:px-0">
        <div ref={fitWrapRef} style={{ width: "100%", height: layout.totalHeight * fitScale, overflow: "hidden" }}>
          <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight, transform: `scale(${fitScale})`, transformOrigin: "top left" }}>
            {canvasBody}
          </div>
        </div>
      </div>
    </>
  );
}
