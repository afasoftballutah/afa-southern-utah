"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { directorPost } from "./DirectorForm";
import {
  formatLeagueInputValue,
  parseLeagueInputValue,
} from "@/lib/league-time";

/**
 * Director-typed bracket. No Generate. Each game is one line the way they
 * already wrote it on paper: two sides, a field, a time.
 */
export default function HandGames({ divisionId, games = [], teamNames = [] }) {
  const router = useRouter();
  const list = useMemo(
    () => [...games].sort((a, b) => (a.round ?? 0) - (b.round ?? 0)),
    [games]
  );
  const teams = useMemo(
    () => [...new Set((teamNames ?? []).map((n) => String(n).trim()).filter(Boolean))],
    [teamNames]
  );

  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [field, setField] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => {
    const out = teams.map((n) => ({ value: n, label: n }));
    for (const g of list) {
      out.push({
        value: `Winner of Game ${g.round}`,
        label: `Winner of Game ${g.round}`,
      });
      out.push({
        value: `Loser of Game ${g.round}`,
        label: `Loser of Game ${g.round}`,
      });
    }
    return out;
  }, [teams, list]);

  async function add(e) {
    e?.preventDefault?.();
    setBusy(true);
    setError("");
    const res = await directorPost({
      action: "addHandGame",
      divisionId,
      team1Name: team1,
      team2Name: team2,
      field,
      scheduledTime: parseLeagueInputValue(time)?.toISOString() ?? null,
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
          Add each game the director already made. Field and time can wait.
        </p>
      </div>

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((g) => (
            <HandGameLine
              key={g.id}
              game={g}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      ) : null}

      <form className="card p-4 space-y-3" onSubmit={add}>
        <p className="t-label">
          Game {(list[list.length - 1]?.round ?? 0) + 1}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Seat
            label="Team 1"
            value={team1}
            onChange={setTeam1}
            options={options}
          />
          <Seat
            label="Team 2"
            value={team2}
            onChange={setTeam2}
            options={options}
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
          <label className="block min-w-0">
            <span className="t-label block mb-1">Time</span>
            <input
              type="datetime-local"
              className="form-field w-full"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
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

function Seat({ label, value, onChange, options }) {
  const listId = `hand-seat-${label.replace(/\s+/g, "-")}`;
  return (
    <label className="block min-w-0">
      <span className="t-label block mb-1">{label}</span>
      <input
        className="form-field w-full"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Team or Winner of Game 1"
        required
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value} />
        ))}
      </datalist>
    </label>
  );
}

function HandGameLine({ game, onChanged }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(game.field || "");
  const [time, setTime] = useState(formatLeagueInputValue(game.scheduled_time));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveSchedule() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: field || null,
          scheduledTime: parseLeagueInputValue(time)?.toISOString() ?? null,
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
          <input
            className="form-field w-full"
            placeholder="Field"
            value={field}
            onChange={(e) => setField(e.target.value)}
          />
          <input
            type="datetime-local"
            className="form-field w-full"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <button
            type="button"
            className="text-afa-navy underline text-sm font-semibold text-left"
            disabled={busy}
            onClick={saveSchedule}
          >
            Save schedule
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
