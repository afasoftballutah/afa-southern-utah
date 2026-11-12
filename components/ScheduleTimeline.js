"use client";

import { SIDE_LABELS } from "@/lib/bracket/side";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { planArrows, visiblePart, aimAt, placeLabel } from "@/lib/flow-arrows";
import Link from "next/link";
import {
  buildTimeline,
  divisionLegendGroups,
  divisionTone,
  flowWords,
  hourLabel,
  gameTitle,
  matchupSide,
  nextStep,
  bracketPill,
  flowTargets,
  pillScore,
  gameNumberIndex,
  gameIdByTitle,
  compactTime,
  whereWhen,
  fieldNameParts,
} from "@/lib/schedule-timeline";
import { fromScheduleRows, teamGameIds, teamNextGame } from "@/lib/team-games";
import { teamReachIds } from "@/lib/team-reach";
import { placeClear, unionRect } from "@/lib/popover-place";
import { fieldGrid, gridTrack } from "@/lib/mcp/field-grid";
import { divisionFamily } from "@/lib/team-feed";

// Timeline view of the schedule (JD, 2026-11-09): one lane per field, the
// day's hours across the top, one panel per day. On phones (width < 640,
// same breakpoint as the Path view) it turns vertical (JD, 2026-11-11:
// "Can we do this vertical as well?" / "Phone vertical of course."):
// field columns across the top (two-line "Hunter / F1" headers, sticky),
// hour rows down the side, a day header row per day. Desktop stays
// horizontal. Each game is a small pill in its division's colour; tapping
// it opens the details beside it (a sheet at the bottom on a phone). One
// open at a time; Esc or a tap anywhere else closes it. A data refresh
// keeps it open — the open game is remembered by id, not by position.

const ROW_PX = 52; // phone hour-row height (Path's 32px is too tight for corners + score)

// Championship mark (JD, 2026-11-09: "star can be faint in the background
// behind all the numbers"). One large, faint gold star behind the pill's
// content; decorative — the aria-label already says "Championship".
function Star({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 1.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L10 15l-5.38 2.85 1.03-6L1.3 7.6l6-.9z" fill="currentColor" />
    </svg>
  );
}

// A tiny softball between gender groups (JD, 2026-11-10). Two curved
// seams, drawn bold enough to read at 9px; decorative only.
function SoftballMark() {
  return (
    <svg className="tl-legend__ball" viewBox="0 0 16 16" width="9" height="9" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7.1" fill="#c9de4a" stroke="#8ea12e" strokeWidth="0.9" />
      <path d="M3.2 4.1c3.1 1.8 3.1 6 0 7.8" fill="none" stroke="#c13b32" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M12.8 4.1c-3.1 1.8-3.1 6 0 7.8" fill="none" stroke="#c13b32" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

// A bottom corner: a finishing place is bold italic so it reads as final
// ("5th", "2nd", 🏆); a next game is plain "→22".
function Corner({ pos, x, gold }) {
  if (!x) return null;
  const chip = x.place ? (
    <span className={`tl-corner-place${gold ? " is-gold" : ""}${x.place === "🏆" ? " is-cup" : ""}`}>{x.place}</span>
  ) : null;
  const next = x.next ? (x.place ? `/${x.next}` : `→${x.next}`) : null;
  const plain = !x.place && !x.next ? x.short : null;
  if (!chip && !next && !plain) return null;
  return (
    <span className={`tl-corner tl-corner--${pos}`} aria-hidden="true">
      {chip}
      {next}
      {plain}
    </span>
  );
}

const PILL_GAP_H = 4;
const PILL_GAP_V = 3;




function Pill({ game, open, onToggle, pillRef, mark, vertical = false }) {
  const tone = divisionTone(game.divisionName);
  const final = game.isFinal || game.status === "final";
  const place = game.team1Place || game.team2Place;
  const side = game.bracketSide ?? null;
  const flow = game.flow ?? null;
  const number = /^G\d+$/.test(game.label ?? "") ? game.label.slice(1) : (game.label ?? "Game");
  const top = [
    ["tl", flow?.from?.[0]?.short ?? null],
    ["tr", flow?.from?.[1]?.short ?? null],
  ];
  const champ = side === "final" || side === "if";
  const words = flowWords(flow);
  const result = final ? pillScore(game) : null;
  const winnerName = result ? game[result.winner] : null;
  return (
    <button
      type="button"
      ref={pillRef}
      data-game-id={game.id}
      className={`tl-pill tl-tone-${tone}${side ? ` tl-side-${side}` : ""}${final ? " is-final" : ""}${open ? " is-open" : ""}${mark ? ` ${mark}` : ""}`}
      style={
        vertical
          ? {
              top: (game.offset / 60) * ROW_PX + PILL_GAP_V,
              height: Math.max((game.length / 60) * ROW_PX - PILL_GAP_V * 2, 28),
              left: PILL_GAP_V,
              width: `calc(100% - ${PILL_GAP_V * 2}px)`,
            }
          : {
              left: `calc(100% * (${game.offset} / 60) / var(--tl-hours) + ${PILL_GAP_H}px)`,
              width: `calc(100% * (${game.length} / 60) / var(--tl-hours) - ${PILL_GAP_H * 2}px)`,
            }
      }
      aria-expanded={open}
      aria-controls={open ? `tl-pop-${game.id}` : undefined}
      aria-label={`${game.divisionName} ${game.label ?? ""}${side ? `, ${SIDE_LABELS[side]}` : ""}, ${game.timeLabel ?? ""}, ${game.fieldName}${
        final ? (result ? `, final ${result.text}${winnerName ? `, ${winnerName} won` : ""}` : ", final") : ""
      }${place ? `, a team finished ${place}` : ""}${words ? `. ${words}` : ""}`}
      onClick={(e) => onToggle(game.id, e.currentTarget)}
    >
      {champ ? <Star className="tl-bgstar" /> : null}
      {result ? (
        <>
          <span className="tl-pill__gno">{number}</span>
          <span className="tl-pill__num tl-pill__score">{result.text}</span>
        </>
      ) : (
        <span className="tl-pill__num">{number}</span>
      )}
      {top.map(([pos, text]) =>
        text ? (
          <span key={pos} className={`tl-corner tl-corner--${pos}`} aria-hidden="true">
            {text}
          </span>
        ) : null
      )}
      <Corner pos="bl" x={flow?.loser} gold={champ} />
      <Corner pos="br" x={flow?.winner} gold={champ} />
    </button>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// "Game 17" on the card: a quiet link that opens that game, same as tapping
// its pill (JD, 2026-11-09: "can we make these games clickable on cards").
// Plain text when the game isn't on this schedule.
function GameLink({ title, go }) {
  const id = go?.idOf(title) ?? null;
  if (!id) return <>{title}</>;
  return (
    <button type="button" className="tl-link" aria-label={`Open ${title}`} onClick={() => go.open(id)}>
      {title}
    </button>
  );
}

function NextValue({ step, go }) {
  if (!step) return <span className="tl-next__value is-muted">—</span>;
  if (step.champion) return <span className="tl-next__value tl-cup" aria-label="Champion">🏆</span>;
  if (step.out) {
    return (
      <span className="tl-next__value">
        Out{step.place ? <> · <span className="tl-corner-place">{step.place}</span></> : null}
      </span>
    );
  }
  if (step.place) return <span className="tl-next__value"><span className="tl-corner-place">{step.place}</span></span>;
  if (step.next) {
    return (
      <span className="tl-next__value">
        <span aria-hidden="true" className="tl-next__arrow">→</span> <GameLink title={step.next} go={go} />
      </span>
    );
  }
  return <span className="tl-next__value">{step.text}</span>;
}

// The opened pill, top to bottom (JD, 2026-11-09): one row of pills —
// division, W/L (or ★ Final), Game N; the matchup scoreboard; where the
// loser (left) and winner (right) go, like the pill's bottom corners; time
// and field; the bracket link. Same card as a popover and a phone sheet.
function Details({ game, slug, sheet, anchor, avoid = "", onClose, go = null, where = null }) {
  const ref = useRef(null);
  const scrolled = useRef(false);
  const [pos, setPos] = useState(null);
  const tone = divisionTone(game.divisionName);
  const final = game.isFinal || game.status === "final";
  const rows = [1, 2].map((n) => {
    const score = game[`score${n}`];
    const other = game[`score${n === 1 ? 2 : 1}`];
    return {
      ...matchupSide(game, n),
      score,
      won: final && score != null && other != null && score > other,
      place: game[`team${n}Place`] ?? null,
    };
  });
  const rule = game.flow?.rule ?? null;
  const ifGame = game.flow?.ifGame ?? null;
  const winnerStep = nextStep(game.flow?.winner, "winner");
  const loserStep = nextStep(game.flow?.loser, "loser");
  const title = gameTitle(game.label);
  const side = bracketPill(game);

  // Beside the pill on a wide screen, clamped inside the window; kept
  // there while the page or a lane scrolls.
  const place = useCallback(() => {
    if (sheet || !anchor || !ref.current) return;
    // Clear of the open game, its destinations and the arrows between them
    // (JD, 2026-11-09: "dont want this to happen, where the line is
    // blocked"). An arrow to a pill on screen runs inside the box holding
    // both pills, bowing out up to ~22px; an arrow to a pill off the panel
    // is a short labelled stub beside the open game (FlowArrows).
    const a = anchor.getBoundingClientRect();
    const scroller = anchor.closest(".tl-scroll");
    const sr = scroller?.getBoundingClientRect() ?? null;
    const rects = [a];
    for (const id of avoid ? avoid.split(" ") : []) {
      const el = document.querySelector(`.tl-pill[data-game-id="${CSS.escape(id)}"]`);
      const r = el?.getBoundingClientRect();
      const onPanel = r && sr && el.closest(".tl-scroll") === scroller && r.left >= sr.left && r.right <= sr.right && r.bottom > 0 && r.top < window.innerHeight;
      if (onPanel) rects.push(r);
      else rects.push({ left: a.left - 100, right: a.right + 100, top: a.top - 64, bottom: a.bottom + 64 });
    }
    const keep = unionRect(rects, 26);
    const spot = placeClear(
      { w: ref.current.offsetWidth, h: ref.current.offsetHeight },
      keep,
      a,
      { w: window.innerWidth, h: window.innerHeight }
    );
    // No clear spot in this window: scroll the page once so there is one.
    if (!spot.clear && spot.scroll && !scrolled.current) {
      scrolled.current = true;
      window.scrollBy({ top: spot.scroll, behavior: "smooth" });
    }
    setPos({ left: spot.left, top: spot.top });
  }, [sheet, anchor, avoid]);

  useLayoutEffect(() => {
    place();
    if (sheet) return undefined;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [place, sheet]);

  // Portal to <body>: the pill lives inside the horizontally scrolling
  // .tl-scroll, and iOS Safari keeps a position:fixed descendant of an
  // overflow scroller inside that scroller's box, so the "sheet" sat in the
  // day card, flush with its borders. From <body> it is fixed to the screen.
  return createPortal(
    <div
      ref={ref}
      id={`tl-pop-${game.id}`}
      role="dialog"
      aria-label={`${game.divisionName} ${title}`}
      className={`tl-pop tl-tone-${tone}${sheet ? " is-sheet" : ""}`}
      style={sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
    >
      <header className="tl-pop__head">
        <div className="tl-pop__pills">
          <span className="tl-tag">{game.divisionName}</span>
          {side ? (
            <span className={`tl-tag tl-tag--side${side.gold ? " is-gold" : ""}`} title={side.label} aria-label={side.label}>
              {side.text}
            </span>
          ) : null}
          <span className="tl-tag tl-tag--game">{title}</span>
        </div>
        <button type="button" className="tl-pop__close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <section className="tl-sec" aria-label="Matchup">
        <ol className="tl-board">
          {rows.map((r, i) => (
            <li key={i} className={`tl-board__row${r.won ? " is-won" : ""}`}>
              {r.team ? (
                <span className="tl-board__team">{r.team}</span>
              ) : r.game ? (
                <span className="tl-board__team is-pending">
                  <span className="tl-board__from">{r.from}</span> <GameLink title={r.game} go={go} />
                </span>
              ) : (
                <span className="tl-board__team is-pending">{r.pending}</span>
              )}
              {r.place ? (
                <span className="tl-board__out">
                  Out · <span className="tl-corner-place">{r.place}</span>
                </span>
              ) : null}
              {r.score != null ? <span className="tl-board__score">{r.score}</span> : null}
            </li>
          ))}
        </ol>
      </section>

      {ifGame || winnerStep || loserStep ? (
        <section className="tl-sec tl-sec--tight" aria-label="Where the teams go">
          <dl className="tl-next">
            <div>
              <dt>Loser</dt>
              <dd><NextValue step={loserStep} go={go} /></dd>
              {loserStep?.next && where?.loser ? <dd className="tl-next__where tl-next__where--loser">{`(${where.loser})`}</dd> : null}
            </div>
            <div className="tl-next__right">
              <dt>Winner</dt>
              <dd><NextValue step={winnerStep} go={go} /></dd>
              {winnerStep?.next && where?.winner ? <dd className="tl-next__where tl-next__where--winner">{`(${where.winner})`}</dd> : null}
            </div>
          </dl>
          {ifGame ? (
            <p className="tl-next__rule" title={rule ?? undefined}>
              If <GameLink title={`Game ${ifGame}`} go={go} />
              {where?.ifGame ? <span className="tl-next__where">{` (${where.ifGame})`}</span> : null}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="tl-sec tl-sec--tight" aria-label="Time and field">
        <dl className="tl-next">
          <div>
            <dt>Time</dt>
            <dd>{compactTime(game.timeLabel)}</dd>
          </div>
          <div className="tl-next__right">
            <dt>Field</dt>
            <dd>{game.fieldName}</dd>
          </div>
        </dl>
      </section>

      {slug && game.divisionId ? (
        <footer className="tl-sec tl-pop__foot">
          <Link href={`/tournaments/${slug}/division/${game.divisionId}`} className="tl-pop__link">
            {`Open ${game.divisionName} bracket ›`}
          </Link>
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}

// Where the open game's winner (green) and loser (red) go, drawn as two
// arrows over the timeline like the bracket's focus view (JD, 2026-11-09).
// The layer is fixed to the window and redrawn on every scroll, so it
// follows the lane's sideways scroll and the page's. An arrow stays inside
// the open game's own day panel: when the next game is on that panel and in
// view it ends on the pill; otherwise (scrolled off sideways, under the
// phone sheet, or on another day) it ends at the panel's edge pointing that
// way, and the destination pill itself is ringed in the same colour wherever
// it is. Where the teams came from is drawn the same way but dotted, into
// the open game's left or top side (JD, 2026-11-09): green from a game the
// team won, red from one it lost; a seeded team has no feeder and no arrow.
const ARROW = { winner: "#4ade80", loser: "#f87171" };
// The thinner dotted line needs a touch more colour to read on white.
const ARROW_DOTTED = { winner: "#22c55e", loser: "#ef4444" };
// One arrowhead family (JD, 2026-11-09: "make the dotted lines and arrowheads
// sleeker"): a slim swept tip, fixed size in screen px (not scaled by the
// stroke), the same on phone and desktop; the dotted line's tip is a smaller
// copy of the solid one's.
const HEAD_PATH = "M0,1.6 L10,5 L0,8.4 L2.6,5 z";
const HEADS = [
  ...Object.entries(ARROW).map(([role, color]) => ({ id: `tl-head-${role}`, color, size: 10 })),
  ...Object.entries(ARROW_DOTTED).map(([role, color]) => ({ id: `tl-head-${role}-dotted`, color, size: 7 })),
];

// Where the segment a→b leaves the box (a is inside it).
function exitPoint(a, b, box) {
  let t = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx > 0) t = Math.min(t, (box.right - a.x) / dx);
  if (dx < 0) t = Math.min(t, (box.left - a.x) / dx);
  if (dy > 0) t = Math.min(t, (box.bottom - a.y) / dy);
  if (dy < 0) t = Math.min(t, (box.top - a.y) / dy);
  return { x: a.x + dx * Math.max(0, t), y: a.y + dy * Math.max(0, t) };
}

// On open, bring the game and where it leads into view: if the board
// overflows sideways, slide it so a next game on the same day fits
// beside it; always lift the page so the pill sits clear of the sticky
// field header and, on a phone, the sheet.
function reveal(el, dest, feeders = []) {
  requestAnimationFrame(() => {
    const scroller = el.closest(".tl-scroll");
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) {
      const sr = scroller.getBoundingClientRect();
      const timeW = scroller.querySelector(".tl-vcorner, .tl-vtimes, .tl-field")?.getBoundingClientRect().width ?? 0;
      const fr = el.getBoundingClientRect();
      let right = fr.right;
      for (const id of [dest?.winner, dest?.loser]) {
        const d = id ? scroller.querySelector(`.tl-pill[data-game-id="${CSS.escape(String(id))}"]`) : null;
        if (d) right = Math.max(right, d.getBoundingClientRect().right);
      }
      let left = fr.left;
      for (const f of feeders) {
        const d = scroller.querySelector(`.tl-pill[data-game-id="${CSS.escape(String(f.id))}"]`);
        if (d) left = Math.min(left, d.getBoundingClientRect().left);
      }
      const minLeft = sr.left + timeW + 8;
      let dx = 0;
      if (right > sr.right - 8) dx = right - (sr.right - 8);
      if (left - dx < minLeft && right - (left - minLeft) <= sr.right - 8) dx = left - minLeft;
      const stubRoom = feeders.length && left - dx < minLeft ? 64 : 0;
      if (fr.left - dx < minLeft + stubRoom) dx = fr.left - minLeft - stubRoom;
      if (dx) scroller.scrollBy({ left: dx, behavior: "smooth" });
    }
    const sheet = document.querySelector(".tl-pop.is-sheet");
    const head = document.querySelector(".tl-vhead");
    if (sheet || head) {
      const topMin = Math.max(16, head ? head.getBoundingClientRect().bottom + 8 : 16);
      const floor = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
      const fr = el.getBoundingClientRect();
      const root = el.closest(".tl-vboard") || el.closest(".tl-scroll") || document;
      const group = [fr];
      for (const id of [dest?.winner, dest?.loser]) {
        const d = id ? root.querySelector(`.tl-pill[data-game-id="${CSS.escape(String(id))}"]`) : null;
        if (d) group.push(d.getBoundingClientRect());
      }
      const u = unionRect(group, 24);
      const room = floor - 16;
      let dy = 0;
      if (u.bottom - u.top <= room - topMin) {
        if (u.top < topMin || u.bottom > room) dy = u.top - Math.max(topMin, (room - (u.bottom - u.top) + topMin) / 2);
      } else {
        const want = Math.max(topMin, (sheet ? floor : window.innerHeight) * 0.45 - fr.height / 2);
        if (fr.top < topMin || fr.bottom > floor - 16) dy = fr.top - want;
      }
      if (dy) window.scrollBy({ top: dy, behavior: "smooth" });
    }
  });
}

function FlowArrows({ fromEl, winnerId, loserId, feeders = [], labels }) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    if (!fromEl) return undefined;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const scroller = fromEl.closest(".tl-vboard") || fromEl.closest(".tl-scroll");
      if (!scroller) return setPaths([]);
      const sr = scroller.getBoundingClientRect();
      const fieldW = scroller.querySelector(".tl-vcorner, .tl-vtimes, .tl-field")?.getBoundingClientRect().width ?? 0;
      const sheet = document.querySelector(".tl-pop.is-sheet");
      const floor = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
      const box = {
        left: Math.max(sr.left + fieldW, 0) + 6,
        right: Math.min(sr.right, window.innerWidth) - 6,
        top: Math.max(sr.top, 0) + 6,
        bottom: Math.min(sr.bottom, floor) - 6,
      };
      const fr = fromEl.getBoundingClientRect();
      const pill = (id) => (id ? document.querySelector(`.tl-pill[data-game-id="${CSS.escape(String(id))}"]`) : null);
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const wanted = [];
      const destEls = [];
      const ends = [
        ...[["winner", winnerId], ["loser", loserId]].map(([role, id]) => ({ role, id, dir: "out", key: `out-${role}` })),
        ...feeders.map((f, i) => ({ role: f.role, id: f.id, dir: "in", key: `in-${i}` })),
      ];
      for (const { role, id, dir, key } of ends) {
        const el = pill(id);
        if (!el) continue;
        destEls.push(el);
        const r = rect(el);
        // At least partly in view on this panel: the real curve, to the part
        // that shows.
        const seen = (el.closest(".tl-vboard") || el.closest(".tl-scroll")) === scroller ? visiblePart(r, box) : null;
        if (seen) {
          wanted.push({ role, dir, key, to: seen });
          continue;
        }
        // Off this panel (another day, scrolled away, or under the sheet):
        // a short arrow pointing that way, named, and the pill itself ringed.
        wanted.push({
          role,
          dir,
          key,
          toward: (el.closest(".tl-vboard") || el.closest(".tl-scroll")) === scroller ? aimAt(r, box) : { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 },
          alt: dir === "in" ? null : { x: box.right + 400, y: (fr.top + fr.bottom) / 2 },
          reach: (start, u) => {
            const far = exitPoint(start, { x: start.x + u.x * 400, y: start.y + u.y * 400 }, box);
            return Math.min(46, Math.hypot(far.x - start.x, far.y - start.y));
          },
        });
      }
      // Keep clear of the other pills in view, so a line never runs through one.
      const obstacles = [];
      for (const el of scroller.querySelectorAll(".tl-pill")) {
        if (el === fromEl || destEls.includes(el)) continue;
        const r = rect(el);
        if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
        obstacles.push(r);
      }
      // Each arrow gets its own anchors, chosen so the two never cross.
      const planned = planArrows({ from: rect(fromEl), arrows: wanted, obstacles, box });
      // The hour labels along the top: a stub's name must not print over one.
      const hourText = [...scroller.querySelectorAll(".tl-vtime, .tl-hour")].map((h) => {
        const rg = document.createRange();
        rg.selectNodeContents(h);
        return rect(rg);
      });
      const out = [];
      planned.forEach((a, i) => {
        const { key } = a;
        const dotted = a.dir === "in";
        if (a.kind === "curve") {
          if (Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) < 8) return;
          out.push({ key, role: a.role, dotted, d: a.d });
          return;
        }
        const label = dotted ? labels?.from?.[key] ?? null : labels?.[a.role] ?? null;
        // Beside the stub, clear of every pill's number and every arrow (its own too).
        const pillsInView = [...obstacles, ...destEls.map(rect), rect(fromEl), ...hourText];
        const stub = dotted ? { start: a.base, tip: a.tip, u: a.u } : a;
        const at = label
          ? placeLabel(label, stub, { pills: pillsInView, avoid: planned.map((b) => (b === a ? b.pts.slice(1, -1) : b.pts)), box })
          : null;
        out.push({ key, role: a.role, dotted, d: a.d, label, at });
      });
      // Two names side by side would print over each other: lift one.
      const span = (q) => {
        const w = q.label.length * 6.5;
        const x0 = q.at.anchor === "end" ? q.at.x - w : q.at.anchor === "middle" ? q.at.x - w / 2 : q.at.x;
        return { x0, x1: x0 + w, y0: q.at.y - 10, y1: q.at.y };
      };
      const named = out.filter((q) => q.label);
      for (const q of named) if (q.at.y > box.bottom) q.at = { ...q.at, y: box.bottom };
      // Up or down, whichever keeps it nearer its own arrow's tip.
      const tipOf = (q) => {
        const m = /L(-?[\d.]+),(-?[\d.]+)$/.exec(q.d) ?? /^M(-?[\d.]+),(-?[\d.]+)/.exec(q.d);
        return m ? { x: +m[1], y: +m[2] } : q.at;
      };
      for (let i = 0; i < named.length; i++) {
        for (let j = 0; j < i; j++) {
          const a = span(named[j]);
          const b = span(named[i]);
          if (!(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2)) continue;
          const tip = named[i].dotted ? /^M(-?[\d.]+),(-?[\d.]+)/.exec(named[i].d) : null;
          const t = tip ? { x: +tip[1], y: +tip[2] } : tipOf(named[i]);
          const up = Math.min(a.y0, b.y0) - 3;
          const down = Math.max(a.y1, b.y1) + 13;
          const useUp = down > box.bottom || Math.abs(up - 4 - t.y) <= Math.abs(down - 4 - t.y);
          named[i].at = { ...named[i].at, y: useUp ? up : down };
        }
      }
      setPaths(out);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // Redraw once the sheet and the pills finish moving (no timers: the
    // timeline never polls).
    window.addEventListener("transitionend", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("transitionend", schedule, true);
    };
  }, [fromEl, winnerId, loserId, feeders, labels]);
  if (!paths.length) return null;
  return (
    <svg className="tl-arrows" aria-hidden="true" focusable="false">
      <defs>
        {HEADS.map((h) => (
          <marker
            key={h.id}
            id={h.id}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth={h.size}
            markerHeight={h.size}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d={HEAD_PATH} fill={h.color} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <g key={p.key}>
          <path d={p.d} className={`tl-arrow__halo${p.dotted ? " tl-arrow__halo--dotted" : ""}`} />
          <path d={p.d} className={`tl-arrow tl-arrow--${p.role}${p.dotted ? " tl-arrow--dotted" : ""}`} markerEnd={`url(#tl-head-${p.role}${p.dotted ? "-dotted" : ""})`} />
          {p.label ? (
            <text x={p.at.x} y={p.at.y} textAnchor={p.at.anchor} className={`tl-arrow__label tl-arrow__label--${p.role}`}>
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}


// Compact header help (JD, 2026-11-10): the W/L shading, final, championship,
// if-necessary, dashed "could still play" ring, and corner letters all live
// behind a "?" — the visible row is just the M/W/C chips and this button.
function TimelineHelp({ sheet }) {
  const btn = useRef(null);
  const pop = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const close = useCallback((refocus) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  const place = useCallback(() => {
    if (sheet || !btn.current || !pop.current) return;
    const a = btn.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    const margin = 12;
    const gap = 8;
    const left = Math.min(Math.max(margin, a.right - w), Math.max(margin, window.innerWidth - w - margin));
    let top = a.bottom + gap;
    if (top + h > window.innerHeight - margin && a.top - gap - h >= margin) top = a.top - gap - h;
    else top = Math.min(top, Math.max(margin, window.innerHeight - h - margin));
    setPos({ left, top });
  }, [sheet]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    if (sheet) return undefined;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place, sheet]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close(true);
    };
    const onDown = (e) => {
      if (pop.current?.contains(e.target) || btn.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  const panel = open
    ? createPortal(
        <div
          ref={pop}
          id="tl-help"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tl-help-title"
          className={`tl-help${sheet ? " is-sheet" : ""}`}
          style={sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
        >
          <header className="tl-help__head">
            <h2 id="tl-help-title" className="tl-help__title">How to read a game</h2>
            <button type="button" className="tl-pop__close" aria-label="Close" onClick={() => close(true)}>
              <CloseIcon />
            </button>
          </header>
          <figure className="tl-help__demo">
            <figcaption className="tl-help__callout">
              <strong>Came from</strong>
              W5 = winner of game 5
            </figcaption>
            <div className="tl-help__pill tl-tone-mens-d" aria-hidden="true">
              <span className="tl-corner tl-corner--tl">W5</span>
              <span className="tl-corner tl-corner--tr">L8</span>
              <span className="tl-help__pill-num">12</span>
              <span className="tl-corner tl-corner--bl">→19</span>
              <span className="tl-corner tl-corner--br">→22</span>
            </div>
            <div className="tl-help__ends">
              <p className="tl-help__callout"><strong>Loser goes here</strong></p>
              <p className="tl-help__callout tl-help__callout--right"><strong>Winner goes here</strong></p>
            </div>
          </figure>
          <ul className="tl-help__marks">
            <li><span className="tl-help__swatch tl-help__swatch--winners" aria-hidden="true" />Shaded: winners&apos; bracket</li>
            <li><span className="tl-help__swatch tl-help__swatch--losers" aria-hidden="true" />White: losers&apos; bracket</li>
            <li><span className="tl-help__swatch tl-help__swatch--done" aria-hidden="true" />Dark: final, the score is in</li>
            <li><span className="tl-help__swatch tl-help__swatch--final" aria-hidden="true"><Star className="tl-bgstar" /></span>Gold star: championship</li>
            <li><span className="tl-help__swatch tl-help__swatch--if" aria-hidden="true"><Star className="tl-bgstar" /></span>Dashed star: if necessary, only if needed</li>
            <li><span className="tl-help__swatch tl-help__swatch--could" aria-hidden="true" />Dashed outline: games your team could still play</li>
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tl-help__btn"
        aria-label="How to read the timeline"
        aria-expanded={open}
        aria-controls="tl-help"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {panel}
    </>
  );
}


// Desktop Path view: the Timeline grid with only the followed team's
// played + reachable games shown (same set as the phone Path), and the
// win / loss / if route drawn over the top. Hidden games leave empty
// spots; days, fields, hours and card positions stay as in Timeline.
function PathRoutes({ edges }) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    if (!edges?.length) return undefined;
    let frame = 0;
    const mid = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    const draw = () => {
      frame = 0;
      const pill = (id) => (id ? document.querySelector(`.path-view .tl-pill[data-game-id="${CSS.escape(String(id))}"]`) : null);
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const out = [];
      for (const e of edges) {
        const aEl = pill(e.from);
        const bEl = pill(e.to);
        if (!aEl || !bEl) continue;
        const a = rect(aEl);
        const b = rect(bEl);
        const ac = mid(a);
        const bc = mid(b);
        let d;
        const sameRow = Math.abs(ac.y - bc.y) < 16;
        const sideways = Math.abs(ac.x - bc.x) > 24;
        if (sameRow) {
          // Same field row: a straight line, so Thursday runs into Friday.
          const rightward = ac.x <= bc.x;
          const s = { x: rightward ? a.right : a.left, y: ac.y };
          const t = { x: rightward ? b.left : b.right, y: bc.y };
          d = `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${t.x.toFixed(1)},${t.y.toFixed(1)}`;
        } else if (sideways) {
          // Cross-day, different field: go out the side, then along the row, then in.
          const rightward = ac.x <= bc.x;
          const s = { x: rightward ? a.right : a.left, y: ac.y };
          const t = { x: rightward ? b.left : b.right, y: bc.y };
          const midX = (s.x + t.x) / 2;
          d = `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${midX.toFixed(1)},${s.y.toFixed(1)} L${midX.toFixed(1)},${t.y.toFixed(1)} L${t.x.toFixed(1)},${t.y.toFixed(1)}`;
        } else {
          const down = ac.y < bc.y;
          const s = { x: ac.x, y: down ? a.bottom : a.top };
          const t = { x: bc.x, y: down ? b.top : b.bottom };
          const midY = (s.y + t.y) / 2;
          d = `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${s.x.toFixed(1)},${midY.toFixed(1)} L${t.x.toFixed(1)},${midY.toFixed(1)} L${t.x.toFixed(1)},${t.y.toFixed(1)}`;
        }
        out.push({ key: `${e.from}>${e.to}:${e.kind}`, kind: e.kind, actual: e.actual, d });
      }
      setPaths(out);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [edges]);
  if (!paths.length) return null;
  return (
    <svg className="tl-path-arrows" aria-hidden="true" focusable="false">
      {paths.map((p) => (
        <path key={p.key} d={p.d} className={`tl-path-line tl-path-line--${p.kind}${p.actual ? " is-actual" : ""}`} />
      ))}
    </svg>
  );
}

// Phones get the bottom sheet: narrow screens, plus touch phones held sideways.
export const PHONE_SHEET_QUERY = "(max-width: 639px), (pointer: coarse) and (max-height: 500px)";
// Vertical grid on phones only, same 640px split as the Path view (JD:
// "Phone vertical of course."). Desktop stays the horizontal lanes.
export const PHONE_VERTICAL_QUERY = "(max-width: 639px)";

export default function ScheduleTimeline({ rows, timeZone, zoneShort = "", slug, team = null, pathMode = false, divisions = [] }) {
  const { days, unplaced, fields } = useMemo(() => buildTimeline(rows, timeZone), [rows, timeZone]);
  const legend = useMemo(() => divisionLegendGroups(rows), [rows]);
  const [openId, setOpenId] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [vertical, setVertical] = useState(true);
  const pills = useRef(new Map());
  const headRef = useRef(null);
  // The followed team (the picker above): their games stay bright, the rest
  // step back, and their NEXT game gets a lime glow — "next" means the same
  // thing as on the bracket (lib/team-games.js).
  const teamRows = useMemo(() => fromScheduleRows(rows), [rows]);
  const mine = useMemo(() => teamGameIds(teamRows, team), [teamRows, team]);
  const nextId = useMemo(() => teamNextGame(teamRows, team), [teamRows, team]);
  // Every game they could still play from there (win or lose their way in):
  // lit with a dashed ring until their name is on it.
  const could = useMemo(() => teamReachIds(rows, team, nextId), [rows, team, nextId]);
  // Path mode hides every game the followed team is not in and cannot
  // reach — the same played + reach set the phone Path already shows.
  const pathTrack = useMemo(() => {
    if (!pathMode || !team?.name) return null;
    const family = divisionFamily(divisions, team.divisionId) ?? new Set([team.divisionId]);
    const { index } = fieldGrid(rows, timeZone, new Date(), { siteUrl: "", slug: slug ?? "" });
    const tr = gridTrack(rows, team.name, family, null, index);
    const idOf = new Map([...index.entries()].map(([id, i]) => [i, id]));
    const showIds = new Set();
    for (const i of [...tr.played, ...tr.reach]) {
      const id = idOf.get(i);
      if (id != null) showIds.add(id);
    }
    const seen = {};
    const edges = [];
    const push = (e, actual) => {
      const from = idOf.get(e[0]);
      const to = idOf.get(e[1]);
      const k = `${from}>${to}:${e[2]}`;
      if (from == null || to == null || seen[k]) return;
      seen[k] = true;
      edges.push({ from, to, kind: e[2], actual });
    };
    for (const e of tr.went) push(e, true);
    for (const e of tr.edges) push(e, false);
    return { showIds, edges };
  }, [pathMode, team, divisions, rows, timeZone, slug]);
  const pathVisible = (id) => !pathMode || !pathTrack || pathTrack.showIds.has(id);
  const targets = useMemo(() => flowTargets(rows), [rows]);
  const dest = openId ? targets.get(openId) ?? null : null;
  // Where the open game's teams came from: every game whose winner or loser
  // plays here (both slots can come from one game, e.g. the if-game).
  const feedersOf = useCallback(
    (id) => {
      const out = [];
      if (!id) return out;
      for (const [src, t] of targets) {
        if (t.winner === id) out.push({ id: src, role: "winner" });
        if (t.loser === id) out.push({ id: src, role: "loser" });
      }
      return out;
    },
    [targets]
  );
  const feeders = useMemo(() => feedersOf(openId), [feedersOf, openId]);
  // "Game 25 · Fri" for an arrow that has to stop at the panel's edge.
  const arrowLabels = useMemo(() => {
    if (!openId || (!dest && !feeders.length)) return null;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const day = (r) => (r?.timeLabel ?? "").split(" ")[0];
    const open = byId.get(openId);
    const say = (id) => {
      const r = id ? byId.get(id) : null;
      if (!r) return null;
      const d = day(r);
      return `${gameTitle(r.label)}${d && d !== day(open) ? ` · ${d}` : ""}`;
    };
    // "from Game 25" (with the day when it was another day) on a dotted stub.
    const from = Object.fromEntries(feeders.map((f, i) => [`in-${i}`, say(f.id) ? `from ${say(f.id)}` : null]));
    return { winner: say(dest?.winner), loser: say(dest?.loser), from };
  }, [openId, dest, feeders, rows]);
  const markOf = (id) => {
    const out = [];
    if (openId) {
      const src = feeders.find((f) => f.id === id);
      if (id === dest?.winner) out.push("is-dest-win");
      else if (id === dest?.loser) out.push("is-dest-lose");
      else if (src) out.push(feeders.some((f) => f.id === id && f.role === "winner") ? "is-src-win" : "is-src-lose");
      else if (id !== openId) out.push("is-dim");
    } else if (team && (mine.size > 0 || could.size > 0)) {
      if (could.has(id) && !mine.has(id)) out.push("is-could");
      else if (!mine.has(id)) out.push("is-back");
    }
    if (id === nextId) out.push("is-next");
    return out.join(" ");
  };

  // Phone sheet open: room under the page, so a game on the last day's lower
  // rows can still be lifted clear of the sheet (the page ran out of scroll).
  useEffect(() => {
    if (!openId || !sheet) return undefined;
    document.body.classList.add("tl-sheet-open");
    return () => document.body.classList.remove("tl-sheet-open");
  }, [openId, sheet]);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_SHEET_QUERY);
    const sync = () => setSheet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia(PHONE_VERTICAL_QUERY);
    const sync = () => setVertical(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Same width as the tabs bar above so the key spreads across that
  // row on a phone and stays capped (not stretched) on desktop.
  useLayoutEffect(() => {
    const head = headRef.current;
    const tabs = document.querySelector(".sched-seg");
    if (!head) return undefined;
    const apply = () => {
      const w = tabs ? tabs.getBoundingClientRect().width : 0;
      head.style.width = w > 0 ? `${Math.round(w)}px` : "";
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (tabs) ro.observe(tabs);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      head.style.width = "";
    };
  }, []);

  const close = useCallback(
    (refocus) => {
      if (refocus && openId) pills.current.get(openId)?.focus();
      setOpenId(null);
    },
    [openId]
  );

  useEffect(() => {
    if (!openId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close(true);
    };
    const onDown = (e) => {
      const pop = document.getElementById(`tl-pop-${openId}`);
      const pill = pills.current.get(openId);
      if (pop?.contains(e.target) || pill?.contains(e.target)) return;
      // Tapping a different game must not dismiss first: closing the
      // sheet drops body.tl-sheet-open padding and the page jumps, so
      // the same viewport point's click lands on a different pill
      // (JD: "When I click on 34 it jumps to 26"). Let that pill's
      // onClick switch the open game with the sheet still in place.
      if (e.target.closest?.(".tl-pill")) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [openId, close]);

  const toggle = (id, el) => {
    setAnchor(el);
    const opening = openId !== id;
    setOpenId(opening ? id : null);
    if (opening) reveal(el, targets.get(id), feedersOf(id));
  };

  // Follow a "Game 17" on the open card: bring its pill (on whatever day)
  // into view and open it, exactly as if it had been tapped.
  const byNumber = useMemo(() => gameNumberIndex(rows), [rows]);
  // Day, time and field of where the open game's teams play next.
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const whereNext = (g) => {
    const t = targets.get(g.id);
    const at = (id) => (id ? whereWhen(rowById.get(id)) : null);
    const ifId = g.flow?.ifGame ? gameIdByTitle(byNumber, g.divisionId, g.flow.ifGame) : null;
    return { winner: at(t?.winner), loser: at(t?.loser), ifGame: at(ifId) };
  };
  const openGame = (id) => {
    const el = pills.current.get(id);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "center" });
    el.focus({ preventScroll: true });
    setAnchor(el);
    setOpenId(id);
    reveal(el, targets.get(id), feedersOf(id));
  };

  const dayPairs = [];
  for (let i = 0; i < days.length; i += 2) dayPairs.push(days.slice(i, i + 2));

  return (
    <div className={pathMode ? "tl tl--path" : "tl"}>
      <div className="tl-head" ref={headRef}>
        <div className="tl-legend" role="list" aria-label="Divisions">
          {legend.map((g, gi) => (
            <Fragment key={g.group ?? `other-${gi}`}>
              {gi > 0 ? (
                <>
                  <span className="tl-legend__gap" aria-hidden="true" />
                  <span className="tl-legend__gutter" aria-hidden="true">
                    <SoftballMark />
                  </span>
                  <span className="tl-legend__gap" aria-hidden="true" />
                </>
              ) : null}
              <div className="tl-legend__group" role="listitem" aria-label={g.group ?? undefined}>
                {g.short || g.group ? (
                  <span className="tl-legend__group-name" aria-hidden={Boolean(g.short)}>{g.short ?? g.group}</span>
                ) : null}
                <ul className="tl-legend__items">
                  {g.items.map((d) => (
                    <li key={d.name} className={`tl-legend__chip tl-tone-${d.tone}`} aria-label={d.name}>
                      {d.short}
                    </li>
                  ))}
                </ul>
              </div>
            </Fragment>
          ))}
          {legend.length ? <span className="tl-legend__gap" aria-hidden="true" /> : null}
        </div>
        <TimelineHelp sheet={sheet} />
      </div>

      {vertical && fields.length ? (
        <div className="tl-vboard" style={{ "--tl-fields": fields.length }}>
          <header className="tl-vhead">
            <div className="tl-vcorner">{zoneShort}</div>
            {fields.map((f, i) => {
              const parts = fieldNameParts(f);
              return (
                <div key={f} className={`tl-vfield${i % 2 === 0 ? " tint" : ""}`}>
                  <span>{parts.park}</span>
                  {parts.field ? <span>{parts.field}</span> : null}
                </div>
              );
            })}
          </header>
          <div className="tl-vbody">
            {fields.map((_, i) =>
              i % 2 === 0 ? <div key={`tint-${i}`} className="tl-coltint" style={{ "--i": i }} /> : null
            )}
            {days.map((day) => (
              <section key={day.key} className="tl-day" aria-label={`${day.title}, ${day.date}`}>
                <div className="tl-vday">
                  {day.title} {day.date} · {day.count} game{day.count === 1 ? "" : "s"}
                </div>
                <div
                  className="tl-vgrid"
                  style={{ "--tl-hours": day.hours.length, "--tl-hour": `${ROW_PX}px` }}
                >
                  <div className="tl-vtimes" aria-hidden="true">
                    {day.hours.map((h) => (
                      <span key={h} className="tl-vtime">
                        {hourLabel(h)}
                      </span>
                    ))}
                  </div>
                  {day.lanes.map((lane) => (
                    <div key={lane.field} className="tl-vcol">
                      {lane.games.map((g) => (
                        <span key={g.id} className="tl-slot">
                          <Pill
                            game={g}
                            vertical
                            mark={markOf(g.id)}
                            open={openId === g.id}
                            onToggle={toggle}
                            pillRef={(el) => {
                              if (el) pills.current.set(g.id, el);
                              else pills.current.delete(g.id);
                            }}
                          />
                          {openId === g.id ? (
                            <Details
                              game={g}
                              slug={slug}
                              sheet={sheet}
                              anchor={anchor}
                              avoid={[dest?.winner, dest?.loser, ...feeders.map((f) => f.id)].filter(Boolean).join(" ")}
                              onClose={() => close(true)}
                              go={{ idOf: (title) => gameIdByTitle(byNumber, g.divisionId, title), open: openGame }}
                              where={whereNext(g)}
                            />
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {!vertical
        ? dayPairs.map((pair) => {
            const totalHours = pair.reduce((n, d) => n + d.hours.length, 0);
            const split = pair.length > 1;
            return (
              <section
                key={pair.map((d) => d.key).join("+")}
                className="tl-day tl-day--pair"
                style={{ "--tl-hours": totalHours, ...(split ? {} : { "--tl-split": "0px" }) }}
                aria-label={pair.map((d) => `${d.title}, ${d.date}`).join("; ")}
              >
                <header className="tl-day__head tl-day__head--pair">
                  <div className="tl-day__head-gutter" />
                  {pair.map((day, i) => (
                    <Fragment key={day.key}>
                      {i > 0 ? <div className="tl-day-split" aria-hidden="true" /> : null}
                      <div className="tl-day__span" data-day={day.key} style={{ "--tl-hours": day.hours.length }}>
                        <h2 className="tl-day__title">{day.title}</h2>
                        <span className="tl-day__meta">
                          {day.date} · {day.count} game{day.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </header>
                <div className="tl-scroll">
                  <div className="tl-grid">
                    <div className="tl-row tl-row--axis">
                      <div className="tl-field tl-field--corner">{zoneShort}</div>
                      {pair.map((day, i) => (
                        <Fragment key={day.key}>
                          {i > 0 ? <div className="tl-day-split" aria-hidden="true" /> : null}
                          <div className="tl-track tl-track--axis" data-day={day.key} style={{ "--tl-hours": day.hours.length }}>
                            {day.hours.map((h) => (
                              <span key={h} className="tl-hour">
                                {hourLabel(h)}
                              </span>
                            ))}
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    {fields.map((field) => (
                      <div key={field} className="tl-row">
                        <div className="tl-field">{field}</div>
                        {pair.map((day, i) => {
                          const lane = day.lanes.find((l) => l.field === field) ?? { field, games: [] };
                          return (
                            <Fragment key={day.key}>
                              {i > 0 ? <div className="tl-day-split" aria-hidden="true" /> : null}
                              <div className="tl-track" data-day={day.key} style={{ "--tl-hours": day.hours.length }}>
                                {lane.games.filter((g) => pathVisible(g.id)).map((g) => (
                                  <span key={g.id} className="tl-slot">
                                    <Pill
                                      game={g}
                                      mark={markOf(g.id)}
                                      open={openId === g.id}
                                      onToggle={toggle}
                                      pillRef={(el) => {
                                        if (el) pills.current.set(g.id, el);
                                        else pills.current.delete(g.id);
                                      }}
                                    />
                                    {openId === g.id ? (
                                      <Details
                                        game={g}
                                        slug={slug}
                                        sheet={sheet}
                                        anchor={anchor}
                                        avoid={[dest?.winner, dest?.loser, ...feeders.map((f) => f.id)].filter(Boolean).join(" ")}
                                        onClose={() => close(true)}
                                        go={{ idOf: (title) => gameIdByTitle(byNumber, g.divisionId, title), open: openGame }}
                                        where={whereNext(g)}
                                      />
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })
        : null}

      {pathMode && pathTrack?.edges?.length ? <PathRoutes edges={pathTrack.edges} /> : null}

      {openId && anchor ? (
        <FlowArrows fromEl={anchor} winnerId={dest?.winner ?? null} loserId={dest?.loser ?? null} feeders={feeders} labels={arrowLabels} />
      ) : null}

      {unplaced.length > 0 ? (
        <p className="t-meta">
          Not on the timeline yet (no time or field): {unplaced.length} game
          {unplaced.length === 1 ? "" : "s"}. They are in By field and By time.
        </p>
      ) : null}
    </div>
  );
}
