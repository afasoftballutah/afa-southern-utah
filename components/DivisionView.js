"use client";

import { useEffect, useState } from "react";
import TeamFinder from "@/components/TeamFinder";
import { HighlightTeamProvider } from "@/components/bracket/HighlightTeamContext";
import { DropsProvider } from "@/components/bracket/DropsContext";

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
  // Owned here so it can sit in the one toolbar row with everything else
  // (JD, 2026-07-26) rather than on its own line under it.
  const [showDrops, setShowDrops] = useState(false);
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

      {/* One row (JD, 2026-07-26): what stage you are looking at, which
          bracket, and whether the loser paths are drawn. Three questions
          about the same drawing had become three stacked lines. */}
      {(showToggle || (stage === "bracket" && hasBracket)) && (
        <div className="flex flex-wrap items-center gap-2">
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

          {stage === "bracket" && hasBracket && (
            <>
              {stages.length > 1 && (
                <div className="inline-flex flex-wrap gap-2">
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
              <button
                type="button"
                aria-pressed={showDrops}
                onClick={() => setShowDrops((v) => !v)}
                className={`ml-auto min-h-9 rounded-full border px-3 text-[12px] font-semibold ${
                  showDrops
                    ? "border-afa-navy/30 bg-afa-navy/[0.08] text-afa-navy"
                    : "border-afa-ink/15 text-afa-ink/70"
                }`}
              >
                {showDrops ? "Hide loser paths" : "Show loser paths"}
              </button>
            </>
          )}
        </div>
      )}

      {stage === "bracket" && hasBracket ? (
        <DropsProvider value={{ showDrops, setShowDrops }}>
          <HighlightTeamProvider team={team}>{bracketPanes[shownBracketId]}</HighlightTeamProvider>
        </DropsProvider>
      ) : (
        poolPane
      )}
    </div>
  );
}
