"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { directorPost } from "./DirectorForm";
import { formatGameWhenInput, parseGameWhenInput } from "@/lib/league-time";
import GameWhenInput from "./GameWhenInput";

/**
 * Director-typed bracket. No Generate. Each game is one line the way they
 * already wrote it on paper: two sides, a field, a time.
 */
export default function HandGames({ divisionId, games = [], teamNames = [], playDay = null }) {
  const router = useRouter();
  const list = useMemo(
    () => [...games].sort((a, b) => (a.round ?? 0) - (b.round ?? 0)),
    [games]
  );
  const teams = useMemo(
    () => [...new Set((teamNames ?? []).map((n) => String(n).trim()).filter(Boolean))],
    [teamNames]
  );

  const nextNumber = useMemo(() => {
    const used = new Set(list.map((g) => g.round));
    let n = 1;
    while (used.has(n)) n += 1;
    return n;
  }, [list]);

  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [field, setField] = useState("");
  const [time, setTime] = useState("");
  const [gameNumber, setGameNumber] = useState(String(nextNumber));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setGameNumber(String(nextNumber));
  }, [nextNumber]);

  const fromGames = useMemo(
    () =>
      list.flatMap((g) => [
        `Winner of Game ${g.round}`,
        `Loser of Game ${g.round}`,
      ]),
    [list]
  );

  async function add(e) {
    e?.preventDefault?.();
    setBusy(true);
    setError("");
    const res = await directorPost({
      action: "addHandGame",
      divisionId,
      team1Name: team1,
      team2Name: team2,
      gameNumber,
      field,
      scheduledTime: parseGameWhenInput(time, playDay)?.toISOString() ?? null,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setTeam1("");
    setTeam2("");
    setField("");
    setTime("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="t-strong">Your own bracket</p>
        <p className="t-meta">
          First games are team vs team. After those are in, the list also has
          Winner of Game 1 and Loser of Game 1.
        </p>
      </div>

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((g) => (
            <HandGameLine
              key={g.id}
              game={g}
              games={list}
              teamNames={teams}
              playDay={playDay}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      ) : null}

      <form className="card p-4 space-y-3" onSubmit={add}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="t-label block mb-1">Game #</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className="form-field w-full"
              value={gameNumber}
              onChange={(e) => setGameNumber(e.target.value)}
              required
            />
          </label>
          <div className="hidden sm:block" />
          <Seat
            label="Team 1"
            value={team1}
            onChange={setTeam1}
            teams={teams}
            fromGames={fromGames}
          />
          <Seat
            label="Team 2"
            value={team2}
            onChange={setTeam2}
            teams={teams}
            fromGames={fromGames}
          />
          <label className="block min-w-0">
            <span className="t-label block mb-1">Field</span>
            <input
              className="form-field w-full"
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="optional"
            />
          </label>
          <GameWhenInput
            playDay={playDay}
            value={time}
            onChange={setTime}
            className="form-field w-full"
            label="Time"
          />
        </div>
        {error ? (
          <p className="text-afa-ink font-bold underline text-sm">{error}</p>
        ) : null}
        <button
          type="submit"
          className="btn-action"
          disabled={busy || !team1.trim() || !team2.trim()}
        >
          {busy ? "Adding…" : "Add game"}
        </button>
      </form>
    </div>
  );
}

function seatFromName(raw, games, selfId) {
  const name = String(raw ?? "").trim();
  const win = /^Winner of Game (\d+)$/i.exec(name);
  const lose = /^Loser of Game (\d+)$/i.exec(name);
  const ref = win || lose;
  if (ref) {
    const n = Number(ref[1]);
    const src = (games ?? []).find((g) => g.round === n && g.id !== selfId);
    return {
      name: `${win ? "Winner" : "Loser"} of Game ${n}`,
      sourceId: src?.id ?? null,
      sourceResult: win ? "winner" : "loser",
    };
  }
  return { name: name || null, sourceId: null, sourceResult: null };
}

function Seat({ label, value, onChange, teams, fromGames }) {
  return (
    <label className="block min-w-0">
      <span className="t-label block mb-1">{label}</span>
      <select
        className="form-field w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">Pick one…</option>
        {teams.map((n) => (
          <option key={`t-${n}`} value={n}>
            {n}
          </option>
        ))}
        {fromGames.length > 0 ? (
          <optgroup label="From an earlier game">
            {fromGames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

function HandGameLine({ game, games, teamNames, playDay = null, onChanged }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(String(game.round ?? ""));
  const [team1, setTeam1] = useState(game.team1_name || "");
  const [team2, setTeam2] = useState(game.team2_name || "");
  const [field, setField] = useState(game.field || "");
  const [time, setTime] = useState(formatGameWhenInput(game.scheduled_time, playDay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveTeams() {
    setBusy(true);
    setError("");
    try {
      const left = seatFromName(team1, games, game.id);
      const right = seatFromName(team2, games, game.id);
      const res = await fetch(`/api/scorekeeper/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Name: left.name,
          team2Name: right.name,
          team1SourceGameId: left.sourceId,
          team1SourceResult: left.sourceResult,
          team2SourceGameId: right.sourceId,
          team2SourceResult: right.sourceResult,
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

  async function saveSchedule() {
    setBusy(true);
    setError("");
    try {
      if (String(round) !== String(game.round)) {
        const numbered = await directorPost({
          action: "setHandGameNumber",
          gameId: game.id,
          gameNumber: Number(round),
        });
        if (numbered.error) throw new Error(numbered.error);
      }
      const res = await fetch(`/api/scorekeeper/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: field || null,
          scheduledTime: parseGameWhenInput(time, playDay)?.toISOString() ?? null,
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

  async function remove() {
    if (!window.confirm(`Remove Game ${game.round}?`)) return;
    setBusy(true);
    setError("");
    const res = await directorPost({ action: "deleteHandGame", gameId: game.id });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  return (
    <div className="border border-afa-navy/10 rounded-lg p-3 space-y-2">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-semibold text-sm min-w-0">
          <span className="text-afa-navy/50 tabular-nums mr-2">G{game.round}</span>
          {game.team1_name || "—"} vs {game.team2_name || "—"}
        </span>
        <span className="t-meta shrink-0">
          {[game.field, timeLabel(game.scheduled_time)].filter(Boolean).join(" · ")}
        </span>
      </button>
      {open ? (
        <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-afa-navy/10">
          <Seat
            label="Team 1"
            value={team1}
            onChange={setTeam1}
            teams={teamNames}
            fromGames={(games ?? [])
              .filter((g) => g.id !== game.id)
              .flatMap((g) => [
                `Winner of Game ${g.round}`,
                `Loser of Game ${g.round}`,
              ])}
          />
          <Seat
            label="Team 2"
            value={team2}
            onChange={setTeam2}
            teams={teamNames}
            fromGames={(games ?? [])
              .filter((g) => g.id !== game.id)
              .flatMap((g) => [
                `Winner of Game ${g.round}`,
                `Loser of Game ${g.round}`,
              ])}
          />
          <button
            type="button"
            className="sm:col-span-2 text-afa-navy underline text-sm font-semibold text-left"
            disabled={busy}
            onClick={saveTeams}
          >
            Save teams
          </button>
          <label className="block min-w-0">
            <span className="t-label block mb-1">Game #</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className="form-field w-full"
              value={round}
              onChange={(e) => setRound(e.target.value)}
            />
          </label>
          <input
            className="form-field w-full self-end"
            placeholder="Field"
            value={field}
            onChange={(e) => setField(e.target.value)}
          />
          <GameWhenInput
            playDay={playDay}
            value={time}
            onChange={setTime}
            className="form-field w-full"
          />
          <button
            type="button"
            className="text-afa-navy underline text-sm font-semibold text-left"
            disabled={busy}
            onClick={saveSchedule}
          >
            Save
          </button>
          <button
            type="button"
            className="t-meta underline text-sm text-left"
            disabled={busy}
            onClick={remove}
          >
            Remove game
          </button>
          {error ? (
            <p className="sm:col-span-2 text-afa-ink font-bold underline text-sm">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function timeLabel(iso) {
  if (!iso) return "";
  const v = formatLeagueInputValue(iso);
  if (!v) return "";
  const [d, t] = v.split("T");
  return t ? `${d} ${t}` : d;
}
