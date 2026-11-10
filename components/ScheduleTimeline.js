"use client";

import { SIDE_LABELS } from "@/lib/bracket/side";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/schedule-timeline";
import { fromScheduleRows, teamGameIds, teamNextGame } from "@/lib/team-games";

// Timeline view of the schedule (JD, 2026-11-09): one lane per field, the
// day's hours across the top, one panel per day. Each game is a small pill
// that says only its number in its division's colour; tapping it opens the
// details beside it (a sheet at the bottom on a phone). One open at a time;
// Esc or a tap anywhere else closes it. A data refresh keeps it open —
// the open game is remembered by id, not by position.

const HOUR_PX = 92;

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

const PILL_GAP = 4;




function Pill({ game, open, onToggle, pillRef, mark }) {
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
  return (
    <button
      type="button"
      ref={pillRef}
      data-game-id={game.id}
      className={`tl-pill tl-tone-${tone}${side ? ` tl-side-${side}` : ""}${final ? " is-final" : ""}${open ? " is-open" : ""}${mark ? ` ${mark}` : ""}`}
      style={{
        left: (game.offset / 60) * HOUR_PX + PILL_GAP,
        width: (game.length / 60) * HOUR_PX - PILL_GAP * 2,
      }}
      aria-expanded={open}
      aria-controls={open ? `tl-pop-${game.id}` : undefined}
      aria-label={`${game.divisionName} ${game.label ?? ""}${side ? `, ${SIDE_LABELS[side]}` : ""}, ${game.timeLabel ?? ""}, ${game.fieldName}${
        final ? ", final" : ""
      }${place ? `, a team finished ${place}` : ""}${words ? `. ${words}` : ""}`}
      onClick={(e) => onToggle(game.id, e.currentTarget)}
    >
      {champ ? <Star className="tl-bgstar" /> : null}
      <span className="tl-pill__num">{number}</span>
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

function NextValue({ step }) {
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
  if (step.next) return <span className="tl-next__value"><span aria-hidden="true" className="tl-next__arrow">→</span> {step.next}</span>;
  return <span className="tl-next__value">{step.text}</span>;
}

// The opened pill, top to bottom (JD, 2026-11-09): one row of pills —
// division, W/L (or ★ Final), Game N; the matchup scoreboard; where the
// loser (left) and winner (right) go, like the pill's bottom corners; time
// and field; the bracket link. Same card as a popover and a phone sheet.
function Details({ game, slug, sheet, anchor, onClose }) {
  const ref = useRef(null);
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
    const a = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(Math.max(12, a.left + a.width / 2 - w / 2), vw - w - 12);
    let top = a.bottom + 8;
    if (top + h > vh - 12) top = Math.max(12, a.top - h - 8);
    setPos({ left, top });
  }, [sheet, anchor]);

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

  return (
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
                  <span className="tl-board__from">{r.from}</span> {r.game}
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
              <dd><NextValue step={loserStep} /></dd>
            </div>
            <div className="tl-next__right">
              <dt>Winner</dt>
              <dd><NextValue step={winnerStep} /></dd>
            </div>
          </dl>
          {ifGame ? <p className="tl-next__rule" title={rule ?? undefined}>{`If Game ${ifGame}`}</p> : null}
        </section>
      ) : null}

      <section className="tl-sec tl-sec--tight" aria-label="Time and field">
        <dl className="tl-next">
          <div>
            <dt>Time</dt>
            <dd>{game.timeLabel}</dd>
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
    </div>
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
// it is.
const ARROW = { winner: "#4ade80", loser: "#f87171" };

function edgePoint(r, toward, pad = 3) {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (r.width / 2 + pad) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.height / 2 + pad) / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return { x: cx + dx * k, y: cy + dy * k };
}

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

function arrowPath(from, to, bend) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(44, len * 0.32) * bend;
  return `M${from.x.toFixed(1)},${from.y.toFixed(1)} Q${(mx - (dy / len) * k).toFixed(1)},${(my + (dx / len) * k).toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
}

// On open, bring the game and where it leads into view: slide the lane so a
// next game on the same day fits beside it, and on a phone lift the page so
// the pill sits clear of the sheet.
function reveal(el, dest) {
  requestAnimationFrame(() => {
    const scroller = el.closest(".tl-scroll");
    if (scroller) {
      const sr = scroller.getBoundingClientRect();
      const fieldW = scroller.querySelector(".tl-field")?.getBoundingClientRect().width ?? 0;
      const fr = el.getBoundingClientRect();
      let right = fr.right;
      for (const id of [dest?.winner, dest?.loser]) {
        const d = id ? scroller.querySelector(`.tl-pill[data-game-id="${CSS.escape(String(id))}"]`) : null;
        if (d) right = Math.max(right, d.getBoundingClientRect().right);
      }
      const minLeft = sr.left + fieldW + 8;
      let dx = 0;
      if (right > sr.right - 8) dx = right - (sr.right - 8);
      if (fr.left - dx < minLeft) dx = fr.left - minLeft;
      if (dx) scroller.scrollBy({ left: dx, behavior: "smooth" });
    }
    const sheet = document.querySelector(".tl-pop.is-sheet");
    if (sheet) {
      const top = sheet.getBoundingClientRect().top;
      const fr = el.getBoundingClientRect();
      const want = Math.max(16, top * 0.45 - fr.height / 2);
      if (fr.top < 16 || fr.bottom > top - 16) window.scrollBy({ top: fr.top - want, behavior: "smooth" });
    }
  });
}

function FlowArrows({ fromEl, winnerId, loserId, labels }) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    if (!fromEl) return undefined;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const scroller = fromEl.closest(".tl-scroll");
      if (!scroller) return setPaths([]);
      const sr = scroller.getBoundingClientRect();
      const fieldW = scroller.querySelector(".tl-field")?.getBoundingClientRect().width ?? 0;
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
      const winnerEl = pill(winnerId);
      const loserEl = pill(loserId);
      const out = [];
      const inBox = (q) => q.x >= box.left - 1 && q.x <= box.right + 1 && q.y >= box.top - 1 && q.y <= box.bottom + 1;
      for (const [role, el, side] of [["winner", winnerEl, -1], ["loser", loserEl, 1]]) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const edge = edgePoint(fr, c);
        const dx = c.x - edge.x;
        const dy = c.y - edge.y;
        const len = Math.hypot(dx, dy) || 1;
        const u = { x: dx / len, y: dy / len };
        // The two arrows leave a little apart, winner on the right-hand
        // side of travel and loser on the left, like the pill's corners.
        const start = { x: edge.x - u.y * 6 * side, y: edge.y + u.x * 6 * side };
        const end = edgePoint(r, start, 4);
        if (el.closest(".tl-scroll") === scroller && inBox(end)) {
          if (Math.hypot(end.x - start.x, end.y - start.y) < 8) continue;
          out.push({ role, d: arrowPath(start, end, side) });
          continue;
        }
        // Off this panel (another day, scrolled away, or under the sheet):
        // a short arrow pointing that way, named, and the pill itself ringed.
        const far = exitPoint(start, { x: start.x + u.x * 400, y: start.y + u.y * 400 }, box);
        const reach = Math.min(46, Math.hypot(far.x - start.x, far.y - start.y));
        if (reach < 14) continue;
        const tip = { x: start.x + u.x * reach, y: start.y + u.y * reach };
        const across = Math.abs(u.x) >= Math.abs(u.y);
        out.push({
          role,
          d: `M${start.x.toFixed(1)},${start.y.toFixed(1)} L${tip.x.toFixed(1)},${tip.y.toFixed(1)}`,
          label: labels?.[role] ?? null,
          at: across
            ? { x: tip.x - u.x * 4, y: tip.y + (side < 0 ? -9 : 15), anchor: u.x > 0 ? "end" : "start" }
            : { x: tip.x + (side < 0 ? 7 : -7), y: tip.y + u.y * 4 + 4, anchor: side < 0 ? "start" : "end" },
        });
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
  }, [fromEl, winnerId, loserId, labels]);
  if (!paths.length) return null;
  return (
    <svg className="tl-arrows" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(ARROW).map(([role, color]) => (
          <marker key={role} id={`tl-head-${role}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={color} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <g key={p.role}>
          <path d={p.d} className="tl-arrow__halo" />
          <path d={p.d} className={`tl-arrow tl-arrow--${p.role}`} markerEnd={`url(#tl-head-${p.role})`} />
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

export default function ScheduleTimeline({ rows, timeZone, zoneShort = "", slug, team = null }) {
  const { days, unplaced } = useMemo(() => buildTimeline(rows, timeZone), [rows, timeZone]);
  const legend = useMemo(() => divisionLegendGroups(rows), [rows]);
  const [openId, setOpenId] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [sheet, setSheet] = useState(false);
  const pills = useRef(new Map());
  // The followed team (the picker above): their games stay bright, the rest
  // step back, and their NEXT game gets a lime glow — "next" means the same
  // thing as on the bracket (lib/team-games.js).
  const teamRows = useMemo(() => fromScheduleRows(rows), [rows]);
  const mine = useMemo(() => teamGameIds(teamRows, team), [teamRows, team]);
  const nextId = useMemo(() => teamNextGame(teamRows, team), [teamRows, team]);
  const targets = useMemo(() => flowTargets(rows), [rows]);
  const dest = openId ? targets.get(openId) ?? null : null;
  // "Game 25 · Fri" for an arrow that has to stop at the panel's edge.
  const arrowLabels = useMemo(() => {
    if (!openId || !dest) return null;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const day = (r) => (r?.timeLabel ?? "").split(" ")[0];
    const from = byId.get(openId);
    const say = (id) => {
      const r = id ? byId.get(id) : null;
      if (!r) return null;
      const d = day(r);
      return `${gameTitle(r.label)}${d && d !== day(from) ? ` · ${d}` : ""}`;
    };
    return { winner: say(dest.winner), loser: say(dest.loser) };
  }, [openId, dest, rows]);
  const markOf = (id) => {
    const out = [];
    if (openId) {
      if (id === dest?.winner) out.push("is-dest-win");
      else if (id === dest?.loser) out.push("is-dest-lose");
      else if (id !== openId) out.push("is-dim");
    } else if (team && mine.size > 0 && !mine.has(id)) out.push("is-back");
    if (id === nextId) out.push("is-next");
    return out.join(" ");
  };

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setSheet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
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
    if (opening) reveal(el, targets.get(id));
  };

  return (
    <div className="tl">
      <div className="tl-legend" role="list" aria-label="Divisions">
        {legend.map((g, gi) => (
          <div key={g.group ?? `other-${gi}`} className="tl-legend__group" role="listitem">
            {g.group ? <span className="tl-legend__group-name">{g.group}</span> : null}
            <ul className="tl-legend__items">
              {g.items.map((d) => (
                <li key={d.name} className={`tl-legend__chip tl-tone-${d.tone}`} aria-label={d.name}>
                  {d.short}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul className="tl-key" aria-label="Pill styles">
        <li className="tl-key__winners"><span className="tl-key__swatch tl-key__swatch--winners" aria-hidden="true" />Winners</li>
        <li className="tl-key__losers"><span className="tl-key__swatch tl-key__swatch--losers" aria-hidden="true" />Losers</li>
        <li className="tl-key__final">
          <span className="tl-key__swatch tl-key__swatch--final" aria-hidden="true"><Star className="tl-bgstar" /></span>Final
        </li>
        <li className="tl-key__final">
          <span className="tl-key__swatch tl-key__swatch--if" aria-hidden="true"><Star className="tl-bgstar" /></span>If necessary
        </li>
        <li className="tl-key__corners">Corners: ↖↗ from (W5 = winner of game 5) · ↙ loser to · ↘ winner to</li>
      </ul>

      {days.map((day) => (
        <section key={day.key} className="tl-day" aria-label={`${day.title}, ${day.date}`}>
          <header className="tl-day__head">
            <h2 className="tl-day__title">{day.title}</h2>
            <span className="tl-day__meta">
              {day.date} · {day.count} game{day.count === 1 ? "" : "s"}
            </span>
          </header>
          <div className="tl-scroll">
            <div className="tl-grid" style={{ "--tl-hours": day.hours.length, "--tl-hour": `${HOUR_PX}px` }}>
              <div className="tl-row tl-row--axis">
                <div className="tl-field tl-field--corner">{zoneShort}</div>
                <div className="tl-track tl-track--axis">
                  {day.hours.map((h, i) => (
                    <span key={h} className="tl-hour" style={{ left: i * HOUR_PX, width: HOUR_PX }}>
                      {hourLabel(h)}
                    </span>
                  ))}
                </div>
              </div>
              {day.lanes.map((lane) => (
                <div key={lane.field} className="tl-row">
                  <div className="tl-field">{lane.field}</div>
                  <div className="tl-track">
                    {lane.games.map((g) => (
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
                            onClose={() => close(true)}
                          />
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {openId && anchor ? <FlowArrows fromEl={anchor} winnerId={dest?.winner ?? null} loserId={dest?.loser ?? null} labels={arrowLabels} /> : null}

      {unplaced.length > 0 ? (
        <p className="t-meta">
          Not on the timeline yet (no time or field): {unplaced.length} game
          {unplaced.length === 1 ? "" : "s"}. They are in By field and By time.
        </p>
      ) : null}
    </div>
  );
}
