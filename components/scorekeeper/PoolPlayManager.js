"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAGUE_TZ } from "@/lib/bracket/tree";

// Ordered by TIME then FIELD (dispatch-brief-21), not by pool. The director
// standing at the complex thinks "what just finished on Field 6," not
// "which pool are these two teams in" — pool grouping made him do that
// lookup first. This reuses the SHAPE of the public schedule's By-time view
// (components/ScheduleBrowser.js groupByTime/fieldSortKey) without importing
// that component, which renders read-only Matchup cards and can't hold score
// inputs.

// Field bucketing for "natural" order — numbered fields sort by their
// digits (Field 10 after Field 9, never lexically between Field 1 and
// Field 2), a field string with no digits sorts after every numbered field,
// and a game with no field at all lands last. Same rule as
// ScheduleBrowser's fieldSortKey/compareByField.
function fieldSortKey(field) {
  if (!field) return [2, 0, ""];
  const match = field.match(/\d+/);
  if (match) return [0, parseInt(match[0], 10), field];
  return [1, 0, field];
}

function compareByField(a, b) {
  const ka = fieldSortKey(a.field);
  const kb = fieldSortKey(b.field);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2]);
}

// Weekday + time only, in the league's local zone. Same machinery as
// lib/bracket/tree.js's formatFieldTime (LEAGUE_TZ, same toLocaleDateString/
// toLocaleTimeString calls) — that helper returns field+time combined for
// the bracket tree; this group heading needs the time alone, so it's
// derived here rather than string-splitting that helper's output.
function timeLabel(scheduledTime) {
  if (!scheduledTime) return null;
  const d = new Date(scheduledTime);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ })
  );
}

// Row-level time (dispatch-brief-25): hour only, no weekday — the
// time-group heading above already carries the weekday, this is just
// enough for a fast glance without tracing back up to it.
function shortTimeLabel(scheduledTime) {
  if (!scheduledTime) return null;
  const d = new Date(scheduledTime);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ });
}

// Split "11:00 PM" into its own two lines (dispatch-brief-25 grid
// correction) — meta is the column that SHRINKS, so its widest line
// should be "11:00" (5 chars), not "11:00 PM" (8) — every extra pixel
// meta doesn't need goes to a team name instead.
function shortTimeParts(scheduledTime) {
  const label = shortTimeLabel(scheduledTime);
  if (!label) return null;
  const [hm, ampm] = label.split(" ");
  return { hm, ampm };
}

// "Field 3" -> "F3" — short enough to sit inline on a dense row. Anything
// with no digit in it (a named field, or none at all) prints as-is/blank
// rather than guessing an abbreviation.
function fieldAbbrev(field) {
  if (!field) return "";
  const m = field.match(/\d+/);
  return m ? `F${m[0]}` : field;
}

function groupByTime(games) {
  const byTime = new Map();
  for (const g of games) {
    const key = g.scheduled_time || null;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(g);
  }
  return [...byTime.entries()]
    .map(([time, groupGames]) => ({
      time,
      heading: time ? timeLabel(time) : "Time TBD",
      games: [...groupGames].sort(compareByField),
    }))
    .sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : Infinity;
      const tb = b.time ? new Date(b.time).getTime() : Infinity;
      return ta - tb;
    });
}

// Pool play (dispatch-brief-7) — separate, self-contained stage from the
// bracket engine (BracketManager untouched). Patterned on BracketManager's
// fetch/submit style: no optimistic magic, save, refetch, render.
// readOnly — pool play is FINAL once the director confirms the bracket
// (redesign spec 1). Scores stay visible and stay readable; what goes away
// is the ability to change them. Reopening is one tap away on the page
// above, because a wrong score has to be fixable at a ballpark at
// midnight.
export default function PoolPlayManager({ divisionId, poolGames, readOnly = false }) {
  const [selectedTeam, setSelectedTeam] = useState("");

  if (!poolGames || poolGames.length === 0) return null;

  const teams = [...new Set(poolGames.flatMap((g) => [g.team1_name, g.team2_name]))].sort(
    (a, b) => a.localeCompare(b)
  );

  const groups = groupByTime(poolGames)
    .map((group) => ({
      ...group,
      games: selectedTeam
        ? group.games.filter((g) => g.team1_name === selectedTeam || g.team2_name === selectedTeam)
        : group.games,
    }))
    // Groups with no matching game disappear entirely rather than
    // rendering an empty heading (brief 3).
    .filter((group) => group.games.length > 0);

  const filteredCount = groups.reduce((sum, g) => sum + g.games.length, 0);

  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(22,35,61,.05),0_10px_26px_-18px_rgba(22,35,61,.5)] space-y-4">
      <h2 className="h-section">Pool Play</h2>

      <div className="space-y-2">
        <select
          aria-label="Find a team"
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="w-full rounded-lg border border-afa-navy/25 bg-white px-4 py-3 text-base"
        >
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
        {selectedTeam && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-afa-ink/70">
              {filteredCount} game{filteredCount === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setSelectedTeam("")}
              className="text-sm text-afa-navy underline min-h-11"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Deliberately NOT persisted to localStorage (unlike TeamFinder's
          public picker). A player has one team all weekend, so remembering
          it helps; the director scores every team in the division, and a
          sticky filter would silently hide games from him next time he
          opens this screen. Reset on every load, on purpose. */}

      {groups.map((group) => (
        <div key={group.time ?? "__tbd__"} className="space-y-1">
          <h3 className="text-sm h-section">
            {group.heading} <span className="font-normal text-afa-ink/50">({group.games.length} game{group.games.length === 1 ? "" : "s"})</span>
          </h3>
          <div className="divide-y divide-afa-navy/10">
            {group.games.map((g) => (
              <PoolGameRow key={g.id} game={g} readOnly={readOnly} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PoolGameRow({ game, readOnly = false }) {
  const router = useRouter();
  const [score1, setScore1] = useState(game.team1_score ?? "");
  const [score2, setScore2] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isFinal = game.status === "final";
  const isTie = isFinal && game.team1_score === game.team2_score;
  const team1Won = isFinal && !isTie && game.team1_score > game.team2_score;
  const team2Won = isFinal && !isTie && game.team2_score > game.team1_score;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/pool-games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1_score: Number(score1), team2_score: Number(score2) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/pool-games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not clear score");
      setScore1("");
      setScore2("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-1.5">
      {/* Score-centered grid (dispatch-brief-25 correction): meta is the
          column that shrinks to its content, the two team-name columns
          split whatever's left EQUALLY and only truncate as a last
          resort — the names are the only thing anyone reads here, so
          they're the last thing to give up width. The inputs sit in the
          score column so both screens read identically. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-0">
        <div className="whitespace-nowrap text-[11px] leading-tight text-afa-muted">
          <div>{fieldAbbrev(game.field)}</div>
          {(() => {
            const parts = shortTimeParts(game.scheduled_time);
            return parts ? (
              <>
                <div>{parts.hm}</div>
                <div>{parts.ampm}</div>
              </>
            ) : (
              <div>TBD</div>
            );
          })()}
        </div>
        <span
          className={`min-w-0 truncate text-right text-sm ${team1Won ? "font-semibold text-afa-navy" : ""}`}
        >
          {game.team1_name}
        </span>
        <div className="flex items-center gap-0">
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${game.team1_name} score`}
            className="w-14 shrink-0 rounded border border-afa-navy/30 px-0.5 text-center text-base"
            value={score1}
            onChange={(e) => setScore1(e.target.value)}
            disabled={busy || readOnly}
            readOnly={readOnly}
          />
          <span className="shrink-0 text-afa-ink/40">–</span>
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${game.team2_name} score`}
            className="w-14 shrink-0 rounded border border-afa-navy/30 px-0.5 text-center text-base"
            value={score2}
            onChange={(e) => setScore2(e.target.value)}
            disabled={busy || readOnly}
            readOnly={readOnly}
          />
        </div>
        <span
          className={`min-w-0 truncate text-left text-sm ${team2Won ? "font-semibold text-afa-navy" : ""}`}
        >
          {game.team2_name}
        </span>
      </div>
      <div className={`mt-1 flex items-center justify-end gap-2${readOnly ? " hidden" : ""}`}>
        <button
          type="button"
          disabled={busy || score1 === "" || score2 === ""}
          onClick={save}
          className="shrink-0 rounded-lg bg-afa-navy px-3 text-xs font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
        {isFinal && (
          <button
            type="button"
            disabled={busy}
            onClick={clear}
            className="shrink-0 rounded-lg border border-afa-navy/30 px-3 text-xs font-bold text-afa-navy disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="text-right text-xs font-bold text-afa-ink underline">{error}</p>}
    </div>
  );
}
