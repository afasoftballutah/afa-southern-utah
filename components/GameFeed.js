"use client";

import { useState } from "react";
import Link from "next/link";
import MatchupCard from "@/components/ui/MatchupCard";
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

function Row({ g, played, seeds }) {
  const to = href(g);
  const body = (
    <MatchupCard
      meta={{ field: fieldShort(g.field), day: g.whenDay, time: g.whenTime }}
      caption={[g.divisionName, g.label].filter(Boolean).join(" \u00b7 ")}
      division={g.divisionName}
      team1={g.team1}
      team2={g.team2}
      score1={g.score1}
      score2={g.score2}
      isFinal={played}
      seeds={seeds}
    />
  );
  return to ? (
    <Link
      href={to}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export default function GameFeed({ results = [], upcoming = [], seeds }) {
  // One of the two is always on — the same rule as Pool play | Bracket —
  // and it opens on NEXT (JD, 2026-07-26). What is coming is the question
  // a tournament page is open to answer; results are what you check
  // afterwards.
  const [tab, setTab] = useState("next");
  const shown = tab === "next" ? upcoming : results;

  return (
    <Card className="space-y-3">
      {/* The next game beside the title, as its own card — the answer most
          people opened the page for, before they have pressed anything
          (JD, 2026-07-26). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="t-heading">Schedule</h2>
        {upcoming[0] && (
          <MatchupCard
            className="w-full sm:w-64"
            caption={[upcoming[0].whenDay, upcoming[0].whenTime, fieldShort(upcoming[0].field)]
              .filter(Boolean)
              .join(" \u00b7 ")}
            division={upcoming[0].divisionName}
            team1={upcoming[0].team1}
            team2={upcoming[0].team2}
            seeds={seeds}
          />
        )}
      </div>
      <div className="seg">
        {[
          ["results", `Results${results.length ? ` (${results.length})` : ""}`],
          ["next", `Next${upcoming.length ? ` (${upcoming.length})` : ""}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="t-body">
          {tab === "next" ? "Nothing left to play." : "No results yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((g) => (
            <Row key={g.id} g={g} played={tab === "results"} seeds={seeds} />
          ))}
        </div>
      )}
    </Card>
  );
}
