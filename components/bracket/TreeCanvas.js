"use client";

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
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

// ONE GRID (aesthetic pass, JD 7/21). The whole bracket renders from a single
// coordinate system: columns = rounds (fixed cellW + fixed colGap), rows = slot
// units (center * rowH). Every box position AND every connector endpoint derive
// from the SAME posByKey coordinates — no independent positioning math, which is
// what read as "stacked layers."
//
// A match box now OWNS its field/time caption: the caption is a band inside the
// bordered box, not a floating line under it. The box's TRUE center — what an
// elbow targets — is the two-team pair's center (the top teamPairH of the box),
// NOT the box+caption midpoint. That kills the "boxes ride high of their elbows"
// drift. pairCenterY is used for BOTH connector endpoints and for centering a
// child on its feeders, so the geometry stays internally exact.
//
// headerH is the Anton round-header band that sits over each column, per band.
// Sizing contract: team text >=13px, NO transform:scale on screen (that was the
// marooning bug); scale survives only in the print wrapper at the bottom.
// Sizing contract floors (apply at EVERY viewport, mobile included): the name
// column is cellW - scoreW and must land in 180-220px, team text stays >=13px.
// colGap is the tightened gutter (law 10, ~25% off the earlier 40px air).
const DESKTOP = {
  cellW: 214, teamRowH: 20, teamPairH: 40, captionH: 15, boxH: 55, rowH: 70,
  colGap: 20, topPad: 10, headerH: 24, sideGap: 34, finalGap: 30, scoreW: 28,
};
const MOBILE = {
  cellW: 212, teamRowH: 22, teamPairH: 44, captionH: 15, boxH: 59, rowH: 76,
  colGap: 16, topPad: 8, headerH: 22, sideGap: 28, finalGap: 24, scoreW: 26,
};

// The Final is a designed moment, not a wider Round 1 cell: 1.4x in width AND
// height AND type (spec dress #8). Kept as one factor so the box, its type, and
// its vertical centering all scale together.
const FINAL_SCALE = 1.4;

function scaled(c, scale) {
  const out = {};
  for (const k in c) out[k] = c[k] * scale;
  return out;
}

// One full elbow feeder path: box right edge -> horizontal to the fixed
// mid-gutter -> vertical to the child's pair-center line -> horizontal into the
// child's left edge. Square corners, one navy stroke. Two siblings feeding one
// child share midX, so their verticals land in the same gutter column and mirror
// each other around the child's centerline (SYMMETRY LAW).
function elbowPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

/**
 * One match cell — a SOLID FILLED BLOCK dressed as a program ticket (aesthetic
 * pass): white fill on the cream ground, a thin 2px NAVY TOP RULE, 1px navy on
 * the other three sides, ~3px corners. The two stacked team rows sit in the top
 * teamPairH band with a hairline divider and a narrow score strip on the right;
 * the field/time caption owns the band beneath them, inside the same border. The
 * If-Necessary decider draws dashed while still unknown.
 *
 * Winner reads by weight (bold). Pending game leaves the score strip empty (no
 * 0-0 lies). W/L provenance placeholders live in the team rows in muted ink; the
 * game NUMBER rides the connector, drawn in canvasBody, not here.
 */
function MatchCell({ game, x, y, w, box, fontClass, dashed, numberByGameId, wide }) {
  if (!game) return null;
  const pending = game.status === "pending";
  const fieldTime = formatFieldTime(game);
  const { teamPairH, boxH, scoreW } = box;

  const boxStyle = {
    height: boxH,
    boxSizing: "border-box",
    borderStyle: dashed ? "dashed" : "solid",
    borderColor: "var(--afa-navy)",
    borderTopWidth: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  };

  let teamBlock;
  if (game.is_bye) {
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    teamBlock = (
      <div className="flex items-center px-2" style={{ height: teamPairH }}>
        <span className={`font-bold truncate ${fontClass}`}>{name}</span>
      </div>
    );
  } else {
    const rows = [
      { ...slotDisplay(game, "team1", numberByGameId), score: game.team1_score, won: game.winner_slot === "team1" },
      { ...slotDisplay(game, "team2", numberByGameId), score: game.team2_score, won: game.winner_slot === "team2" },
    ];
    teamBlock = (
      <div className="flex" style={{ height: teamPairH }}>
        <div className="flex-1 min-w-0 flex flex-col">
          {rows.map((r, i) => (
            <div key={i} className={`flex-1 flex items-center px-2 min-w-0 ${i === 0 ? "border-b border-afa-navy/25" : ""}`}>
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
      <div className="bg-white rounded-[3px] overflow-hidden flex flex-col bracket-box" style={boxStyle}>
        {teamBlock}
        {/* Field/time caption — inside the box, full string, never truncated. */}
        <div className="flex items-center px-2 border-t border-afa-navy/15 bg-afa-cream/40" style={{ height: `calc(100% - ${teamPairH}px)` }}>
          <span className={`${wide ? "text-[11px]" : "text-[10px]"} leading-none text-afa-muted whitespace-nowrap`}>
            {fieldTime || " "}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Draws one bracket_group ('main' or 'consolation') as a single-grid boxed tree:
 * winners on top, losers below (separated by the site's chalk-line), Grand Final
 * as a designed moment at the far right, champion cell past it. Round headers in
 * the Anton display face sit over each column.
 *
 * SIZING CONTRACT: exactly ONE on-screen render at every viewport width — fixed
 * pixel blocks, no transform:scale, horizontal scroll if wider than the
 * container. `fit` adds a SECOND, print-only scaled-to-page variant.
 */
export default function TreeCanvas({ games, scale = 1, isMobile = false, showRoundStrip = false, fit = false }) {
  const scrollRef = useRef(null);
  const base = isMobile ? MOBILE : DESKTOP;
  const C = useMemo(() => scaled(base, scale), [base, scale]);
  const fontClass = "text-[13px]"; // sizing-contract floor at every viewport
  const wideCaption = scale >= 1 && !isMobile;
  const boxProps = { teamPairH: C.teamPairH, boxH: C.boxH, scoreW: C.scoreW };
  // The Final's own larger cell + type — the designed championship moment.
  const finalBox = { teamPairH: C.teamPairH * FINAL_SCALE, boxH: C.boxH * FINAL_SCALE, scoreW: C.scoreW * 1.15 };
  const finalFont = isMobile ? "text-[15px]" : "text-[17px]";
  const numberByGameId = useMemo(() => assignGameNumbers(games), [games]);

  const layout = useMemo(() => {
    const { winners, losers, final } = splitSides(games);
    const centersW = computeCenters(winners);
    const centersL = computeCenters(losers);

    const leftPad = 2;
    const xForCol = (idx) => leftPad + idx * (C.cellW + C.colGap);
    const pairCenterY = (topY) => topY + C.teamPairH / 2;

    // Per-band vertical layout. Each band carries its own Anton header row on
    // top (headerH), then topPad, then the boxes.
    const winnersTop = 0;
    const winnersBoxTop = winnersTop + C.headerH + C.topPad;
    const winnersBlockH = C.headerH + C.topPad + maxCenter(winners, centersW) * C.rowH + C.boxH + C.topPad;
    const losersTop = losers.length ? winnersTop + winnersBlockH + C.sideGap : winnersTop + winnersBlockH;
    const losersBoxTop = losersTop + C.headerH + C.topPad;
    const losersBlockH = losers.length ? C.headerH + C.topPad + maxCenter(losers, centersL) * C.rowH + C.boxH + C.topPad : 0;
    const totalMainH = losers.length ? losersTop + losersBlockH : winnersTop + winnersBlockH;

    const cells = [];
    const connectors = [];
    const gameLabels = []; // { n, cx, cy } — number riding the outgoing elbow
    const roundHeaders = []; // { x, w, label }
    const roundStops = []; // { x, label } for the mobile jump strip
    const posByKey = new Map();

    const addLabel = (g, boxRight, cy) => {
      const n = numberByGameId.get(g.id);
      if (n != null) gameLabels.push({ n, cx: boxRight + C.colGap / 2, cy });
    };

    function layoutSide(rounds, centers, boxTop, sideName) {
      const n = rounds.length;
      const headerY = boxTop - C.topPad - C.headerH + 2;
      rounds.forEach((r, idx) => {
        const x = xForCol(idx);
        // Round header over this column, sitting in this band's own header row.
        let label;
        if (sideName === "winners") label = idx === n - 1 && n > 1 ? "SEMIS" : `ROUND ${idx + 1}`;
        else label = `ELIMINATION ${idx + 1}`;
        roundHeaders.push({ x, y: headerY, w: C.cellW, label });
        if (sideName === "winners") roundStops.push({ x, label: idx === n - 1 && n > 1 ? "SF" : `R${idx + 1}` });
        r.games.forEach((g) => {
          const center = centers.get(`${r.round}-${g.slot}`) ?? 0;
          const y = boxTop + center * C.rowH;
          const key = `${sideName}-${r.round}-${g.slot}`;
          const pcY = pairCenterY(y);
          posByKey.set(key, { x, y, pcY });
          cells.push({ game: g, x, y, key });
          addLabel(g, x + C.cellW, pcY);
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
              connectors.push(elbowPath(pp.x + C.cellW, pp.pcY, cur.x, cur.pcY));
            });
          });
        }
      });
    }

    layoutSide(winners, centersW, winnersBoxTop, "winners");
    layoutSide(losers, centersL, losersBoxTop, "losers");

    // Chalk-line divider between winners and losers (the identity element).
    const dividers = [];
    if (losers.length) dividers.push({ y: winnersTop + winnersBlockH + C.sideGap / 2 });

    // The Final — a designed convergence (the one exempt join). Box ~1.4x wide,
    // vertically centered on the combined winners+losers block. Winners champ and
    // losers champ meet on ONE shared vertical just left of it, short and direct.
    const winnersRightX = winners.length ? xForCol(winners.length - 1) + C.cellW : 0;
    const losersRightX = losers.length ? xForCol(losers.length - 1) + C.cellW : 0;
    const finalX0 = Math.max(winnersRightX, losersRightX) + C.finalGap;
    const finalW = C.cellW * FINAL_SCALE;
    const finalPairH = C.teamPairH * FINAL_SCALE; // taller Final cell
    const finalCenterY = totalMainH / 2;

    const [gf1, gf2] = final;
    const finalCells = [];
    if (gf1) {
      const x = finalX0;
      const y = finalCenterY - finalPairH / 2;
      finalCells.push({ game: gf1, x, y, w: finalW });
      addLabel(gf1, x + finalW, finalCenterY);
      // CHAMPIONSHIP sits directly above the taller Final box — the designed moment.
      roundHeaders.push({ x, y: y - C.headerH + 2, w: finalW, label: "CHAMPIONSHIP", big: true });
      const joinX = finalX0 - C.finalGap / 2;
      const wLast = winners.length ? winners[winners.length - 1].games[0] : null;
      const lLast = losers.length ? losers[losers.length - 1].games[0] : null;
      const wp = wLast ? posByKey.get(`winners-${winners[winners.length - 1].round}-${wLast.slot}`) : null;
      const lp = lLast ? posByKey.get(`losers-${losers[losers.length - 1].round}-${lLast.slot}`) : null;
      if (wp && lp) {
        connectors.push(`M ${wp.x + C.cellW} ${wp.pcY} H ${joinX} V ${finalCenterY} H ${x}`);
        connectors.push(`M ${lp.x + C.cellW} ${lp.pcY} H ${joinX} V ${finalCenterY}`);
      } else if (wp) {
        connectors.push(`M ${wp.x + C.cellW} ${wp.pcY} H ${joinX} V ${finalCenterY} H ${x}`);
      } else if (lp) {
        connectors.push(`M ${lp.x + C.cellW} ${lp.pcY} H ${joinX} V ${finalCenterY} H ${x}`);
      }
    }
    let lastFinalRightX = gf1 ? finalX0 + finalW : finalX0;
    if (gf2) {
      const x = finalX0 + finalW + C.colGap;
      const y = finalCenterY - finalPairH / 2;
      finalCells.push({ game: gf2, x, y, w: C.cellW, dashed: isGf2Dashed(gf1) });
      addLabel(gf2, x + C.cellW, finalCenterY);
      connectors.push(`M ${finalX0 + finalW} ${finalCenterY} H ${x}`);
      lastFinalRightX = x + C.cellW;
    }

    const championX = lastFinalRightX + C.finalGap;
    const championW = C.cellW * FINAL_SCALE;
    const { championName } = computeChampion(games);
    connectors.push(`M ${lastFinalRightX} ${finalCenterY} H ${championX}`);

    // Faint AFA mark — the one place art enters. The winners bracket is shorter
    // than the losers bracket, so the horizontal span between the winners SEMIS
    // and the FINAL is a structural void. The mark fills THAT void: it is sized
    // to the void width and centered in it, on the LOWEST z, so its body sits in
    // open space and no opaque box cuts it, while it reads as the backdrop of the
    // Final/champion zone it sits beside. finalCenterY aligns it with the Final.
    const voidLeft = winnersRightX || 0;
    const markSize = Math.max(finalX0 - voidLeft, C.cellW * 1.2);
    const markCx = (voidLeft + finalX0) / 2;
    const watermark = gf1
      ? { x: markCx - markSize / 2, y: finalCenterY - markSize / 2, size: markSize }
      : null;

    const totalWidth = championX + championW + 24;
    const totalHeight = Math.max(totalMainH, finalCenterY * 2) + 12;

    return {
      cells, connectors, gameLabels, finalCells, finalW,
      championX, championW, championY: finalCenterY, championName,
      totalWidth, totalHeight, roundHeaders, roundStops, dividers, watermark, leftPad,
    };
  }, [games, C, numberByGameId]);

  function jumpTo(x) {
    scrollRef.current?.scrollTo({ left: Math.max(0, x - 12), behavior: "smooth" });
  }

  // Right-edge scroll shadow — only shows when the tree is genuinely wider than
  // the scroll port and there's more to the right.
  const [showRightShadow, setShowRightShadow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
      setShowRightShadow(more);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // ResizeObserver catches the hidden -> visible flip (the SSR list default
    // becomes the bracket after hydration) where a plain mount measure reads 0.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [layout.totalWidth]);

  // PRINT-ONLY fit-to-page (sizing contract #3).
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

  const headerFont = isMobile ? "text-[11px]" : "text-[13px]";

  const canvasBody = (
    <>
      {/* Faint AFA mark behind the Final/champion zone. Hidden in print. */}
      {layout.watermark && (
        <img
          src="/afa-logo.png"
          alt=""
          aria-hidden="true"
          className="absolute pointer-events-none select-none print:hidden"
          style={{ left: layout.watermark.x, top: layout.watermark.y, width: layout.watermark.size, height: "auto", opacity: 0.07, zIndex: 0 }}
        />
      )}
      <svg className="absolute inset-0 pointer-events-none bracket-connectors" width={layout.totalWidth} height={layout.totalHeight}>
        {layout.connectors.map((d, i) => (
          <path key={i} d={d} stroke="var(--afa-navy)" strokeWidth={1} fill="none" shapeRendering="crispEdges" />
        ))}
      </svg>
      {/* Chalk-line dividers between winners / losers. */}
      {layout.dividers.map((dv, i) => (
        <div key={i} className="chalk-line absolute" style={{ top: dv.y, left: layout.leftPad, width: layout.totalWidth - layout.leftPad - 24, margin: 0 }} />
      ))}
      {/* Anton round headers over each column, small caps. */}
      {layout.roundHeaders.map((h, i) => (
        <div
          key={i}
          className={`absolute font-display text-afa-navy tracking-wide text-center pointer-events-none bracket-header ${headerFont}`}
          style={{ left: h.x, top: h.y, width: h.w }}
        >
          {h.label}
        </div>
      ))}
      {/* Game numbers ride the outgoing elbow midpoint — one consistent offset. */}
      {layout.gameLabels.map((g, i) => (
        <div
          key={i}
          className="absolute text-[9px] leading-none text-afa-muted tabular-nums text-center pointer-events-none"
          style={{ left: g.cx - 12, top: g.cy - 11, width: 24 }}
        >
          G{g.n}
        </div>
      ))}
      {layout.cells.map(({ game, x, y, key }) => (
        <MatchCell key={key} game={game} x={x} y={y} w={C.cellW} box={boxProps} fontClass={fontClass} numberByGameId={numberByGameId} wide={wideCaption} />
      ))}
      {layout.finalCells.map(({ game, x, y, w, dashed }) => (
        <MatchCell key={game.id} game={game} x={x} y={y} w={w} box={finalBox} fontClass={finalFont} dashed={dashed} numberByGameId={numberByGameId} wide />
      ))}
      {/* Champion cell — the tree's one appearance of the Anton display face,
          scaled up to match the Final's designed-moment weight. */}
      <div
        className="absolute flex items-center"
        style={{ left: layout.championX, top: layout.championY - (C.teamPairH * FINAL_SCALE) / 2, width: layout.championW, minHeight: C.teamPairH * FINAL_SCALE }}
      >
        <span className={`font-display text-afa-navy truncate ${isMobile ? "text-xl" : "text-2xl"}`}>
          {layout.championName || "—"}
        </span>
      </div>
    </>
  );

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
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
        <div ref={scrollRef} className="overflow-x-auto px-4 sm:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight }}>
            {canvasBody}
          </div>
        </div>
        {/* Scroll shadow at the clipped right edge — signals there's more tree
            (e.g. the champion cell) past the viewport when the bracket overflows. */}
        {showRightShadow && (
          <div
            className="absolute top-0 right-0 h-full w-14 pointer-events-none print:hidden"
            style={{ background: "linear-gradient(to left, rgba(22,35,61,0.30), rgba(22,35,61,0.10) 45%, transparent)" }}
          />
        )}
      </div>
    </div>
  );

  if (!fit) return screenBody;

  return (
    <>
      {screenBody}
      {/* Print-only scaled-to-page variant (sizing contract #3). */}
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
