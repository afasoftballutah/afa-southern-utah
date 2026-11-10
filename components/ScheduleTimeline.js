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
  sideLabel,
  spelledSide,
  statusLabel,
} from "@/lib/schedule-timeline";

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
    <span className={`tl-corner-place${gold ? " is-gold" : ""}`}>{x.place}</span>
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




function Pill({ game, open, onToggle, pillRef }) {
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
      className={`tl-pill tl-tone-${tone}${side ? ` tl-side-${side}` : ""}${final ? " is-final" : ""}${open ? " is-open" : ""}`}
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

function Details({ game, slug, sheet, anchor, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const tone = divisionTone(game.divisionName);
  const final = game.isFinal || game.status === "final";
  const sides = [1, 2].map((n) => {
    const side = sideLabel(game, n);
    const score = game[`score${n}`];
    const other = game[`score${n === 1 ? 2 : 1}`];
    return {
      ...side,
      score,
      won: final && score != null && other != null && score > other,
      place: game[`team${n}Place`] ?? null,
    };
  });

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
      aria-label={`${game.divisionName} ${game.label ?? ""} details`}
      className={`tl-pop${sheet ? " is-sheet" : ""}`}
      style={sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
    >
      <div className="tl-pop__head">
        <span className={`tl-chip tl-tone-${tone}`}>{game.divisionName}</span>
        <span className="tl-pop__game">{game.label}</span>
        {game.bracketSide && game.bracketSide !== "pool" ? (
          <span className={`tl-pop__side tl-pop__side--${game.bracketSide}`}>{SIDE_LABELS[game.bracketSide]}</span>
        ) : null}
        <span className={`tl-pop__status${final ? " is-final" : ""}`}>{statusLabel(game)}</span>
        <button type="button" className="tl-pop__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="tl-pop__teams">
        {sides.map((s, i) => (
          <li key={i} className={s.won ? "is-won" : undefined}>
            <span className={s.known ? "tl-pop__team" : "tl-pop__team is-pending"}>{spelledSide(s.text)}</span>
            {s.place ? <span className="tl-place">Out · {s.place}</span> : null}
            {s.score != null ? <span className="tl-pop__score">{s.score}</span> : null}
          </li>
        ))}
      </ul>
      {flowWords(game.flow) ? <p className="tl-pop__flow">{flowWords(game.flow)}</p> : null}
      <dl className="tl-pop__meta">
        <div>
          <dt>Time</dt>
          <dd>{game.timeLabel}</dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>{game.fieldName}</dd>
        </div>
      </dl>
      {slug && game.divisionId ? (
        <Link href={`/tournaments/${slug}/division/${game.divisionId}`} className="tl-pop__link">
          {`Open ${game.divisionName} bracket ›`}
        </Link>
      ) : null}
    </div>
  );
}

export default function ScheduleTimeline({ rows, timeZone, zoneShort = "", slug }) {
  const { days, unplaced } = useMemo(() => buildTimeline(rows, timeZone), [rows, timeZone]);
  const legend = useMemo(() => divisionLegendGroups(rows), [rows]);
  const [openId, setOpenId] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [sheet, setSheet] = useState(false);
  const pills = useRef(new Map());

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
    setOpenId((cur) => (cur === id ? null : id));
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

      {unplaced.length > 0 ? (
        <p className="t-meta">
          Not on the timeline yet (no time or field): {unplaced.length} game
          {unplaced.length === 1 ? "" : "s"}. They are in By field and By time.
        </p>
      ) : null}
    </div>
  );
}
