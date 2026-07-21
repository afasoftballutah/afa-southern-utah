"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlacementsUpload from "./PlacementsUpload";

const SIDE_LABELS = { winners: "Winners", losers: "Losers", final: "Final" };

function roundLabel(side, round) {
  if (side === "final") return round === 1 ? "Grand Final" : "If Necessary";
  return `Round ${round}`;
}

export default function BracketManager({
  divisionId,
  mainBracket,
  consolationBracket,
  games,
  teamNames,
  mainDraft,
  consolationDraft,
  completion,
}) {
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
    const msg =
      consolationBracket || format === "double_elim_consolation"
        ? "Regenerate both the championship and consolation brackets from current registrations? This replaces every unplayed game in both."
        : "Regenerate the bracket from current registrations? This replaces every unplayed game.";
    if (!window.confirm(msg)) return;
    await generate();
  }

  if (!mainBracket) {
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
            <option value="double_elim_consolation">Double Elimination + Consolation</option>
          </select>
        </label>
        {format === "double_elim_consolation" && (
          <p className="text-xs text-afa-ink/60">
            A team drops into the consolation bracket the moment it&rsquo;s
            eliminated from the championship bracket (its 2nd loss there),
            starting fresh at 0 losses. The consolation bracket is its own
            full double elimination, same shape as the championship one.
            This is the typical default — every slot in both brackets stays
            hand-editable if a tournament needs something different.
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

  const mainGames = games.filter((g) => g.bracket_group === "main");
  const consolationGames = games.filter((g) => g.bracket_group === "consolation");
  const anyDraft = mainDraft || (consolationBracket ? consolationDraft : false);

  return (
    <div className="space-y-6">
      {anyDraft && (
        <div className="flex justify-end">
          <button type="button" onClick={regenerate} disabled={busy} className="text-afa-navy underline text-sm font-semibold">
            Regenerate
          </button>
        </div>
      )}
      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}

      {completion.complete && <PlacementsUpload divisionId={divisionId} completion={completion} />}

      <BracketSection
        label="Championship Bracket"
        games={mainGames}
        draft={mainDraft}
        teamNames={teamNames}
        onChanged={() => router.refresh()}
      />

      {consolationBracket && (
        <>
          <div className="chalk-line" />
          <BracketSection
            label="Consolation Bracket"
            games={consolationGames}
            draft={consolationDraft}
            teamNames={teamNames}
            onChanged={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}

function BracketSection({ label, games, draft, teamNames, onChanged }) {
  const bySide = { winners: [], losers: [], final: [] };
  for (const g of games) bySide[g.bracket_side]?.push(g);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-afa-navy">{label}</h2>
        <p className={"text-xs font-bold " + (draft ? "text-afa-navy" : "text-afa-ink/60")}>
          {draft ? "DRAFT — every slot editable" : "LOCKED"}
        </p>
      </div>

      {["winners", "losers", "final"].map((side) =>
        bySide[side].length === 0 ? null : (
          <div key={side} className="space-y-3">
            <h3 className="text-sm font-bold text-afa-navy">{SIDE_LABELS[side]}</h3>
            <div>
              {Object.entries(groupByRound(bySide[side])).map(([round, roundGames], i) => (
                <div key={round}>
                  {i > 0 && <div className="chalk-line" />}
                  <p className="text-xs font-semibold text-afa-ink/50 mt-2 mb-1">
                    {roundLabel(side, Number(round))}
                  </p>
                  <div className="space-y-2">
                    {roundGames.map((g) => (
                      <GameRow key={g.id} game={g} teamNames={teamNames} draft={draft} onChanged={onChanged} />
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

function slotLabel(name, isOpenEntry) {
  if (name) return name;
  return isOpenEntry ? "awaiting eliminated team" : "TBD";
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
      : `${slotLabel(game.team1_name, game.team1_is_open_entry)} vs ${slotLabel(game.team2_name, game.team2_is_open_entry)}`;

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
