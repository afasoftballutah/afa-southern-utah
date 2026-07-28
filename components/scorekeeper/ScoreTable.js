"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DirectorTable from "./DirectorTable";
import ConfirmDialog from "./ConfirmDialog";
import { LEAGUE_TZ } from "@/lib/bracket/tree";
import { mootIfRounds } from "@/lib/bracket/if-game";

// Every game in a division, one line each.
//
// JD, 2026-07-28: "make this something a lot easier to use, same principles."
// Seventeen games filled 3176 pixels: each one a card with a time heading
// above it, the number and field on one line, the two teams on another, and a
// full-width button under that. A scorekeeper at a ballpark scrolled past
// sixteen finished games to reach the one being played.
//
// So it reads like a scoreboard — the score sits BETWEEN the two teams, which
// is where everyone looks for it:
//
//   17   Sun 5:00 PM   F4    Backwards K   [17] – [13]   Del Fuegos   ☑
//
// Type a score and Save appears; nothing else moves. Clear is destructive and
// rare, so it lives in the row you open, behind a confirm.

const PLACEHOLDER_RE = /^(Winner|Loser) of Game \d+$/;
const isPlaceholder = (name) => Boolean(name) && PLACEHOLDER_RE.test(name);

function timeLabel(scheduledTime) {
  if (!scheduledTime) return "TBD";
  const d = new Date(scheduledTime);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ })
  );
}

/** "Field 4" and "4" both print as F4; the column is three characters wide. */
function fieldLabel(field) {
  const raw = String(field ?? "").trim();
  if (!raw) return "—";
  const n = raw.match(/(\d+)\s*$/);
  return n ? `F${n[1]}` : raw;
}

const ENDPOINTS = {
  bracket: {
    url: (id) => `/api/scorekeeper/games/${id}/score`,
    body: (a, b) => ({ team1Score: Number(a), team2Score: Number(b) }),
    label: "#",
  },
  pool: {
    url: (id) => `/api/scorekeeper/pool-games/${id}/score`,
    body: (a, b) => ({ team1_score: Number(a), team2_score: Number(b) }),
    label: "Pool",
  },
};

export default function ScoreTable({ games, kind = "bracket", readOnly = false, title = "Games" }) {
  const router = useRouter();
  const api = ENDPOINTS[kind] ?? ENDPOINTS.bracket;
  const list = games ?? [];

  const columns = [
    { key: "num", label: api.label, align: "center", width: "3.5rem" },
    { key: "when", label: "When", width: "9rem" },
    { key: "field", label: "Field", align: "center", width: "4rem" },
    { key: "team1", label: "Team", align: "right" },
    { key: "score", label: "Score", align: "center", width: "11rem" },
    { key: "team2", label: "Team" },
    { key: "done", label: "In", align: "center", width: "3.5rem" },
  ];

  const filters = [
    { key: "left", label: "Still to play", tag: "unplayed" },
    { key: "done", label: "Scored", tag: "played" },
  ];

  // The if-game the champion made unnecessary. It is on the printed sheet
  // because nobody knew in advance which way the final would go; it is not a
  // game anybody is waiting to play, and offering two score boxes for it says
  // otherwise (JD, 2026-07-28: "thats an if game that never was needed").
  const moot = kind === "bracket" ? mootIfRounds(list) : new Set();

  const rows = list.map((g) => {
    const final = g.status === "final";
    const t1Ready = Boolean(g.team1_name) && !isPlaceholder(g.team1_name);
    const t2Ready = Boolean(g.team2_name) && !isPlaceholder(g.team2_name);
    // Never offer inputs that would score a phantom: a bracket slot still
    // reading "Winner of Game 5" has no team in it yet.
    const waiting = !t1Ready || !t2Ready;
    const notNeeded = moot.has(g.round);
    const tie = final && g.team1_score === g.team2_score;
    const won1 = final && !tie && g.team1_score > g.team2_score;
    const won2 = final && !tie && g.team2_score > g.team1_score;
    const number = kind === "pool" ? (g.pool ?? "—") : g.round;

    return {
      key: g.id,
      tags: [notNeeded ? "moot" : final ? "played" : "unplayed"],
      search: `${g.team1_name ?? ""} ${g.team2_name ?? ""} ${number} ${g.field ?? ""}`,
      sortValues: {
        // Play order, which is what a scorekeeper works down: the time first,
        // then the printed number inside it.
        when: `${g.scheduled_time ?? "9999"}|${String(number).padStart(4, "0")}`,
        num: typeof number === "number" ? number : String(number),
        field: String(g.field ?? ""),
        team1: String(g.team1_name ?? "").toLowerCase(),
        team2: String(g.team2_name ?? "").toLowerCase(),
        score: final ? 1 : 0,
        done: notNeeded ? -1 : final ? 1 : 0,
      },
      cells: {
        num: <span className="font-semibold text-afa-navy">{number}</span>,
        when: timeLabel(g.scheduled_time),
        field: fieldLabel(g.field),
        team1: (
          <span className={won1 ? "font-semibold text-afa-navy" : ""}>{g.team1_name || "TBD"}</span>
        ),
        team2: (
          <span className={won2 ? "font-semibold text-afa-navy" : ""}>{g.team2_name || "TBD"}</span>
        ),
        score: notNeeded ? (
          <span className="t-meta">not needed</span>
        ) : waiting ? (
          <span className="t-meta">waiting</span>
        ) : readOnly ? (
          <span className="tabular-nums">{final ? `${g.team1_score} – ${g.team2_score}` : "—"}</span>
        ) : (
          <ScoreCell game={g} api={api} onSaved={() => router.refresh()} />
        ),
        done: notNeeded ? (
          <span className="text-afa-muted/50">—</span>
        ) : (
          <span className={"tick " + (final ? "text-afa-go" : "text-afa-muted/50")}>
            {final ? "☑" : "☐"}
          </span>
        ),
      },
      detail: (
        <RowDetail
          game={g}
          api={api}
          waiting={waiting}
          notNeeded={notNeeded}
          readOnly={readOnly}
          onDone={() => router.refresh()}
        />
      ),
    };
  });

  if (list.length === 0) {
    return (
      <div className="card p-4">
        <p className="t-meta">No games yet.</p>
      </div>
    );
  }

  return (
    <DirectorTable
      columns={columns}
      rows={rows}
      filters={filters}
      defaultSort={{ key: kind === "pool" ? "when" : "num", dir: "asc" }}
      searchPlaceholder="Team, field or number…"
      empty="No game matches that."
      before={<p className="t-strong">{title}</p>}
    />
  );
}

// Two boxes and a dash. Save appears only once a number has changed, so a
// finished sheet is seventeen quiet rows rather than seventeen buttons.
function ScoreCell({ game, api, onSaved }) {
  const [a, setA] = useState(game.team1_score ?? "");
  const [b, setB] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    String(a) !== String(game.team1_score ?? "") || String(b) !== String(game.team2_score ?? "");
  const ready = a !== "" && b !== "";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.url(game.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.body(a, b)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${game.team1_name} score`}
        className="w-11 rounded border border-afa-navy/30 px-1 py-0.5 text-center text-[14px] tabular-nums"
        value={a}
        onChange={(e) => setA(e.target.value)}
        disabled={busy}
      />
      <span className="text-afa-ink/40">–</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${game.team2_name} score`}
        className="w-11 rounded border border-afa-navy/30 px-1 py-0.5 text-center text-[14px] tabular-nums"
        value={b}
        onChange={(e) => setB(e.target.value)}
        disabled={busy}
      />
      {dirty && ready && (
        <button type="button" className="pill pill-solid" disabled={busy} onClick={save}>
          {busy ? "…" : "Save"}
        </button>
      )}
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}
    </span>
  );
}

function RowDetail({ game, api, waiting, notNeeded, readOnly, onDone }) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState("");
  const final = game.status === "final";

  async function clear() {
    setAsk(false);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.url(game.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not clear score");
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {notNeeded && (
        <span className="t-meta">
          {game.team1_name} won the final without a loss, so this game was never played.
        </span>
      )}
      {waiting && !notNeeded && (
        <span className="t-meta">Waiting on an earlier game to name a team.</span>
      )}
      {final && !readOnly && (
        <button type="button" className="pill" disabled={busy} onClick={() => setAsk(true)}>
          Clear the score
        </button>
      )}
      {!final && !waiting && !notNeeded && <span className="t-meta">Not scored yet.</span>}
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}
      {ask && (
        <ConfirmDialog
          title={`${game.team1_name} v ${game.team2_name}`}
          message={`Clear ${game.team1_score}–${game.team2_score}? Any later game already showing this result goes back to waiting.`}
          confirmLabel="Clear it"
          busy={busy}
          onConfirm={clear}
          onCancel={() => setAsk(false)}
        />
      )}
    </div>
  );
}
