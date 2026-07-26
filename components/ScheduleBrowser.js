"use client";

import { useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Matchup from "@/components/ui/Matchup";
import TeamFinder from "@/components/TeamFinder";

// By field | By time toggle (dispatch-brief-16) — same localStorage-via-
// useSyncExternalStore pattern as the Tournaments page toggle
// (components/TournamentBrowser.js) and the bracket Bracket|List toggle
// (components/bracket/BracketTree.js). Avoids a hydration mismatch from
// reading localStorage directly during render.
const STORAGE_KEY = "afa-schedule-view";

function subscribeStorage(callback) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getStoredView() {
  return window.localStorage.getItem(STORAGE_KEY);
}
function getStoredViewServer() {
  return null;
}

// Field bucketing for "natural" order (dispatch-brief-11's rule, carried
// over from the page's original groupByField): numbered fields sort by
// their digits (Field 10 after Field 9, never lexically between Field 1
// and Field 2), a field string with no digits sorts after every numbered
// field, and games with no field at all land in a final "Field TBD"
// bucket. Reused both to order the By-field rows and to order games
// within a single By-time slot.
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

function groupByField(rows) {
  const byField = new Map();
  for (const row of rows) {
    const key = row.field || null;
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(row);
  }
  return [...byField.entries()]
    .map(([field, games]) => ({
      field,
      heading: field ?? "Field TBD",
      // Chronological within the field — null scheduledTime (a bracket
      // slot not yet timed) sorts to the end.
      games: [...games].sort((x, y) => {
        const tx = x.scheduledTime ? new Date(x.scheduledTime).getTime() : Infinity;
        const ty = y.scheduledTime ? new Date(y.scheduledTime).getTime() : Infinity;
        return tx - ty;
      }),
    }))
    .sort(compareByField);
}

function groupByTime(rows) {
  const byTime = new Map();
  for (const row of rows) {
    const key = row.scheduledTime || null;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(row);
  }
  return [...byTime.entries()]
    .map(([time, games]) => ({
      time,
      heading: time ? games[0].timeLabel : "Time TBD",
      // Field order within a slot — this view is "what's happening right
      // now," so a scanner reads it Field 1 → Field 2 → ... left to right.
      games: [...games].sort(compareByField),
    }))
    .sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : Infinity;
      const tb = b.time ? new Date(b.time).getTime() : Infinity;
      return ta - tb;
    });
}

// Caption composition (dispatch-brief-16) — the server hands over parts
// (timeLabel, field, divisionName, label), never a pre-built string, so
// each view can drop whichever fact its own heading already states
// (facts-once law). By field drops the field name (it's the row heading).
// By time drops the time (its heading already states it).
function GameRow({ row, mode }) {
  const caption =
    mode === "field"
      ? [row.timeLabel, row.divisionName, row.label].filter(Boolean).join(" · ")
      : [row.field, row.divisionName, row.label].filter(Boolean).join(" · ");

  return (
    <Matchup
      caption={caption}
      team1={row.team1}
      team2={row.team2}
      score1={row.score1}
      score2={row.score2}
      isFinal={row.isFinal}
    />
  );
}

// Collapsed by default, one Card per field. Native <details>, controlled
// (open + onToggle) rather than left uncontrolled — the expand state is
// lifted to ScheduleBrowser's expandedFields set so it survives the By
// field/By time view swap (which unmounts this row and remounts it later
// in the same session), same as the Rules page's details/summary pattern
// (components/RulesBrowser.js) but controlled instead of read-only.
function FieldRow({ group, isOpen, onToggle }) {
  return (
    <Card variant="default">
      <details
        className="group"
        open={isOpen}
        onToggle={(e) => onToggle(e.currentTarget.open)}
      >
        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-11 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-lg text-afa-navy">{group.heading}</span>
            <Chip variant="muted">
              {group.games.length} game{group.games.length === 1 ? "" : "s"}
            </Chip>
          </span>
          <span className="text-afa-muted transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
        </summary>
        {/* Single column, never a grid — the games are a chronological
            sequence, and a two-up grid makes time zigzag left-right. */}
        <div className="mt-3 space-y-2">
          {group.games.map((g) => (
            <GameRow key={g.id} row={g} mode="field" />
          ))}
        </div>
      </details>
    </Card>
  );
}

function ByFieldView({ rows, expandedFields, onToggleField }) {
  const groups = groupByField(rows);
  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const key = group.field ?? "__tbd__";
        return (
          <FieldRow
            key={key}
            group={group}
            isOpen={expandedFields.has(key)}
            onToggle={(open) => onToggleField(key, open)}
          />
        );
      })}
    </div>
  );
}

// Not collapsible — the point of this view is scanning what's live right
// now, so every slot's games are always visible.
function ByTimeView({ rows }) {
  const groups = groupByTime(rows);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.time ?? "__tbd__"} className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="t-heading">{group.heading}</h2>
            <Chip variant="muted">
              {group.games.length} game{group.games.length === 1 ? "" : "s"}
            </Chip>
          </div>
          <div className="space-y-2">
            {group.games.map((g) => (
              <GameRow key={g.id} row={g} mode="time" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * By field | By time browser (dispatch-brief-16). Server component
 * (app/tournaments/[slug]/schedule/page.js) fetches via
 * getTournamentSchedule and passes flat, serializable rows straight
 * through — all grouping/sorting/view-state lives here, client-side.
 *
 * TeamFinder renders above the toggle (dispatch-brief-19) — "when do I
 * play" is the first question on this page, so the picker is the first
 * thing on it. `storageKey` is tournament-scoped so a pick here shares
 * memory with the division page's own TeamFinder.
 */
export default function ScheduleBrowser({ rows, finderTeams, finderGames, storageKey }) {
  const [explicitView, setExplicitView] = useState(null);
  const storedView = useSyncExternalStore(subscribeStorage, getStoredView, getStoredViewServer);
  const view = explicitView ?? (storedView === "time" ? "time" : "field");
  const [expandedFields, setExpandedFields] = useState(() => new Set());

  function choose(next) {
    setExplicitView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }

  function toggleField(key, open) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {finderTeams && finderTeams.length > 0 && (
        <TeamFinder teams={finderTeams} games={finderGames} storageKey={storageKey} />
      )}

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => choose("field")}
          className={`font-semibold ${view === "field" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          By field
        </button>
        <span className="text-afa-ink/30">|</span>
        <button
          type="button"
          onClick={() => choose("time")}
          className={`font-semibold ${view === "time" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          By time
        </button>
      </div>

      {view === "field" ? (
        <ByFieldView rows={rows} expandedFields={expandedFields} onToggleField={toggleField} />
      ) : (
        <ByTimeView rows={rows} />
      )}
    </div>
  );
}
