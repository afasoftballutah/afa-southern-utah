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

// ONE GRID. The whole bracket renders from a single coordinate system: columns =
// rounds (fixed cellW + fixed colGap), rows = slot units (center * rowH). Every
// pill position AND every connector endpoint derive from the SAME coordinates.
//
// A game is TWO TEAM PILLS, not one box (JD ruling): each team row is its own
// bordered pill, the two stacked with a small pillGap, NO outer container. The
// field/time caption renders BELOW the pair and is EXCLUDED from all centering
// math (JD 7/22: inside-the-pill captions made everything read off-center and
// the connectors ride high). The game unit = the two pills alone; the connector
// enters at the exact rendered vertical center of that pill pair.
//
// Sizing contract: name column (cellW - scoreW) lands in 180-220px, team text
// stays >=13px, no transform:scale on screen. colGap is the tightened gutter.
const DESKTOP = {
  cellW: 214, teamRowH: 26, pillGap: 3, captionH: 14, rowH: 82,
  colGap: 20, topPad: 10, headerH: 24, sideGap: 34, finalGap: 30, scoreW: 28,
};
const MOBILE = {
  cellW: 212, teamRowH: 28, pillGap: 3, captionH: 14, rowH: 88,
  colGap: 16, topPad: 8, headerH: 22, sideGap: 28, finalGap: 24, scoreW: 26,
};

// The Final is a designed moment (dress #8): 1.4x in size and type. It is NOT a
// positional exception (symmetry law #3, no exceptions) — it still sits on the
// exact midpoint of its two feeders and its line centers on it like every game.
const FINAL_SCALE = 1.4;

function scaled(c, scale) {
  const out = {};
  for (const k in c) out[k] = c[k] * scale;
  return out;
}

// One full elbow feeder path: pair right edge -> horizontal to the fixed
// mid-gutter -> vertical to the child's pair center -> horizontal into the
// child's left edge. Square corners, one navy stroke. Two siblings feeding one
// child share midX, so their verticals mirror around the child's centerline.
function elbowPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

// A single team pill: white ticket, 2px navy top rule, 1px navy other sides,
// name left + a narrow score strip right (empty until played — no 0-0 lies).
function TeamPill({ text, weightClass, score, won, pending, pillStyle, scoreW, fontClass }) {
  return (
    <div className="bg-white rounded-[3px] overflow-hidden flex bracket-box" style={pillStyle}>
      <div className="flex-1 min-w-0 flex items-center px-2">
        <span className={`truncate ${fontClass} ${weightClass}`}>{text}</span>
      </div>
      <div className="flex items-center justify-center border-l border-afa-navy/25 shrink-0" style={{ width: scoreW }}>
        <span className={`tabular-nums text-[0.8em] ${won ? "font-bold text-afa-ink" : "text-afa-ink/70"}`}>
          {!pending && score != null ? score : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * One game — TWO TEAM PILLS with a small gap, no outer container. Winner reads
 * by weight (bold). W/L provenance placeholders sit in the pills in muted ink.
 * The If-Necessary decider draws dashed while unknown. A bye renders one pill,
 * vertically centered in the pair's slot so the connector still meets its center.
 *
 * The field/time caption renders BELOW the pair, visually separate, and takes NO
 * part in centering — the fixed-height pills wrapper is the whole game unit and
 * the connector enters at its exact center.
 */
function MatchCell({ game, x, y, w, box, fontClass, dashed, numberByGameId, wide }) {
  if (!game) return null;
  const pending = game.status === "pending";
  const fieldTime = formatFieldTime(game);
  const { teamRowH, pillGap, scoreW, gameUnitH } = box;

  const pillStyle = {
    height: teamRowH,
    boxSizing: "border-box",
    borderStyle: dashed ? "dashed" : "solid",
    borderColor: "var(--afa-navy)",
    borderTopWidth: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  };
  const common = { pillStyle, scoreW, fontClass, pending };

  let pills;
  if (game.is_bye) {
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    pills = <TeamPill {...common} text={name} weightClass="font-bold" score={null} won={false} />;
  } else {
    const t1 = slotDisplay(game, "team1", numberByGameId);
    const t2 = slotDisplay(game, "team2", numberByGameId);
    const w1 = game.winner_slot === "team1";
    const w2 = game.winner_slot === "team2";
    pills = (
      <>
        <TeamPill {...common} text={t1.text} score={game.team1_score} won={w1} weightClass={w1 ? "font-bold" : t1.resolved ? "font-normal" : "font-normal text-afa-muted"} />
        <TeamPill {...common} text={t2.text} score={game.team2_score} won={w2} weightClass={w2 ? "font-bold" : t2.resolved ? "font-normal" : "font-normal text-afa-muted"} />
      </>
    );
  }

  return (
    <div
      className="absolute"
      style={{ left: x, top: y, width: w }}
      title={game.is_bye ? undefined : `${slotDisplay(game, "team1", numberByGameId).text} vs ${slotDisplay(game, "team2", numberByGameId).text}`}
    >
      {/* The game unit: the two pills alone, fixed height. The connector enters
          at this box's exact vertical center. */}
      <div className="flex flex-col justify-center" style={{ height: gameUnitH, gap: pillGap }}>
        {pills}
      </div>
      {/* Field/time — OUTSIDE the pills, below, full string, excluded from centering. */}
      {fieldTime && (
        <div className={`${wide ? "text-[11px]" : "text-[10px]"} leading-none text-afa-muted whitespace-nowrap mt-1 px-0.5`}>
          {fieldTime}
        </div>
      )}
    </div>
  );
}

/**
 * Draws one bracket_group ('main' or 'consolation') as a single-grid tree:
 * winners on top, losers below (separated by the site's chalk-line), Grand Final
 * at the far right sitting on the midpoint of its two feeders, champion cell past
 * it. Round headers ride over each column in the Anton display face.
 *
 * SIZING CONTRACT: exactly ONE on-screen render at every viewport — fixed pixel
 * pills, no transform:scale, horizontal scroll if wider than the container.
 * `fit` adds a SECOND, print-only scaled-to-page variant.
 */
export default function TreeCanvas({ games, scale = 1, isMobile = false, showRoundStrip = false, fit = false }) {
  const scrollRef = useRef(null);
  const base = isMobile ? MOBILE : DESKTOP;
  const C = useMemo(() => scaled(base, scale), [base, scale]);
  const fontClass = "text-[13px]"; // sizing-contract floor at every viewport
  const wideCaption = scale >= 1 && !isMobile;
  const numberByGameId = useMemo(() => assignGameNumbers(games), [games]);

  const gameUnitH = 2 * C.teamRowH + C.pillGap;
  const finalUnitH = gameUnitH * FINAL_SCALE;
  const pillBox = { teamRowH: C.teamRowH, pillGap: C.pillGap, scoreW: C.scoreW, gameUnitH };
  const finalPillBox = {
    teamRowH: C.teamRowH * FINAL_SCALE, pillGap: C.pillGap * FINAL_SCALE,
    scoreW: C.scoreW * 1.15, gameUnitH: finalUnitH,
  };
  const finalFont = isMobile ? "text-[15px]" : "text-[17px]";

  const layout = useMemo(() => {
    const { winners, losers, final } = splitSides(games);
    const centersW = computeCenters(winners);
    const centersL = computeCenters(losers);

    const unitH = 2 * C.teamRowH + C.pillGap;
    const leftPad = 2;
    const xForCol = (idx) => leftPad + idx * (C.cellW + C.colGap);
    // A connector enters a game at the exact vertical center of its two-pill
    // pair — the fixed-height unit, caption excluded. Every game uses this same
    // offset, so a child still lands at the midpoint of its feeders' entry
    // points (box-to-box symmetry preserved).
    const boxCenterY = (topY) => topY + unitH / 2;

    const winnersTop = 0;
    const winnersBoxTop = winnersTop + C.headerH + C.topPad;
    const winnersBlockH = C.headerH + C.topPad + maxCenter(winners, centersW) * C.rowH + unitH + C.captionH + C.topPad;
    const losersTop = losers.length ? winnersTop + winnersBlockH + C.sideGap : winnersTop + winnersBlockH;
    const losersBoxTop = losersTop + C.headerH + C.topPad;
    const losersBlockH = losers.length ? C.headerH + C.topPad + maxCenter(losers, centersL) * C.rowH + unitH + C.captionH + C.topPad : 0;
    const totalMainH = losers.length ? losersTop + losersBlockH : winnersTop + winnersBlockH;

    const cells = [];
    const connectors = [];
    const gameLabels = []; // { n, x, y } — G-number at the pair's top-left
    const roundHeaders = [];
    const roundStops = [];
    const posByKey = new Map();

    const addLabel = (g, gx, unitTop) => {
      const n = numberByGameId.get(g.id);
      if (n != null) gameLabels.push({ n, x: gx, y: unitTop });
    };

    function layoutSide(rounds, centers, boxTop, sideName) {
      const n = rounds.length;
      const headerY = boxTop - C.topPad - C.headerH + 2;
      rounds.forEach((r, idx) => {
        const x = xForCol(idx);
        let label;
        if (sideName === "winners") label = idx === n - 1 && n > 1 ? "SEMIS" : `ROUND ${idx + 1}`;
        else label = `ELIMINATION ${idx + 1}`;
        roundHeaders.push({ x, y: headerY, w: C.cellW, label });
        if (sideName === "winners") roundStops.push({ x, label: idx === n - 1 && n > 1 ? "SF" : `R${idx + 1}` });
        r.games.forEach((g) => {
          const center = centers.get(`${r.round}-${g.slot}`) ?? 0;
          const y = boxTop + center * C.rowH;
          const key = `${sideName}-${r.round}-${g.slot}`;
          const pcY = boxCenterY(y);
          posByKey.set(key, { x, y, pcY });
          cells.push({ game: g, x, y, key });
          addLabel(g, x, y);
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

    const dividers = [];
    if (losers.length) dividers.push({ y: winnersTop + winnersBlockH + C.sideGap / 2 });

    // The Final sits on the EXACT midpoint of its two feeders (symmetry law #3,
    // no exceptions). finalCenterY is the midpoint of the winners-champ and
    // losers-champ entry points; the Final box centers on it and the converging
    // lines mirror around it.
    const winnersRightX = winners.length ? xForCol(winners.length - 1) + C.cellW : 0;
    const losersRightX = losers.length ? xForCol(losers.length - 1) + C.cellW : 0;
    const finalX0 = Math.max(winnersRightX, losersRightX) + C.finalGap;
    const finalW = C.cellW * FINAL_SCALE;
    const fUnitH = unitH * FINAL_SCALE;

    const wLast = winners.length ? winners[winners.length - 1].games[0] : null;
    const lLast = losers.length ? losers[losers.length - 1].games[0] : null;
    const wp = wLast ? posByKey.get(`winners-${winners[winners.length - 1].round}-${wLast.slot}`) : null;
    const lp = lLast ? posByKey.get(`losers-${losers[losers.length - 1].round}-${lLast.slot}`) : null;
    let finalCenterY;
    if (wp && lp) finalCenterY = (wp.pcY + lp.pcY) / 2;
    else if (wp) finalCenterY = wp.pcY;
    else if (lp) finalCenterY = lp.pcY;
    else finalCenterY = totalMainH / 2;

    const [gf1, gf2] = final;
    const finalCells = [];
    const finalTop = finalCenterY - fUnitH / 2;
    if (gf1) {
      const x = finalX0;
      finalCells.push({ game: gf1, x, y: finalTop, w: finalW });
      addLabel(gf1, x, finalTop);
      roundHeaders.push({ x, y: finalTop - C.headerH + 2, w: finalW, label: "CHAMPIONSHIP" });
      const joinX = finalX0 - C.finalGap / 2;
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
      finalCells.push({ game: gf2, x, y: finalTop, w: C.cellW, dashed: isGf2Dashed(gf1) });
      addLabel(gf2, x, finalTop);
      connectors.push(`M ${finalX0 + finalW} ${finalCenterY} H ${x}`);
      lastFinalRightX = x + C.cellW;
    }

    const championX = lastFinalRightX + C.finalGap;
    const championW = C.cellW * FINAL_SCALE;
    const { championName } = computeChampion(games);
    connectors.push(`M ${lastFinalRightX} ${finalCenterY} H ${championX}`);

    // Faint AFA mark filling the structural SEMIS -> FINAL void (winners bracket
    // is shorter than losers), sized to the void and centered in it on the
    // lowest z so no opaque pill cuts it; vertically on finalCenterY.
    const voidLeft = winnersRightX || 0;
    const markSize = Math.max(finalX0 - voidLeft, C.cellW * 1.2);
    const markCx = (voidLeft + finalX0) / 2;
    const watermark = gf1 ? { x: markCx - markSize / 2, y: finalCenterY - markSize / 2, size: markSize } : null;

    const totalWidth = championX + championW + 24;
    const totalHeight = Math.max(totalMainH, finalTop + fUnitH + C.captionH) + 12;

    return {
      cells, connectors, gameLabels, finalCells,
      championX, championW, championY: finalCenterY, championName,
      totalWidth, totalHeight, roundHeaders, roundStops, dividers, watermark, leftPad,
    };
  }, [games, C, numberByGameId]);

  function jumpTo(x) {
    scrollRef.current?.scrollTo({ left: Math.max(0, x - 12), behavior: "smooth" });
  }

  // Right-edge scroll shadow — shows when the tree is wider than the scroll port
  // and there's more to the right (e.g. the champion cell off-screen).
  const [showRightShadow, setShowRightShadow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => {
      setShowRightShadow(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
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
      {/* Game numbers on the LEFT of each pair, above the top pill — clear of
          every connector path. */}
      {layout.gameLabels.map((g, i) => (
        <div
          key={i}
          className="absolute text-[9px] leading-none text-afa-muted tabular-nums pointer-events-none"
          style={{ left: g.x + 1, top: g.y - 11 }}
        >
          G{g.n}
        </div>
      ))}
      {layout.cells.map(({ game, x, y, key }) => (
        <MatchCell key={key} game={game} x={x} y={y} w={C.cellW} box={pillBox} fontClass={fontClass} numberByGameId={numberByGameId} wide={wideCaption} />
      ))}
      {layout.finalCells.map(({ game, x, y, w, dashed }) => (
        <MatchCell key={game.id} game={game} x={x} y={y} w={w} box={finalPillBox} fontClass={finalFont} dashed={dashed} numberByGameId={numberByGameId} wide />
      ))}
      {/* Champion cell — the tree's one appearance of the Anton display face,
          scaled to the Final's designed-moment weight, centered on the line. */}
      <div
        className="absolute flex items-center"
        style={{ left: layout.championX, top: layout.championY - finalUnitH / 2, width: layout.championW, height: finalUnitH }}
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
