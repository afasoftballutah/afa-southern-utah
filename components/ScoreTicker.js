"use client";

import { useState } from "react";
import { tickerItem } from "@/lib/score-ticker";

// Latest final scores, newest first, drifting slowly across the top of a
// tournament page (JD, 2026-11-09: "a ticker across the top of the page
// with any field updates and the latest scores"). Hover or touch holds it
// still; with reduced motion it doesn't move at all and scrolls by hand.
// Nothing to show (no game played yet) → nothing rendered.
//
// Field and time changes are not in it: games keep no record of what a
// field or time used to be, so there is nothing true to show yet.

function Items({ items, hidden = false }) {
  return (
    <ul className="score-ticker__list" aria-hidden={hidden || undefined}>
      {items.map((it) => (
        <li key={it.id} className="score-ticker__item">
          <span className="score-ticker__head">{it.head}</span>
          <span className="score-ticker__dot" aria-hidden="true">·</span>
          {it.sides.map((s, i) => (
            <span key={i} className={s.won ? "score-ticker__side is-won" : "score-ticker__side"}>
              {s.name} {s.score}
              {i === 0 ? "," : ""}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

export default function ScoreTicker({ scores = [] }) {
  const [held, setHeld] = useState(false);
  const items = scores.filter((g) => g.score1 != null && g.score2 != null).map(tickerItem);
  if (items.length === 0) return null;
  // ~6s per score keeps it slow enough to read at any length.
  const seconds = Math.max(24, items.length * 6);
  return (
    <section className="score-ticker print:hidden" aria-label="Latest scores">
      <span className="score-ticker__label">Latest</span>
      <div
        className="score-ticker__viewport"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") setHeld((h) => !h);
        }}
      >
        <div
          className={held ? "score-ticker__track is-held" : "score-ticker__track"}
          style={{ "--ticker-seconds": `${seconds}s` }}
        >
          <Items items={items} />
          <Items items={items} hidden />
        </div>
      </div>
    </section>
  );
}
