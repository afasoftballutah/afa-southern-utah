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
  formatFieldTime,
} from "@/lib/bracket/tree";

// Pixel geometry for the tree. Each match is a UNIFORM solid block (cellW x
// cellH) holding two stacked team rows with a divider and a score strip on the
// right edge. rowH is the vertical step between sibling blocks; the empty gap
// (rowH - cellH) stays at most half a box height so the ladder reads dense, not
// airy (spec: "PACKED TIGHT"). The field/time line rides in that gap under each
// box. colGap is the fixed gutter between round columns; connector verticals sit
// at its midpoint and the game number rides there too (spec: "GAME NUMBERS RIDE
// THE ELBOWS"). Sizing contract: team text >=13px, NO transform:scale on screen
// (that was the marooning bug); scale survives only in the print wrapper below.
const DESKTOP = { cellW: 206, cellH: 40, rowH: 60, colGap: 40, topPad: 22, sideGap: 16, finalGap: 40, scoreW: 30 };
const MOBILE = { cellW: 196, cellH: 44, rowH: 66, colGap: 32, topPad: 20, sideGap: 14, finalGap: 30, scoreW: 28 };

function scaled(c, scale) {
  const out = {};
  for (const k in c) out[k] = c[k] * scale;
  return out;
}

// One full elbow feeder path: box right edge -> horizontal to the fixed
// mid-gutter -> vertical to the child's center line -> horizontal into the
// child's left edge. Square corners, one navy stroke. Two siblings feeding one
// child share midX, so their verticals land in the same gutter column and read
// as a single bracket join.
function elbowPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

/**
 * One match cell — a SOLID FILLED BLOCK (spec amendment 7/21, Challonge
 * structure in AFA color): white fill on the cream ground, 1px navy border,
 * ~3px corners, a thin interior divider between the two stacked team rows, and
 * a narrow divided score strip on the right edge. Uniform size everywhere so
 * edges align into clean columns; long names ellipsize inside. The If-Necessary
 * decider uses a dashed border while still unknown.
 *
 * Winner reads by weight (bold). Pending game leaves the score strip empty (no
 * 0-0 lies). W/L provenance placeholders live in the team rows in muted ink
 * (paper convention); the game NUMBER rides the connector, not the box (drawn
 * in canvasBody). Field/time renders in small muted type under the box.
 */
function MatchCell({ game, x, y, w, h, fontClass, dashed, numberByGameId, scoreW }) {
  if (!game) return null;
  const pending = game.status === "pending";
  const borderClass = dashed ? "border border-dashed border-afa-navy" : "border border-afa-navy";
  const fieldTime = formatFieldTime(game);

  let inner;
  if (game.is_bye) {
    // Bye: the advancing team only, no fake opponent row, no divider.
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    inner = (
      <div className="flex items-center h-full px-1.5">
        <span className={`font-bold truncate ${fontClass}`}>{name}</span>
      </div>
    );
  } else {
    const rows = [
      { ...slotDisplay(game, "team1", numberByGameId), score: game.team1_score, won: game.winner_slot === "team1" },
      { ...slotDisplay(game, "team2", numberByGameId), score: game.team2_score, won: game.winner_slot === "team2" },
    ];
    inner = (
      <div className="flex h-full">
        <div className="flex-1 min-w-0 flex flex-col">
          {rows.map((r, i) => (
            <div key={i} className={`flex-1 flex items-center px-1.5 min-w-0 ${i === 0 ? "border-b border-afa-navy/25" : ""}`}>
              <span
                className={`truncate ${fontClass} ${
                  r.won ? "font-bold" : r.resolved ? "font-normal" : "font-normal text-afa-muted"
                }`}
              >
                {r.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col border-l border-afa-navy/25 shrink-0" style={{ width: scoreW }}>
          {rows.map((r, i) => (
            <div key={i} className={`flex-1 flex items-center justify-center ${i === 0 ? "border-b border-afa-navy/25" : ""}`}>
              <span className={`tabular-nums text-[0.8em] ${r.won ? "font-bold text-afa-ink" : "text-afa-ink/70"}`}>
                {!pending && r.score != null ? r.score : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute"
      style={{ left: x, top: y, width: w }}
      title={
        game.is_bye
          ? undefined
          : `${slotDisplay(game, "team1", numberByGameId).text} vs ${slotDisplay(game, "team2", numberByGameId).text}`
      }
    >
      <div className={`bg-white rounded-[3px] overflow-hidden ${borderClass}`} style={{ height: h }}>
        {inner}
      </div>
      {fieldTime && <div className="text-[10px] leading-tight text-afa-muted truncate mt-0.5">{fieldTime}</div>}
    </div>
  );
}

/**
 * Draws one bracket_group ('main' or 'consolation') as a boxed tree: winners on
 * top, losers below, Grand Final + If-Necessary at the far right joining both,
 * champion cell past that. Pure layout from round/slot counts — see
 * lib/bracket/tree.js for why the halving/passthrough math needs no knowledge of
 * bracket size or seeding.
 *
 * Match cells are uniform filled blocks packed tight (spec amendment 7/21). The
 * navy 1px elbow connectors run box-edge to box-edge; siblings share one gutter
 * vertical so the elbows nest and the tree shape is legible from across the
 * room. The Grand Final joins both champions on a single shared vertical, short
 * and direct (no staircase orphans). Game numbers ride the connector midpoints,
 * not the boxes.
 *
 * SIZING CONTRACT: exactly ONE on-screen render at every viewport width — fixed
 * pixel blocks, no transform:scale, horizontal scroll if wider than the
 * container. `fit` adds a SECOND, print-only scaled-to-page variant.
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

    const leftPad = 2;
    const xForCol = (idx) => leftPad + idx * (C.cellW + C.colGap);
    const cellCenterY = (topY) => topY + C.cellH / 2;

    const winnersH = C.topPad * 2 + maxCenter(winners, centersW) * C.rowH + C.cellH;
    const losersH = losers.length ? C.topPad * 2 + maxCenter(losers, centersL) * C.rowH + C.cellH : 0;
    const losersYOffset = winnersH + (losers.length ? C.sideGap : 0);
    const totalMainH = losers.length ? winnersH + C.sideGap + losersH : winnersH;

    const cells = []; // { game, x, y, key }
    const connectors = []; // svg path `d` strings — continuous elbows
    const gameLabels = []; // { n, lx, cy } — game number riding the outgoing elbow
    const roundStops = []; // { x, label }
    const posByKey = new Map(); // `${side}-${round}-${slot}` -> { x, y, centerY }

    const addLabel = (g, x, centerY) => {
      const n = numberByGameId.get(g.id);
      if (n != null) gameLabels.push({ n, lx: x + C.cellW, cy: centerY });
    };

    function layoutSide(rounds, centers, yOffset, sideName) {
      rounds.forEach((r, idx) => {
        const x = xForCol(idx);
        if (sideName === "winners") roundStops.push({ x, label: `R${idx + 1}` });
        r.games.forEach((g) => {
          const center = centers.get(`${r.round}-${g.slot}`) ?? 0;
          const y = C.topPad + center * C.rowH + yOffset;
          const key = `${sideName}-${r.round}-${g.slot}`;
          const cy = cellCenterY(y);
          posByKey.set(key, { x, y, centerY: cy });
          cells.push({ game: g, x, y, key });
          addLabel(g, x, cy);
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

    // Final block: to the right of whichever side reaches furthest, vertically
    // centered on the combined winners+losers block.
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
      addLabel(gf1, x, finalCenterY);
      // Winners champ and losers champ meet on ONE shared vertical just left of
      // the Grand Final, then a single horizontal runs in — short and direct.
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
      addLabel(gf2, x, finalCenterY);
      connectors.push(`M ${finalX0 + C.cellW} ${finalCenterY} H ${x}`);
      lastFinalRightX = x + C.cellW;
    }
    roundStops.push({ x: finalX0, label: "GF" });

    const championX = lastFinalRightX + C.finalGap;
    const { championName } = computeChampion(games);
    connectors.push(`M ${lastFinalRightX} ${finalCenterY} H ${championX}`);

    const totalWidth = championX + C.cellW * 1.4 + 24;
    const totalHeight = Math.max(totalMainH, finalCenterY * 2) + 12;

    // Tiny muted section captions — sit inside each side's own topPad gap.
    const capH = isMobile ? 10 : 11;
    const captions = [];
    if (winners.length) captions.push({ x: leftPad, y: Math.max(0, C.topPad * 0.15), label: "Winners" });
    if (losers.length) captions.push({ x: leftPad, y: losersYOffset + Math.max(0, C.topPad * 0.15), label: "Losers" });
    if (gf1 || gf2) captions.push({ x: finalX0, y: Math.max(0, finalCenterY - C.cellH / 2 - capH), label: "Final" });

    return { cells, connectors, gameLabels, finalCells, championX, championY: finalCenterY, championName, totalWidth, totalHeight, roundStops, captions };
  }, [games, C, isMobile, numberByGameId]);

  function jumpTo(x) {
    scrollRef.current?.scrollTo({ left: Math.max(0, x - 12), behavior: "smooth" });
  }

  // PRINT-ONLY fit-to-page. Confined to print (sizing contract #3); the
  // on-screen view stays fixed-size + scroll. setFitScale only runs inside the
  // ResizeObserver callback, never synchronously in the effect body.
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
      {/* Game numbers ride the connector midpoint in the gutter to each box's
          right, above the outgoing line (spec: "GAME NUMBERS RIDE THE ELBOWS"). */}
      {layout.gameLabels.map((g, i) => (
        <div
          key={i}
          className="absolute text-[9px] leading-none text-afa-muted tabular-nums text-center pointer-events-none"
          style={{ left: g.lx, top: g.cy - 12, width: C.colGap }}
        >
          G{g.n}
        </div>
      ))}
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
        <MatchCell key={key} game={game} x={x} y={y} w={C.cellW} h={C.cellH} fontClass={fontClass} numberByGameId={numberByGameId} scoreW={C.scoreW} />
      ))}
      {layout.finalCells.map(({ game, x, y, dashed }) => (
        <MatchCell key={game.id} game={game} x={x} y={y} w={C.cellW} h={C.cellH} fontClass={fontClass} dashed={dashed} numberByGameId={numberByGameId} scoreW={C.scoreW} />
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

  // The ONE on-screen render. Full-bleed breakout so the scroll band spans the
  // full viewport width — otherwise the tree is trapped (and clipped) inside the
  // page's max-w content column. Horizontal scroll still engages on genuinely
  // narrow screens. Hidden in print; print gets its own scaled variant below.
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
      <div ref={scrollRef} className="overflow-x-auto relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
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
      {/* Print-only scaled-to-page variant (sizing contract #3) — never shown on
          screen (`hidden print:block`). Breaks out to full viewport width first
          so there's real room to scale into. */}
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
