"use client";

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";

// The tournament's games, in the two states anyone asks about (JD,
// 2026-07-26: "Should have a Results | Next toggle").
//
// Every row is a link INTO its own game — the bracket drawing with that
// game picked out, or the pool card with it ringed — and every row says
// where and when, because "what field are we on" is the question people
// are actually holding their phone to answer.

function href(g) {
  if (!g.tournamentSlug || !g.divisionId) return null;
  const base = `/tournaments/${g.tournamentSlug}/division/${g.divisionId}`;
  if (g.pool) return `${base}?pool=${encodeURIComponent(g.pool)}&pg=${g.id}`;
  if (g.round) return `${base}?game=${g.round}`;
  return base;
}

const fieldShort = (f) => (f ? String(f).replace(/^Field\s*/i, "F") : "");

function Row({ g, played }) {
  const to = href(g);
  const tie = played && g.score1 === g.score2;
  const won1 = played && !tie && g.score1 > g.score2;
  const won2 = played && !tie && g.score2 > g.score1;

  const side = (name, score, won) => (
    <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2">
      <span className={`truncate ${won ? "t-strong" : "t-body"}`}>
        {name ?? "TBD"}
      </span>
      <span
        className={`text-right tabular-nums ${won ? "t-strong" : "t-body"}`}
      >
        {played ? score : ""}
      </span>
    </div>
  );

  const body = (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5">
      {/* Where and when, in a fixed column so they line up down the list
          and can be read at a glance from a car park. */}
      <div className="t-meta leading-tight">
        <div className="font-bold">{fieldShort(g.field)}</div>
        <div>{g.whenDay}</div>
        <div>{g.whenTime}</div>
      </div>
      <div className="min-w-0 divide-y divide-afa-navy/10">
        {side(g.team1, g.score1, won1)}
        {side(g.team2, g.score2, won2)}
      </div>
    </div>
  );

  const shell =
    "block card";
  return to ? (
    <Link
      href={to}
      className={`${shell} transition card-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40`}
    >
      <p className="t-label px-3 pt-2">
        {[g.divisionName, g.label].filter(Boolean).join(" · ")}
      </p>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export default function GameFeed({ results = [], upcoming = [] }) {
  // The two buttons ARE the expander (JD, 2026-07-26). Nothing is open
  // until you ask for one, pressing the open one closes it, and the card
  // is a heading and two choices until then.
  const [tab, setTab] = useState(null);
  const shown = tab === "next" ? upcoming : tab === "results" ? results : [];

  return (
    <Card className="space-y-3">
      <h2 className="t-heading">Schedule</h2>
      <div className="seg">
        {[
          ["results", `Results${results.length ? ` (${results.length})` : ""}`],
          ["next", `Next${upcoming.length ? ` (${upcoming.length})` : ""}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-expanded={tab === key}
            onClick={() => setTab((v) => (v === key ? null : key))}
          >
            {label}
          </button>
        ))}
      </div>

      {tab &&
        (shown.length === 0 ? (
          <p className="t-body">
            {tab === "next" ? "Nothing left to play." : "No results yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {shown.map((g) => (
              <Row key={g.id} g={g} played={tab === "results"} />
            ))}
          </div>
        ))}
    </Card>
  );
}
