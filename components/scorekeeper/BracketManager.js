"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlacementsUpload from "./PlacementsUpload";
import DirectorSeedList from "./DirectorSeedList";
import DrawnBracket from "@/components/bracket/DrawnBracket";
import { isCompleteSeedOrder, normalizeSeedOrder } from "@/lib/bracket/seed-order";
import { seedOrderFromPools } from "@/lib/bracket/seed";
import { forDrawnBracket } from "@/lib/bracket/for-drawn-bracket";
import { isSurvivorPoolGame } from "@/lib/bracket/lives";
import { formatLeagueInputValue, parseLeagueInputValue } from "@/lib/league-time";
import { directorPost } from "./DirectorForm";

const FORMATS = [
  { value: "three_gg_hybrid", label: "3GG" },
  { value: "double_elim", label: "Double elim" },
  { value: "double_elim_consolation", label: "Double elim + consol" },
];

export default function BracketManager({
  divisionId,
  mainBracket,
  consolationBracket,
  games,
  teamNames,
  seedOrder: seedOrderProp = null,
  poolGames = [],
  mainDraft,
  consolationDraft,
  completion,
  tournamentSlug = null,
  divisionName = "Draft",
}) {
  const router = useRouter();
  const poolDerived = useMemo(() => seedOrderFromPools(poolGames), [poolGames]);
  const poolsComplete = poolGames.length > 0 && poolDerived.complete;

  const teams = useMemo(() => {
    if (teamNames?.length >= 2) return teamNames;
    if (poolsComplete) return poolDerived.order;
    return teamNames ?? [];
  }, [teamNames, poolsComplete, poolDerived.order]);

  const defaultOrder = useMemo(() => {
    if (isCompleteSeedOrder(teams, seedOrderProp)) {
      return normalizeSeedOrder(teams, seedOrderProp);
    }
    if (poolsComplete) return poolDerived.order;
    return normalizeSeedOrder(teams, teams);
  }, [teams, seedOrderProp, poolsComplete, poolDerived.order]);

  const [format, setFormat] = useState(
    mainBracket?.format || (poolGames.length > 0 ? "double_elim" : "three_gg_hybrid")
  );
  const [seedOrder, setSeedOrder] = useState(defaultOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seedsReady = isCompleteSeedOrder(teams, seedOrder);
  const anyDraft = mainDraft || (consolationBracket ? consolationDraft : false);
  const hasBracket = !!mainBracket;

  const mainGames = useMemo(
    () => (games ?? []).filter((g) => g.bracket_group === "main"),
    [games]
  );
  const consolationGames = useMemo(
    () => (games ?? []).filter((g) => g.bracket_group === "consolation"),
    [games]
  );

  /** Director seeds for DrawnBracket pills: every team shows [#n]. */
  const directorSeeds = useMemo(() => {
    const byTeam = new Map();
    const byRef = new Map();
    (seedOrder ?? []).forEach((name, i) => {
      const tag = `#${i + 1}`;
      byTeam.set(name, tag);
      byRef.set(tag, name);
      byRef.set(`Seed #${i + 1}`, name);
    });
    return { byTeam, byRef };
  }, [seedOrder]);

  async function runGenerate() {
    if (!seedsReady) {
      setError("Set seed order #1 through every team first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/bracket/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, format, seedOrder }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearAndGenerate() {
    if (hasBracket) {
      const ok = window.confirm(
        anyDraft
          ? "Clear this draft and generate a new bracket from the seeds above?"
          : "Clear the current bracket and generate a new one from the seeds above? All scores will be wiped."
      );
      if (!ok) return;
    }
    await runGenerate();
  }

  const canGenerate = !busy && teams.length >= 2 && seedsReady;

  return (
    <div className="space-y-5">
      {/* 1. Seeds */}
      <DirectorSeedList
        divisionId={divisionId}
        teamNames={teams}
        initialOrder={defaultOrder}
        poolDefault={poolsComplete ? poolDerived.order : null}
        onOrderChange={setSeedOrder}
        onSaved={setSeedOrder}
      />

      {/* 2. Format + one action */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border border-afa-navy/30 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white min-w-[10rem]"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          aria-label="Bracket format"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canGenerate}
          onClick={clearAndGenerate}
          className="bg-afa-navy text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-40 text-sm"
        >
          {busy ? "Working…" : hasBracket ? "Clear & generate" : "Generate"}
        </button>
      </div>
      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}

      {completion?.complete && <PlacementsUpload divisionId={divisionId} completion={completion} />}

      {/* 3. Drawing — pass director seeds so every team shows [#n] */}
      {hasBracket && mainGames.length > 0 && (
        <DrawnBracket
          games={forDrawnBracket(mainGames)}
          division={divisionName}
          seeds={directorSeeds}
        />
      )}
      {hasBracket && consolationGames.length > 0 && (
        <DrawnBracket
          games={forDrawnBracket(consolationGames)}
          division={`${divisionName} consol`}
          seeds={directorSeeds}
        />
      )}

      {/* 4. Score */}
      {hasBracket && mainGames.length > 0 && (
        <div className="space-y-4">
          <ScoreList
            games={mainGames}
            draft={mainDraft}
            teamNames={teams}
            onChanged={() => router.refresh()}
          />
          {consolationBracket && consolationGames.length > 0 && (
            <ScoreList
              games={consolationGames}
              draft={consolationDraft}
              teamNames={teams}
              onChanged={() => router.refresh()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ScoreList({ games, draft, teamNames, onChanged }) {
  const sorted = useMemo(() => {
    const sideRank = { winners: 0, losers: 1, final: 2 };
    return [...(games ?? [])].sort((a, b) => {
      if (sideRank[a.bracket_side] !== sideRank[b.bracket_side]) {
        return (sideRank[a.bracket_side] ?? 9) - (sideRank[b.bracket_side] ?? 9);
      }
      if (a.round !== b.round) return a.round - b.round;
      return a.slot - b.slot;
    });
  }, [games]);

  return (
    <div className="space-y-2">
      {sorted.map((g) => (
        <GameRow
          key={g.id}
          game={g}
          games={sorted}
          teamNames={teamNames}
          draft={draft}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function slotLabel(name, isOpenEntry) {
  if (name) return name;
  return isOpenEntry ? "awaiting team" : "—";
}

function seatKey(game, side) {
  const src = game[`team${side}_source_game_id`];
  const res = game[`team${side}_source_result`];
  if (src && (res === "winner" || res === "loser")) return `__${res}:${src}`;
  return game[`team${side}_name`] || "";
}

function parseSeat(value, games) {
  const m = /^__(winner|loser):(.+)$/.exec(String(value ?? ""));
  if (m) {
    const src = (games ?? []).find((g) => g.id === m[2]);
    const n = src?.round;
    const who = m[1] === "winner" ? "Winner" : "Loser";
    return {
      name: n != null ? `${who} of Game ${n}` : `${who}`,
      sourceId: m[2],
      sourceResult: m[1],
    };
  }
  const name = String(value ?? "").trim();
  return { name: name || null, sourceId: null, sourceResult: null };
}

function GameRow({ game, games = [], teamNames, draft, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [team1, setTeam1] = useState(() => seatKey(game, "1"));
  const [team2, setTeam2] = useState(() => seatKey(game, "2"));
  const [round, setRound] = useState(String(game.round ?? ""));
  const [field, setField] = useState(game.field || "");
  const [time, setTime] = useState(formatLeagueInputValue(game.scheduled_time));
  const [score1, setScore1] = useState(game.team1_score ?? "");
  const [score2, setScore2] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const playable = game.team1_name && game.team2_name && game.status === "pending";
  const thirdLife = isSurvivorPoolGame(game) || String(game.field ?? "") === "Guarantee net";

  async function saveSlots() {
    setBusy(true);
    setError("");
    try {
      const left = parseSeat(team1, games);
      const right = parseSeat(team2, games);
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

  if (game.status === "cancelled") return null;

  const label = `${slotLabel(game.team1_name, game.team1_is_open_entry)} vs ${slotLabel(game.team2_name, game.team2_is_open_entry)}`;

  return (
    <div
      className={
        "border rounded-lg p-3 space-y-2 " +
        (thirdLife ? "border-afa-navy/40 bg-afa-navy/[0.03]" : "border-afa-navy/10")
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left gap-2"
      >
        <span className="font-semibold text-sm min-w-0">
          <span className="text-afa-navy/50 tabular-nums mr-2">G{game.round}</span>
          {label}
        </span>
        {game.status === "final" && (
          <span className="text-sm text-afa-ink/70 shrink-0 tabular-nums">
            {game.team1_score}–{game.team2_score}
            {game.is_bye ? " bye" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-afa-navy/10">
          {draft && game.status === "pending" && (
            <div className="grid grid-cols-2 gap-2">
              <TeamSelect
                value={team1}
                onChange={setTeam1}
                teamNames={teamNames}
                games={games}
                exceptId={game.id}
              />
              <TeamSelect
                value={team2}
                onChange={setTeam2}
                teamNames={teamNames}
                games={games}
                exceptId={game.id}
              />
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
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
              aria-label="Game number"
              value={round}
              onChange={(e) => setRound(e.target.value)}
            />
            <input
              className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
              placeholder="Field"
              value={field}
              onChange={(e) => setField(e.target.value)}
            />
            <input
              type="datetime-local"
              className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <button
              type="button"
              onClick={saveSchedule}
              disabled={busy}
              className="col-span-2 text-afa-navy underline text-sm font-semibold text-left"
            >
              Save schedule
            </button>
          </div>

          {playable && (
            <div className="grid grid-cols-2 gap-2 items-end">
              <label className="block min-w-0">
                <span className="block text-xs font-semibold mb-1 truncate">{game.team1_name}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg"
                  value={score1}
                  onChange={(e) => setScore1(e.target.value)}
                />
              </label>
              <label className="block min-w-0">
                <span className="block text-xs font-semibold mb-1 truncate">{game.team2_name}</span>
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
                Score
              </button>
            </div>
          )}

          {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TeamSelect({ value, onChange, teamNames, games = [], exceptId }) {
  const fromGames = (games ?? []).filter((g) => g.id !== exceptId && g.status !== "cancelled");
  return (
    <select
      className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {teamNames.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      {fromGames.length > 0 ? (
        <optgroup label="From an earlier game">
          {fromGames.map((g) => (
            <Fragment key={g.id}>
              <option value={`__winner:${g.id}`}>Winner of Game {g.round}</option>
              <option value={`__loser:${g.id}`}>Loser of Game {g.round}</option>
            </Fragment>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
