"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Matchup from "@/components/ui/Matchup";

// The bracket a team finished in, tinted as itself — the same three
// metallics the seed chips use, so "Gold" reads as Gold wherever it
// appears rather than as one more grey pill.
const TIER_CHIP = {
  Gold: "bg-[#f7edcd] text-[#7a5c12]",
  Silver: "bg-[#e9edf2] text-[#46546a]",
  Bronze: "bg-[#f3e2d6] text-[#7b4a28]",
};

// Find my team (dispatch-brief-14, JD: "a dropdown at the top by team?
// When a team is selected they get highlighted and you see their pool and
// schedule."). A plain <select> — no search, no fuzzy matching, no
// keyboard shortcuts. Remembers the pick per device in localStorage so a
// player picks once and the page leads with them every visit after
// (afa-product-plan.md, "My team first").
//
// Storage key is TOURNAMENT-scoped, not division-scoped (dispatch-brief-19)
// — a team plays in one division, so the caller passes the whole key
// (`afa-team-{tournament slug}`) and both the division page and the
// Schedule page share one memory: pick your team on either page and it's
// already selected on the other.
export default function TeamFinder({
  teams,
  games,
  storageKey,
  chipPrefix,
  stages = [],
  currentId = null,
  bracketByTeam = {},
  teamStatus = {},
  slug,
}) {
  const [selected, setSelected] = useState("");
  const [showAllBrackets, setShowAllBrackets] = useState(false);
  // webcal:// is what makes a calendar client SUBSCRIBE instead of
  // downloading a frozen copy, and it needs an absolute host — which only
  // exists after mount. Until then the link is the plain https path,
  // which still works, it just downloads.
  const [host, setHost] = useState(null);
  useEffect(() => setHost(window.location.host), []);

  // Restore the remembered pick on mount. If it no longer names a real
  // team (roster change, wrong division), clear the stale key instead of
  // rendering a dead selection.
  useEffect(() => {
    let remembered = null;
    try {
      remembered = window.localStorage.getItem(storageKey);
    } catch {
      remembered = null;
    }
    if (!remembered) return;
    if (teams.includes(remembered)) {
      setSelected(remembered);
    } else {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore — best-effort cleanup only
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function remember(value) {
    try {
      if (value) {
        window.localStorage.setItem(storageKey, value);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // localStorage can throw in private-browsing/quota edge cases —
      // the picker still works for the session, it just won't persist.
    }
  }

  function handleChange(e) {
    const value = e.target.value;
    setSelected(value);
    remember(value);
  }

  function handleClear() {
    setSelected("");
    remember("");
    setShowAllBrackets(false);
  }

  const teamGames = selected
    ? games.filter((g) => g.team1 === selected || g.team2 === selected)
    : [];
  const pool = teamGames.find((g) => g.pool)?.pool ?? null;

  // Which bracket is the picked team in? Once we know, there is no reason
  // to offer them the other two — they are not in them. The others stay
  // one tap away rather than gone, because people do look up who they
  // might meet in the final.
  const myStageId = selected ? bracketByTeam[selected] : null;
  const myStage = myStageId ? stages.find((st) => st.id === myStageId) : null;
  const shownStages = myStage && !showAllBrackets ? [myStage] : stages;

  // Whether this team still has a game coming, worked out by the hourly
  // sync. No entry means they do — the common case, and the safe way to
  // be wrong. Said plainly but without a fanfare: nobody wants ELIMINATED
  // in red when they have just lost.
  const status = selected ? teamStatus[selected] : null;
  const isOut = status?.state === "eliminated";
  const isChampion = status?.state === "champion";

  return (
    <div className="space-y-2">
      <select
        aria-label="Find your team"
        value={selected}
        onChange={handleChange}
        className="w-full rounded-lg border border-afa-navy/25 bg-white px-4 py-3 text-base"
      >
        <option value="">Find your team</option>
        {teams.map((team) => (
          <option key={team} value={team}>
            {team}
          </option>
        ))}
      </select>

      {stages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {myStage && !showAllBrackets && (
            <span className="text-sm text-afa-ink/70">
              <b className="font-semibold text-afa-ink">{selected}</b> is in
            </span>
          )}
          {shownStages.map((st) => {
            const isCurrent = st.id === currentId;
            return isCurrent ? (
              <span
                key={st.id}
                aria-current="page"
                className="flex min-h-11 items-center rounded-lg border border-afa-navy bg-afa-navy px-4 text-sm font-bold text-white"
              >
                {st.name}
              </span>
            ) : (
              <Link
                key={st.id}
                href={`/tournaments/${slug}/division/${st.id}`}
                className="flex min-h-11 items-center rounded-lg border border-afa-navy/25 bg-white px-4 text-sm font-bold text-afa-navy hover:border-afa-navy/60"
              >
                {st.name}
                {myStage && !showAllBrackets && <span className="pl-1.5 font-normal">&rarr;</span>}
              </Link>
            );
          })}
          {myStage && stages.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllBrackets((v) => !v)}
              className="min-h-11 text-sm text-afa-navy underline"
            >
              {showAllBrackets ? "Just mine" : "All brackets"}
            </button>
          )}
          {!selected && stages.length > 1 && (
            <span className="text-sm text-afa-ink/70">
              Pick your team to see just yours.
            </span>
          )}
        </div>
      )}

      {selected && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-afa-navy">{selected}</h2>
            <div className="flex items-center gap-2">
              {(isOut || isChampion) && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                    TIER_CHIP[status.bracket_name] ?? "bg-afa-navy/[0.07] text-afa-ink/60"
                  }`}
                >
                  {[status.bracket_name, status.placement && `${status.placement} Place`]
                    .filter(Boolean)
                    .join(" \u00b7 ") || "No more games"}
                </span>
              )}
              {pool && (
                <Chip variant="muted">{chipPrefix ? `${chipPrefix} ${pool}` : pool}</Chip>
              )}
            </div>
          </div>

          {/* Stated as a fact, not a verdict (JD, 2026-07-26: "You can just
              say No More Games Scheduled"). Nobody who has just lost wants
              ELIMINATED in red; what they want to know is whether to go
              home, and where they finished — which the chip already says,
              so naming the last game as well was one clause too many. */}
          {(isOut || isChampion) && (
            <p className="mt-1 text-sm text-afa-ink/70">No more games scheduled.</p>
          )}

          <div className="mt-3">
            {teamGames.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teamGames.map((g) => (
                  <Matchup
                    key={g.id}
                    caption={g.caption}
                    team1={g.team1}
                    team2={g.team2}
                    score1={g.score1}
                    score2={g.score2}
                    isFinal={g.isFinal}
                    highlightTeam={selected}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-afa-ink/70">No games scheduled yet.</p>
            )}
          </div>

          {/* Subscribe, not download. A field change, a rain delay, a
              bracket game whose opponent only exists once pool play is
              applied — all of it updates in your calendar by itself.
              Downloading gets you tonight's schedule frozen. */}
          {slug && !isOut && !isChampion && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={`${host ? `webcal://${host}` : ""}/tournaments/${slug}/games.ics?team=${encodeURIComponent(selected)}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-afa-navy/25 bg-white px-4 text-sm font-bold text-afa-navy hover:border-afa-navy/60"
              >
                Subscribe to {selected}&rsquo;s games
              </a>
              <span className="text-xs text-afa-ink/60">
                Adds to your calendar and keeps itself up to date.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleClear}
            className="mt-3 text-sm text-afa-navy underline min-h-11"
          >
            Clear
          </button>
        </Card>
      )}
    </div>
  );
}
