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

// Desktop and mobile pixel constants for the tree geometry. Mobile columns
// are wide on purpose — a phone panning sideways should land roughly one
// round at a time, not a jumble of half-columns (spec: "cells sized so one
// full round is visible per screen-width") — untouched by the 7/21 scale
// pass, which is a desktop/fill-width ruling (HELD: phone pan unchanged).
// Desktop cellW widened and sideGap halved per Lacy's 7/21 scale-fix ruling
// (name column gets width budget before truncating; the winners/losers gap
// was taller than the brackets themselves). numberW is the small gutter for
// the muted "G7" game-number label the paper convention adds to every cell.
const DESKTOP = { cellW: 240, cellH: 44, rowH: 58, colGap: 36, topPad: 22, sideGap: 24, finalGap: 44, numberW: 18 };
const MOBILE = { cellW: 210, cellH: 48, rowH: 64, colGap: 24, topPad: 20, sideGap: 20, finalGap: 28, numberW: 16 };

function scaled(c, scale) {
  const out = {};
  for (const k in c) out[k] = c[k] * scale;
  return out;
}

function elbow(x1, y1, x2, y2) {
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
 * One match cell — game number + team pair + score, no card/box (except
 * the If-Necessary decider while it's still dashed-unknown).
 *
 * THE PAPER CONVENTION (JD ruling 7/21): every game carries its number
 * (small, muted, in its own gutter left of the name column — doesn't eat
 * into the name column's width budget). Every unfilled slot shows its
 * provenance placeholder ("W2"/"L3"/"awaiting team") in muted ink exactly
 * where the real name will land, via slotDisplay — replaced in place once
 * known. Field + time render under every game from generation (whatever
 * the DB already has for that slot), not gated on the game being pending —
 * the schedule doesn't wait on who won.
 */
function MatchCell({ game, x, y, w, h, fontClass, dashed, numberByGameId, numberW }) {
  if (!game) return null;
  const pending = game.status === "pending";
  const box = dashed ? "border border-dashed border-afa-navy/50 rounded px-1.5" : "";
  const gameNumber = numberByGameId?.get(game.id);

  let body;
  if (game.is_bye) {
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    body = (
      <div className="flex flex-col justify-center h-full">
        <span className={`font-bold truncate ${fontClass}`}>{name}</span>
      </div>
    );
  } else {
    const rows = [
      { ...slotDisplay(game, "team1", numberByGameId), score: game.team1_score, won: game.winner_slot === "team1" },
      { ...slotDisplay(game, "team2", numberByGameId), score: game.team2_score, won: game.winner_slot === "team2" },
    ];
    body = (
      <div className="flex flex-col justify-center h-full gap-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline gap-2 min-w-0">
            <span
              className={`truncate flex-1 min-w-0 ${fontClass} ${
                r.won ? "font-bold" : r.resolved ? "font-normal" : "font-normal text-afa-navy/45"
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

  // Field + time are predetermined per game slot and render on every game
  // from generation — not gated on pending/resolved status.
  const fieldTime = formatFieldTime(game);

  return (
    <div
      className={`absolute bg-afa-cream ${box}`}
      style={{ left: x - numberW, top: y, width: w + numberW, minHeight: h }}
      title={
        game.is_bye
          ? undefined
          : `${slotDisplay(game, "team1", numberByGameId).text} vs ${slotDisplay(game, "team2", numberByGameId).text}`
      }
    >
      <div className="flex h-full items-stretch gap-1">
        {gameNumber != null && (
          <div className="shrink-0 pt-0.5" aria-hidden="true">
            <span className="text-[9px] leading-none text-afa-navy/40 tabular-nums">G{gameNumber}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {body}
          {fieldTime && <div className="text-[0.7em] text-afa-ink/50 truncate mt-0.5">{fieldTime}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Draws one bracket_group ('main' or 'consolation') as a tree: winners on
 * top, losers below, Grand Final + If-Necessary at the far right joining
 * both, champion cell past that. Pure layout from round/slot counts — see
 * lib/bracket/tree.js for why the halving/passthrough math needs no
 * knowledge of bracket size or seeding.
 *
 * Two rendering modes, per spec's phone-vs-desktop split:
 *   - fit=true  (desktop/print): the whole tree must be visible with no
 *     interaction — no horizontal scroll. It's measured against its
 *     container and scaled (CSS transform) so the tree fills ~90% of the
 *     full-bleed width (Lacy's 7/21 scale ruling — scales UP for a small
 *     bracket like the demo, not just down for a huge one). The container
 *     breaks out of the page's max-w content column to full viewport width
 *     first, so there's real room to fill.
 *   - fit=false (phone): unchanged — natural pixel size, horizontal pan
 *     via native scroll, the round-indicator strip jumps by scrolling.
 */
export default function TreeCanvas({ games, scale = 1, isMobile = false, showRoundStrip = false, fit = false }) {
  const scrollRef = useRef(null);
  const base = isMobile ? MOBILE : DESKTOP;
  const C = useMemo(() => scaled(base, scale), [base, scale]);
  // >=13px at laptop width is a floor independent of the fit-to-90%-width
  // transform below (which typically enlarges it further for a bracket this
  // size) — mobile untouched per HELD (phone pan mechanics stay as they are).
  const fontClass = isMobile ? "text-[12px]" : "text-[13px]";
  // THE PAPER CONVENTION: every game's number is derived once from its
  // structural position (bracket_side/round/slot), stable across status —
  // see lib/bracket/tree.js assignGameNumbers. Computed from the full,
  // unfiltered group (byes and a would-be-cancelled If-Necessary game keep
  // their number even though splitSides may drop the latter from `games`
  // passed to layout below — numbers are assigned here, before any of that
  // filtering, exactly like a paper bracket printed before anyone plays).
  const numberByGameId = useMemo(() => assignGameNumbers(games), [games]);

  const layout = useMemo(() => {
    const { winners, losers, final } = splitSides(games);
    const centersW = computeCenters(winners);
    const centersL = computeCenters(losers);

    // Every match cell's outer box extends numberW to the LEFT of its "x"
    // (the game-number gutter — see MatchCell) — round 1's column needs a
    // left pad of exactly that much or its gutter renders at a negative
    // coordinate and gets clipped by the fit wrapper's overflow:hidden.
    const leftPad = C.numberW;
    const xForCol = (idx) => leftPad + idx * (C.cellW + C.colGap);
    const cellCenterY = (topY) => topY + C.cellH / 2;

    const winnersH = C.topPad * 2 + maxCenter(winners, centersW) * C.rowH + C.cellH;
    const losersH = losers.length ? C.topPad * 2 + maxCenter(losers, centersL) * C.rowH + C.cellH : 0;
    const losersYOffset = winnersH + (losers.length ? C.sideGap : 0);
    const totalMainH = losers.length ? winnersH + C.sideGap + losersH : winnersH;

    const cells = []; // { game, x, y, key }
    const connectors = []; // [x1,y1,x2,y2]
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
            if (ratio === 1) {
              const p = prev.games.find((x2) => x2.slot === g.slot);
              if (!p) return;
              const pp = posByKey.get(`${sideName}-${prev.round}-${p.slot}`);
              connectors.push([pp.x + C.cellW, pp.centerY, cur.x, cur.centerY]);
            } else {
              [g.slot * 2, g.slot * 2 + 1].forEach((slot) => {
                const p = prev.games.find((x2) => x2.slot === slot);
                if (!p) return;
                const pp = posByKey.get(`${sideName}-${prev.round}-${p.slot}`);
                connectors.push([pp.x + C.cellW, pp.centerY, cur.x, cur.centerY]);
              });
            }
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
      // Connect from the last winners round and the last losers round.
      if (winners.length) {
        const lastW = winners[winners.length - 1].games[0];
        const p = posByKey.get(`winners-${winners[winners.length - 1].round}-${lastW.slot}`);
        if (p) connectors.push([p.x + C.cellW, p.centerY, x, finalCenterY]);
      }
      if (losers.length) {
        const lastL = losers[losers.length - 1].games[0];
        const p = posByKey.get(`losers-${losers[losers.length - 1].round}-${lastL.slot}`);
        if (p) connectors.push([p.x + C.cellW, p.centerY, x, finalCenterY]);
      }
    }
    let lastFinalRightX = gf1 ? finalX0 + C.cellW : finalX0;
    if (gf2) {
      const x = finalX0 + C.cellW + C.colGap;
      const y = finalCenterY - C.cellH / 2;
      finalCells.push({ game: gf2, x, y, dashed: isGf2Dashed(gf1) });
      connectors.push([finalX0 + C.cellW, finalCenterY, x, finalCenterY]);
      lastFinalRightX = x + C.cellW;
    }
    roundStops.push({ x: finalX0, label: "GF" });

    const championX = lastFinalRightX + C.finalGap;
    const { championName } = computeChampion(games);
    connectors.push([lastFinalRightX, finalCenterY, championX, finalCenterY]);

    const totalWidth = championX + C.cellW * 1.4 + 24;
    const totalHeight = Math.max(totalMainH, finalCenterY * 2) + 12;

    // Tiny muted section captions (scale-fix #4) — sit inside each side's
    // own topPad gap, never adding extra height of their own.
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

  // Fit-to-width (desktop/print): measure the full-bleed wrapper and scale
  // the tree — up OR down — so it fills ~90% of that width (Lacy's 7/21
  // scale ruling: "layout scales up until the tree uses ~90% of the
  // full-bleed zone", replacing the old "never scale past 1:1" behavior
  // that left a small bracket like the demo tiny with empty space around
  // it). Clamped to a sane range so a 2-team bracket doesn't blow up to
  // absurd type and a huge one doesn't shrink past legibility.
  // setFitScale only ever runs inside the ResizeObserver's own callback
  // (an external-system subscription), never synchronously in the effect
  // body, so this doesn't fight React's set-state-in-effect guidance.
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
        {layout.connectors.map(([x1, y1, x2, y2], i) => (
          <path key={i} d={elbow(x1, y1, x2, y2)} stroke="var(--afa-navy)" strokeWidth={1} fill="none" opacity={0.5} />
        ))}
      </svg>
      {layout.captions.map((c, i) => (
        <div
          key={i}
          className="absolute text-[9px] font-semibold uppercase tracking-wide text-afa-navy/45 pointer-events-none"
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

  if (fit) {
    // Break out of the page's max-w content column to full viewport width —
    // there has to be real room to scale into before any shrinking happens.
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6 sm:px-10 print:w-full print:left-0 print:right-0 print:mx-0 print:px-0">
        <div ref={fitWrapRef} style={{ width: "100%", height: layout.totalHeight * fitScale, overflow: "hidden" }}>
          <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight, transform: `scale(${fitScale})`, transformOrigin: "top left" }}>
            {canvasBody}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
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
}
