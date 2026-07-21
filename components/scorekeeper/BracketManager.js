"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlacementsUpload from "./PlacementsUpload";

const SIDE_LABELS = { winners: "Winners", losers: "Losers", final: "Final" };

function roundLabel(side, round, totalRoundsForSide) {
  if (side === "final") return round === 1 ? "Grand Final" : "If Necessary";
  return `Round ${round}`;
}

export default function BracketManager({ divisionId, bracket, games, teamNames, draft, completion }) {
  const router = useRouter();
  const [format, setFormat] = useState("double_elim");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/bracket/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, format }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate bracket");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!window.confirm("Regenerate the bracket from current registrations? This replaces every unplayed game.")) {
      return;
    }
    await generate();
  }

  if (!bracket) {
    return (
      <div className="chalk-panel space-y-3">
        <p className="text-sm text-afa-ink/70">
          {teamNames.length} team{teamNames.length === 1 ? "" : "s"} registered. No bracket yet.
        </p>
        <label className="block">
          <span className="block text-sm font-semibold mb-1">Format</span>
          <select
            className="w-full border border-afa-navy/30 rounded px-3 py-2"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="double_elim">Double Elimination</option>
            <option value="double_elim_consolation">
              Double Elimination + Consolation (not available yet)
            </option>
          </select>
        </label>
        {format === "double_elim_consolation" && (
          <p className="text-xs text-afa-ink/60">
            This variant isn&rsquo;t built yet — generating will use standard double
            elimination instead. Every slot is editable by hand afterward if you need
            to add consolation games manually.
          </p>
        )}
        {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
        <button
          type="button"
          disabled={busy || teamNames.length < 2}
          onClick={generate}
          className="w-full bg-afa-navy text-white font-bold py-3 rounded-lg disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate Bracket"}
        </button>
        {teamNames.length < 2 && (
          <p className="text-xs text-afa-ink/60">Need at least 2 registered teams first.</p>
        )}
      </div>
    );
  }

  const bySide = { winners: [], losers: [], final: [] };
  for (const g of games) bySide[g.bracket_side]?.push(g);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className={"text-sm font-bold " + (draft ? "text-afa-navy" : "text-afa-ink/70")}>
          {draft ? "DRAFT — every slot is editable" : "LOCKED — shape is set, only results flow now"}
        </p>
        {draft && (
          <button type="button" onClick={regenerate} disabled={busy} className="text-afa-navy underline text-sm font-semibold">
            Regenerate
          </button>
        )}
      </div>
      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}

      {completion.complete && <PlacementsUpload divisionId={divisionId} completion={completion} />}

      {["winners", "losers", "final"].map((side) =>
        bySide[side].length === 0 ? null : (
          <div key={side} className="space-y-3">
            <h2 className="font-bold text-afa-navy">{SIDE_LABELS[side]}</h2>
            <div>
              {Object.entries(groupByRound(bySide[side])).map(([round, roundGames], i) => (
                <div key={round}>
                  {i > 0 && <div className="chalk-line" />}
                  <p className="text-xs font-semibold text-afa-ink/50 mt-2 mb-1">
                    {roundLabel(side, Number(round))}
                  </p>
                  <div className="space-y-2">
                    {roundGames.map((g) => (
                      <GameRow key={g.id} game={g} teamNames={teamNames} draft={draft} onChanged={() => router.refresh()} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function groupByRound(list) {
  const out = {};
  for (const g of list) {
    (out[g.round] ??= []).push(g);
  }
  return out;
}

function GameRow({ game, teamNames, draft, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [team1, setTeam1] = useState(game.team1_name || "");
  const [team2, setTeam2] = useState(game.team2_name || "");
  const [field, setField] = useState(game.field || "");
  const [time, setTime] = useState(toLocalInputValue(game.scheduled_time));
  const [score1, setScore1] = useState(game.team1_score ?? "");
  const [score2, setScore2] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const playable = game.team1_name && game.team2_name && game.status === "pending";

  async function saveSlots() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Name: team1 || null, team2Name: team2 || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: field || null,
          scheduledTime: time ? new Date(time).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitScore() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score: Number(score1), team2Score: Number(score2) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      setExpanded(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const label =
    game.status === "cancelled"
      ? "Not needed"
      : `${game.team1_name || "TBD"} vs ${game.team2_name || "TBD"}`;

  return (
    <div className="border border-afa-navy/10 rounded p-3 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-semibold text-sm">{label}</span>
        {game.status === "final" && (
          <span className="text-sm text-afa-ink/70">
            {game.team1_score}–{game.team2_score}
            {game.is_bye ? " (bye)" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-afa-navy/10">
          {draft && game.status === "pending" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-semibold mb-1">Team 1</span>
                <TeamSelect value={team1} onChange={setTeam1} teamNames={teamNames} />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1">Team 2</span>
                <TeamSelect value={team2} onChange={setTeam2} teamNames={teamNames} />
              </label>
              <button
                type="button"
                onClick={saveSlots}
                disabled={busy}
                className="col-span-2 text-afa-navy underline text-sm font-semibold text-left"
              >
                Save teams
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-semibold mb-1">Field</span>
              <input
                className="w-full border border-afa-navy/30 rounded px-2 py-2"
                value={field}
                onChange={(e) => setField(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1">Time</span>
              <input
                type="datetime-local"
                className="w-full border border-afa-navy/30 rounded px-2 py-2"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={saveSchedule}
              disabled={busy}
              className="col-span-2 text-afa-navy underline text-sm font-semibold text-left"
            >
              Save field &amp; time
            </button>
          </div>

          {playable && (
            <div className="grid grid-cols-2 gap-2 items-end">
              <label className="block">
                <span className="block text-xs font-semibold mb-1">{game.team1_name}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg"
                  value={score1}
                  onChange={(e) => setScore1(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1">{game.team2_name}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg"
                  value={score2}
                  onChange={(e) => setScore2(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || score1 === "" || score2 === ""}
                onClick={submitScore}
                className="col-span-2 bg-afa-navy text-white font-bold py-3 rounded-lg disabled:opacity-40"
              >
                Submit Score
              </button>
            </div>
          )}

          {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TeamSelect({ value, onChange, teamNames }) {
  return (
    <select
      className="w-full border border-afa-navy/30 rounded px-2 py-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">TBD</option>
      {teamNames.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function toLocalInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
