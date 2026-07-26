"use client";

import { useEffect, useState } from "react";
import TeamFinder from "@/components/TeamFinder";
import { HighlightTeamProvider } from "@/components/bracket/HighlightTeamContext";
import { DropsProvider } from "@/components/bracket/DropsContext";
import { FocusRoundProvider } from "@/components/bracket/FocusRoundContext";

// The bracket picker is the same segmented control as Pool play / Bracket
// — inset track, one filled segment — but each fills in its own metal
// (JD, 2026-07-26). The tints are the ones the seed chips and the
// placement chip already use, so Gold reads as Gold everywhere on the
// page rather than as a navy pill that happens to say "Gold".
const TIER_ACTIVE = {
  Gold: "bg-[#f7edcd] text-[#7a5c12]",
  Silver: "bg-[#dbe3ee] text-[#3b4a60]",
  Bronze: "bg-[#f3e2d6] text-[#7b4a28]",
};

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
  standingsPanes, // { [divisionId]: node }
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
  // Pressing the bracket you are ALREADY on opens its standings; pressing
  // it again closes them (JD, 2026-07-26). The button you would reach for
  // to ask "how did Gold finish" is the one that already says Gold.
  const [standingsFor, setStandingsFor] = useState(null);

  // Landing from a result elsewhere: ?game=5 opens the bracket on game 5,
  // ?pool=A opens pool play. Read from the URL rather than taken as a prop
  // so the page itself stays static-friendly, and only once — the moment
  // someone touches a control the screen is theirs.
  const [arrivedAt, setArrivedAt] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const game = Number(q.get("game"));
    if (Number.isFinite(game) && game > 0) {
      setArrivedAt(game);
      setStage("bracket");
      setTouched(true);
    } else if (q.get("pool")) {
      setStage("pools");
      setTouched(true);
      // A pool result used to open the division and single out nothing —
      // nine cards and no answer to "which game did I just tap?" (JD,
      // 2026-07-26: "the clicks are not all going to the correct games").
      // The bracket half was landing correctly; this half was not.
      const id = q.get("pg");
      if (id) {
        // After paint: the pool pane has to exist before it can be found.
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-pool-game="${CSS.escape(id)}"]`);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const pill = el.lastElementChild;
          if (!pill) return;
          // The same navy ring a focused bracket game wears, faded out
          // rather than left on — it answers a question and then leaves.
          pill.style.transition = "box-shadow .4s ease";
          pill.style.boxShadow = "0 0 0 2px var(--afa-navy), 0 0 18px rgba(30,58,110,.35)";
          setTimeout(() => {
            pill.style.boxShadow = "";
          }, 4000);
        });
      }
    }
  }, []);
  const mine = team ? bracketByTeam?.[team] : null;
  const shownBracketId =
    (bracketId && bracketPanes[bracketId] && bracketId) ||
    (mine && bracketPanes[mine] && mine) ||
    (bracketPanes[finderProps.currentId] && finderProps.currentId) ||
    stages.find((st) => bracketPanes[st.id])?.id ||
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
                <div className="inline-flex gap-0.5 rounded-lg bg-afa-navy/5 p-0.5">
                  {stages
                    .filter((st) => bracketPanes[st.id])
                    .map((st) => {
                      const on = st.id === shownBracketId;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          aria-current={on}
                          aria-expanded={on ? standingsFor === st.id : undefined}
                          onClick={() => {
                            if (on) setStandingsFor((v) => (v === st.id ? null : st.id));
                            else {
                              setBracketId(st.id);
                              setStandingsFor(null);
                            }
                          }}
                          className={`min-h-11 rounded-md px-4 text-sm font-semibold ${
                            on
                              ? `${TIER_ACTIVE[st.name] ?? "bg-white text-afa-navy"} shadow-sm`
                              : "text-afa-ink/70"
                          }`}
                        >
                          {st.name}
                        </button>
                      );
                    })}
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
        <div className="space-y-3">
          {standingsFor && standingsPanes?.[standingsFor]}
          <DropsProvider value={{ showDrops, setShowDrops }}>
            <FocusRoundProvider round={arrivedAt}>
              <HighlightTeamProvider team={team}>
                {bracketPanes[shownBracketId]}
              </HighlightTeamProvider>
            </FocusRoundProvider>
          </DropsProvider>
        </div>
      ) : (
        poolPane
      )}
    </div>
  );
}
