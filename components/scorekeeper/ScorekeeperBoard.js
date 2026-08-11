"use client";

import { useMemo, useState } from "react";
import ScoreTable from "./ScoreTable";
import { stillToPlayIn } from "@/lib/tournament-state";
import { mootIfRounds } from "@/lib/bracket/if-game";

/**
 * Scorekeeper control board for one tournament.
 *
 * Top selectors are the whole point: status / division / stage / field,
 * then one filtered sheet. Defaults to "need a score" — field day.
 */

function ChipGroup({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      <span className="t-label text-[10px] w-14 shrink-0 text-afa-muted/70">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1 min-w-0">{children}</div>
    </div>
  );
}

function Chip({ on, children, onClick, tone = "neutral" }) {
  const onCls =
    tone === "action"
      ? "border-afa-red bg-afa-red text-white"
      : tone === "quiet"
        ? "border-emerald-700 bg-emerald-700 text-white"
        : "border-afa-navy bg-afa-navy text-white";
  const offCls =
    "border-afa-navy/20 bg-white text-afa-navy/80 hover:border-afa-navy/40";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums whitespace-nowrap " +
        (on ? onCls : offCls)
      }
    >
      {children}
    </button>
  );
}

function fieldKey(field) {
  const raw = String(field ?? "").trim();
  if (!raw) return null;
  const n = raw.match(/(\d+)\s*$/);
  return n ? `F${n[1]}` : raw;
}

function gameOpen(g, kind) {
  if (g.status === "final") return false;
  if (g.is_bye) return false;
  if (kind === "bracket") {
    // stillToPlayIn handles byes / if-games; use for open count consistency
  }
  return g.status !== "final" && !g.is_bye;
}

export default function ScorekeeperBoard({
  tournamentName,
  divisions = [],
  leftCount = 0,
}) {
  const [status, setStatus] = useState("need"); // need | scored | all
  const [divisionId, setDivisionId] = useState("all");
  const [stage, setStage] = useState("all"); // all | pool | bracket
  const [field, setField] = useState("all");
  const [query, setQuery] = useState("");

  // Flatten every game with division + stage metadata.
  const catalog = useMemo(() => {
    const out = [];
    for (const d of divisions) {
      const divLabel = d.display_name ?? d.name ?? "Division";
      const pool = d.pool_games ?? [];
      const bracket = d.games ?? [];
      const moot = mootIfRounds(bracket);
      for (const g of pool) {
        out.push({
          game: g,
          kind: "pool",
          divisionId: d.id,
          divisionLabel: divLabel,
          fieldKey: fieldKey(g.field),
          open:
            g.status !== "final" &&
            stillToPlayIn([g]).length > 0,
          scored: g.status === "final",
        });
      }
      for (const g of bracket) {
        const notNeeded = moot.has(g.round);
        out.push({
          game: g,
          kind: "bracket",
          divisionId: d.id,
          divisionLabel: divLabel,
          fieldKey: fieldKey(g.field),
          open: !notNeeded && stillToPlayIn([g]).length > 0,
          scored: g.status === "final",
          notNeeded,
        });
      }
    }
    return out;
  }, [divisions]);

  const divisionOptions = useMemo(() => {
    const map = new Map();
    for (const row of catalog) {
      if (!map.has(row.divisionId)) {
        map.set(row.divisionId, {
          id: row.divisionId,
          label: row.divisionLabel,
          open: 0,
        });
      }
      if (row.open) map.get(row.divisionId).open += 1;
    }
    return [...map.values()];
  }, [catalog]);

  const fieldOptions = useMemo(() => {
    const map = new Map();
    for (const row of catalog) {
      if (!row.fieldKey) continue;
      if (!map.has(row.fieldKey)) {
        map.set(row.fieldKey, { key: row.fieldKey, open: 0 });
      }
      if (row.open) map.get(row.fieldKey).open += 1;
    }
    return [...map.values()].sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { numeric: true })
    );
  }, [catalog]);

  const counts = useMemo(() => {
    let need = 0;
    let scored = 0;
    let pool = 0;
    let bracket = 0;
    for (const row of catalog) {
      if (row.open) need += 1;
      if (row.scored) scored += 1;
      if (row.kind === "pool") pool += 1;
      if (row.kind === "bracket") bracket += 1;
    }
    return { need, scored, all: catalog.length, pool, bracket };
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((row) => {
      if (status === "need" && !row.open) return false;
      if (status === "scored" && !row.scored) return false;
      if (divisionId !== "all" && row.divisionId !== divisionId) return false;
      if (stage !== "all" && row.kind !== stage) return false;
      if (field !== "all" && row.fieldKey !== field) return false;
      if (q) {
        const hay = `${row.game.team1_name ?? ""} ${row.game.team2_name ?? ""} ${row.divisionLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, status, divisionId, stage, field, query]);

  // Group by division for readable sections (order preserved from catalog).
  const sections = useMemo(() => {
    const order = [];
    const byDiv = new Map();
    for (const row of filtered) {
      if (!byDiv.has(row.divisionId)) {
        byDiv.set(row.divisionId, {
          id: row.divisionId,
          label: row.divisionLabel,
          pool: [],
          bracket: [],
        });
        order.push(row.divisionId);
      }
      const sec = byDiv.get(row.divisionId);
      if (row.kind === "pool") sec.pool.push(row.game);
      else sec.bracket.push(row.game);
    }
    return order.map((id) => byDiv.get(id));
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Sticky control strip — the scorekeeper’s whole decision surface */}
      <div className="card sticky top-0 z-20 px-3 py-3 space-y-2.5 shadow-sm border-afa-navy/15">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="t-strong text-sm min-w-0 truncate">{tournamentName}</p>
          <p className="t-meta text-[12px] tabular-nums shrink-0">
            {status === "need"
              ? `${filtered.length} need a score`
              : status === "scored"
                ? `${filtered.length} scored`
                : `${filtered.length} games`}
            {leftCount > 0 && status !== "need"
              ? ` · ${leftCount} still open overall`
              : null}
          </p>
        </div>

        <ChipGroup label="Show">
          <Chip
            on={status === "need"}
            tone="action"
            onClick={() => setStatus("need")}
          >
            Need score {counts.need}
          </Chip>
          <Chip
            on={status === "scored"}
            tone="quiet"
            onClick={() => setStatus("scored")}
          >
            Scored {counts.scored}
          </Chip>
          <Chip on={status === "all"} onClick={() => setStatus("all")}>
            All {counts.all}
          </Chip>
        </ChipGroup>

        {divisionOptions.length > 1 && (
          <ChipGroup label="Division">
            <Chip
              on={divisionId === "all"}
              onClick={() => setDivisionId("all")}
            >
              All
            </Chip>
            {divisionOptions.map((d) => (
              <Chip
                key={d.id}
                on={divisionId === d.id}
                onClick={() => setDivisionId(d.id)}
              >
                {d.label}
                {d.open > 0 ? (
                  <span className="ml-1 opacity-80">{d.open}</span>
                ) : null}
              </Chip>
            ))}
          </ChipGroup>
        )}

        <ChipGroup label="Stage">
          <Chip on={stage === "all"} onClick={() => setStage("all")}>
            All
          </Chip>
          {counts.pool > 0 && (
            <Chip on={stage === "pool"} onClick={() => setStage("pool")}>
              Pool {counts.pool}
            </Chip>
          )}
          {counts.bracket > 0 && (
            <Chip on={stage === "bracket"} onClick={() => setStage("bracket")}>
              Bracket {counts.bracket}
            </Chip>
          )}
        </ChipGroup>

        {fieldOptions.length > 0 && (
          <ChipGroup label="Field">
            <Chip on={field === "all"} onClick={() => setField("all")}>
              All
            </Chip>
            {fieldOptions.map((f) => (
              <Chip
                key={f.key}
                on={field === f.key}
                onClick={() => setField(f.key)}
              >
                {f.key}
                {f.open > 0 ? (
                  <span className="ml-1 opacity-80">{f.open}</span>
                ) : null}
              </Chip>
            ))}
          </ChipGroup>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="t-label text-[10px] w-14 shrink-0 text-afa-muted/70">
            Team
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a team…"
            className="flex-1 min-w-[10rem] max-w-sm border border-afa-navy/25 rounded-lg px-2.5 py-1.5 text-[13px]"
          />
          {(status !== "need" ||
            divisionId !== "all" ||
            stage !== "all" ||
            field !== "all" ||
            query) && (
            <button
              type="button"
              className="t-label text-[12px] underline text-afa-muted"
              onClick={() => {
                setStatus("need");
                setDivisionId("all");
                setStage("all");
                setField("all");
                setQuery("");
              }}
            >
              Reset to need score
            </button>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="card p-5 text-center space-y-1">
          <p className="t-strong text-sm">Nothing matches</p>
          <p className="t-meta text-[12px]">
            {status === "need"
              ? "No open games for these filters. Try All or Scored, or clear Field / Division."
              : "Try a different filter combination."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((sec) => (
            <section key={sec.id} className="space-y-2">
              {sec.pool.length > 0 && (stage === "all" || stage === "pool") && (
                <ScoreTable
                  games={sec.pool}
                  kind="pool"
                  title={`${sec.label} · pool`}
                  hideFilters
                />
              )}
              {sec.bracket.length > 0 &&
                (stage === "all" || stage === "bracket") && (
                  <ScoreTable
                    games={sec.bracket}
                    kind="bracket"
                    title={`${sec.label} · bracket`}
                    hideFilters
                  />
                )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
