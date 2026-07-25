"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Matchup from "@/components/ui/Matchup";

// Find my team (dispatch-brief-14, JD: "a dropdown at the top by team?
// When a team is selected they get highlighted and you see their pool and
// schedule."). A plain <select> — no search, no fuzzy matching, no
// keyboard shortcuts. Remembers the pick per device in localStorage so a
// player picks once and the page leads with them every visit after
// (afa-product-plan.md, "My team first").
const STORAGE_KEY_PREFIX = "afa-team-";

export default function TeamFinder({ teams, games, divisionId }) {
  const [selected, setSelected] = useState("");
  const storageKey = `${STORAGE_KEY_PREFIX}${divisionId}`;

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
  }

  const teamGames = selected
    ? games.filter((g) => g.team1 === selected || g.team2 === selected)
    : [];
  const pool = teamGames.find((g) => g.pool)?.pool ?? null;

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

      {selected && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg text-afa-navy">{selected}</h2>
            {pool && <Chip variant="muted">Pool {pool}</Chip>}
          </div>

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
