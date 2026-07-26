"use client";

import { useEffect, useState } from "react";
import TeamFinder from "@/components/TeamFinder";
import { HighlightTeamProvider } from "@/components/bracket/HighlightTeamContext";

// Pool play or the bracket (JD, 2026-07-26: "when bracket play is live
// bracket should be the default view for a team. should have a pool/
// bracket toggle").
//
// Both stages of a tournament live on this one page, and which one you
// want depends entirely on what time it is. Friday night the answer is
// pool play; from the first bracket game on, pool play is history and the
// bracket is the only thing anyone is looking at. So the default follows
// the tournament rather than the page, and the toggle is there for the
// times it guesses wrong — checking a final standing on Sunday is a real
// thing people do.
//
// Both panes are rendered on the SERVER and handed in as props. This
// component owns which one is showing and nothing else; DrawnBracket and
// the pool cards never become client components to make a toggle work.

export default function DivisionView({
  poolPane,
  bracketPanes, // { [divisionId]: node }
  stages,
  bracketLive,
  bracketByTeam,
  ...finderProps
}) {
  const [team, setTeam] = useState("");
  const [stage, setStage] = useState(bracketLive ? "bracket" : "pools");
  const hasPools = Boolean(poolPane);
  const hasBracket = Object.keys(bracketPanes ?? {}).length > 0;

  // The team is picked from localStorage a tick after mount, so the
  // opening stage has to be able to change once. Only until someone
  // touches the toggle — after that the screen is theirs.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setStage(bracketLive && hasBracket ? "bracket" : "pools");
  }, [bracketLive, hasBracket, touched]);

  // A team's own bracket, when we know it. Otherwise the first one, which
  // is what a spectator with no team gets.
  // Which bracket is on screen: whatever was last asked for, otherwise
  // the picked team's own, otherwise this page's own, otherwise the first.
  const [bracketId, setBracketId] = useState(null);
  const mine = team ? bracketByTeam?.[team] : null;
  const shownBracketId =
    (bracketId && bracketPanes[bracketId] && bracketId) ||
    (mine && bracketPanes[mine] && mine) ||
    (bracketPanes[finderProps.currentId] && finderProps.currentId) ||
    Object.keys(bracketPanes ?? {})[0];

  // Picking a team moves the drawing to their bracket, even if you had
  // been looking at another one.
  useEffect(() => {
    if (mine) setBracketId(mine);
  }, [mine]);

  const showToggle = hasPools && hasBracket;

  return (
    <div className="space-y-4">
      <TeamFinder
        {...finderProps}
        stages={stages}
        bracketByTeam={bracketByTeam}
        onSelectedChange={setTeam}
      />

      {showToggle && (
        <div className="inline-flex gap-0.5 rounded-lg bg-afa-navy/5 p-0.5">
          {[
            ["pools", "Pool play"],
            ["bracket", "Bracket"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={stage === key}
              onClick={() => {
                setStage(key);
                setTouched(true);
              }}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold ${
                stage === key ? "bg-white text-afa-navy shadow-sm" : "text-afa-ink/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {stage === "bracket" && hasBracket ? (
        <div className="space-y-3">
          {/* Which bracket, and how to see another. This used to be a row
              of links under the team picker saying "Backwards K is in
              Gold"; it belongs to the drawing, not to the picker, and it
              switches in place rather than navigating (JD, 2026-07-26). */}
          {stages.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {stages
                .filter((st) => bracketPanes[st.id])
                .map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    aria-current={st.id === shownBracketId}
                    onClick={() => setBracketId(st.id)}
                    className={`min-h-11 rounded-lg px-4 text-sm font-bold ${
                      st.id === shownBracketId
                        ? "border border-afa-navy bg-afa-navy text-white"
                        : "border border-afa-navy/25 bg-white text-afa-navy hover:border-afa-navy/60"
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
            </div>
          )}
          <HighlightTeamProvider team={team}>{bracketPanes[shownBracketId]}</HighlightTeamProvider>
        </div>
      ) : (
        poolPane
      )}
    </div>
  );
}
