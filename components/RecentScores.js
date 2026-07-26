"use client";

import Link from "next/link";
import Matchup from "@/components/ui/Matchup";
import { formatFieldTime } from "@/lib/bracket/tree";

// Recent scores, wherever they are shown.
//
// A result is not a dead end (JD, 2026-07-26: "people expect to be able to
// click into them and see the game"). Each one opens its own division, on
// the stage that game belongs to, with the game itself picked out of the
// drawing — ?game=N for a bracket game, ?pool=X&pg=<id> for a pool game.
function resultHref(g) {
  if (!g.tournamentSlug || !g.divisionId) return null;
  const base = `/tournaments/${g.tournamentSlug}/division/${g.divisionId}`;
  if (g.pool) return `${base}?pool=${encodeURIComponent(g.pool)}&pg=${g.id}`;
  if (g.round) return `${base}?game=${g.round}`;
  return base;
}

export default function RecentScores({ scores }) {
  return (
    <div className="space-y-2">
      {scores.map((g) => {
        const href = resultHref(g);
        const card = (
          <Matchup
            caption={[formatFieldTime(g), g.divisionName, g.label].filter(Boolean).join(" · ")}
            team1={g.team1}
            team2={g.team2}
            score1={g.score1}
            score2={g.score2}
            isFinal
          />
        );
        return href ? (
          <Link
            key={g.id}
            href={href}
            className="block rounded-lg transition hover:brightness-[.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
          >
            {card}
          </Link>
        ) : (
          <div key={g.id}>{card}</div>
        );
      })}
    </div>
  );
}

