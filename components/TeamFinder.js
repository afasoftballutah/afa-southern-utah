"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";

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
  onSelectedChange,
}) {
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(true);
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
      onSelectedChange?.(remembered);
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
    onSelectedChange?.(value);
  }

  // Newest first (JD, 2026-07-26). During a tournament the game you just
  // played is the one you are looking for; the one from Friday is
  // history, and history goes underneath.
  const teamGames = selected
    ? games
        .filter((g) => g.team1 === selected || g.team2 === selected)
        .sort((a, b) => String(b.when ?? "").localeCompare(String(a.when ?? "")))
    : [];
  const pool = teamGames.find((g) => g.pool)?.pool ?? null;

  // Which bracket is the picked team in? Once we know, there is no reason
  // to offer them the other two — they are not in them. The others stay
  // one tap away rather than gone, because people do look up who they
  // might meet in the final.
  const myStageId = selected ? bracketByTeam[selected] : null;
  const myStage = myStageId ? stages.find((st) => st.id === myStageId) : null;

  // Whether this team still has a game coming, worked out by the hourly
  // sync. No entry means they do — the common case, and the safe way to
  // be wrong. Said plainly but without a fanfare: nobody wants ELIMINATED
  // in red when they have just lost.
  const status = selected ? teamStatus[selected] : null;
  const isOut = status?.state === "eliminated";
  const isChampion = status?.state === "champion";

  return (
    // The picker IS the card's header (JD, 2026-07-26). A dropdown above a
    // card whose first line repeated the same team name was one control
    // and one label doing one job twice.
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {/* The name is TEXT, with a real <select> laid invisibly over it.
            A native select sizes itself to its widest option, which would
            have parked the caret a dozen characters past a short team
            name; this way the caret sits where the name ends and the
            display face renders exactly as it does anywhere else. */}
        <span className="relative inline-flex min-w-0 items-center gap-1.5 rounded focus-within:ring-2 focus-within:ring-afa-navy/30">
          <span className="truncate font-display text-lg text-afa-navy">
            {selected || "Find your team"}
          </span>
          <span aria-hidden="true" className="shrink-0 text-sm text-afa-navy/50">
            ▾
          </span>
          <select
            aria-label="Find your team"
            value={selected}
            onChange={handleChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            <option value="">Find your team</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </span>

        {selected && (
          <div className="ml-auto flex items-center gap-2">
            {!isOut && !isChampion && myStage && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  TIER_CHIP[myStage.name] ?? "bg-afa-navy/[0.07] text-afa-ink/60"
                }`}
              >
                {myStage.name}
              </span>
            )}
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
            {isOut || isChampion ? (
              <Chip variant="muted">{isChampion ? "Champion" : "Eliminated"}</Chip>
            ) : (
              pool && <Chip variant="muted">{chipPrefix ? `${chipPrefix} ${pool}` : pool}</Chip>
            )}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="ml-1 min-h-9 rounded px-2 text-afa-navy/60 hover:text-afa-navy"
            >
              <span className="sr-only">{open ? "Collapse" : "Expand"} games</span>
              <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </button>
          </div>
        )}
      </div>

      {selected && open && (
        <div className="border-t border-afa-navy/10 px-4 py-3">
          {(isOut || isChampion) && (
            <p className="mb-2 text-sm text-afa-ink/70">No more games scheduled.</p>
          )}

          {teamGames.length > 0 ? (
            /* Day, time, opponent, field, result — fixed tracks, so every
               column starts at the same x down the whole card. */
            <ul className="divide-y divide-afa-navy/10">
              {teamGames.map((g) => {
                const won =
                  g.isFinal &&
                  ((g.team1 === selected && g.score1 > g.score2) ||
                    (g.team2 === selected && g.score2 > g.score1));
                const opponent = g.team1 === selected ? g.team2 : g.team1;
                const mine = g.team1 === selected ? g.score1 : g.score2;
                const theirs = g.team1 === selected ? g.score2 : g.score1;
                return (
                  <li
                    key={g.id}
                    className="grid grid-cols-[76px_minmax(0,1fr)_34px_16px_28px_10px_28px] items-center gap-x-2 py-2 text-sm"
                  >
                    <span className="whitespace-nowrap text-xs text-afa-muted">{g.whenShort}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="text-afa-ink/50">vs </span>
                      {opponent}
                    </span>
                    <span className="whitespace-nowrap text-right text-xs text-afa-muted">
                      {g.field ? g.field.replace(/^Field\s*/i, "F") : ""}
                    </span>
                    {g.isFinal ? (
                      <>
                        {/* W or L in front. A score on its own makes you
                            work out which side you were on before you know
                            how it went. */}
                        <span
                          className={`text-center text-xs font-bold ${
                            mine === theirs
                              ? "text-afa-muted"
                              : won
                              ? "text-[#2f7a4f]"
                              : "text-afa-ink/45"
                          }`}
                        >
                          {mine === theirs ? "T" : won ? "W" : "L"}
                        </span>
                        <span
                          className={`text-right tabular-nums ${
                            won ? "font-bold text-afa-ink" : "font-semibold text-afa-ink/60"
                          }`}
                        >
                          {mine}
                        </span>
                        <span className="text-center text-afa-ink/40">&ndash;</span>
                        <span
                          className={`tabular-nums ${
                            won ? "text-afa-ink/60" : "font-semibold text-afa-ink"
                          }`}
                        >
                          {theirs}
                        </span>
                      </>
                    ) : (
                      <span className="col-span-4 whitespace-nowrap text-right text-xs font-semibold text-afa-navy">
                        Scheduled
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-afa-ink/70">No games scheduled yet.</p>
          )}

          {/* Subscribe, not download. A field change, a rain delay, a
              bracket game whose opponent only exists once pool play is
              applied — all of it updates in your calendar by itself. */}
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
        </div>
      )}
    </Card>
  );
}
