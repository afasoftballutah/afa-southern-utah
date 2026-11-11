"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTimeZone } from "@/components/TimeZoneContext";
import ScoreEntry from "./ScoreEntry";
import {
  buildScorekeeperCatalog,
  scorekeeperFieldOptions,
  scorekeeperDayOptions,
  filterScorekeeperCatalog,
  defaultDayKey,
  fieldStorageKey,
} from "@/lib/scorekeeper-list";

function Chip({ on, children, onClick }) {
  return (
    <button type="button" className={"sk-chip" + (on ? " is-on" : "")} onClick={onClick}>
      {children}
    </button>
  );
}

export default function ScorekeeperBoard({
  tournamentId,
  divisions = [],
} = {}) {
  const timeZone = useTimeZone();
  const catalog = useMemo(
    () => buildScorekeeperCatalog(divisions, timeZone),
    [divisions, timeZone]
  );

  const fields = useMemo(() => scorekeeperFieldOptions(catalog), [catalog]);
  const storageKey = fieldStorageKey(tournamentId);
  const [field, setField] = useState("all");
  const [fieldReady, setFieldReady] = useState(false);
  const [day, setDay] = useState(null);
  const [showScored, setShowScored] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setField(saved);
    } catch {
      /* private mode */
    }
    setFieldReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!fieldReady) return;
    if (field !== "all" && !fields.some((f) => f.key === field)) setField("all");
  }, [fieldReady, field, fields]);

  useEffect(() => {
    if (!fieldReady) return;
    try {
      localStorage.setItem(storageKey, field);
    } catch {
      /* private mode */
    }
  }, [field, storageKey, fieldReady]);

  const forField = useMemo(
    () => filterScorekeeperCatalog(catalog, { field, day: "all" }),
    [catalog, field]
  );
  const days = useMemo(() => scorekeeperDayOptions(forField), [forField]);
  useEffect(() => {
    if (day && day !== "all" && !days.some((d) => d.key === day)) setDay(null);
  }, [day, days]);
  const dayFilter = day ?? defaultDayKey(forField);
  const rows = useMemo(
    () => filterScorekeeperCatalog(forField, { field: "all", day: dayFilter }),
    [forField, dayFilter]
  );
  const scored = rows.filter((r) => r.scored);
  const open = rows.filter((r) => r.open);
  const list = open.length ? open : scored;

  const nextRef = useRef(null);
  useEffect(() => {
    if (!fieldReady) return;
    nextRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [field, dayFilter, fieldReady]);

  return (
    <div className="sk-board">
      <div className="sk-toolbar">
        {days.length > 1 && (
          <div className="sk-chips" role="listbox" aria-label="Day">
            <Chip on={dayFilter === "all"} onClick={() => setDay("all")}>
              All days
            </Chip>
            {days.map((d) => (
              <Chip key={d.key} on={dayFilter === d.key} onClick={() => setDay(d.key)}>
                {d.label}
              </Chip>
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <div className="sk-chips" role="listbox" aria-label="Field">
            <Chip on={field === "all"} onClick={() => setField("all")}>
              All fields
            </Chip>
            {fields.map((f) => (
              <Chip key={f.key} on={field === f.key} onClick={() => setField(f.key)}>
                {f.key}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {scored.length > 0 && open.length > 0 && (
        <div className="sk-scored">
          <button
            type="button"
            className="sk-scored__toggle"
            aria-expanded={showScored}
            onClick={() => setShowScored((v) => !v)}
          >
            <span aria-hidden="true">{showScored ? "▾" : "▸"}</span> Scored
          </button>
          {showScored
            ? scored.map((row) => <GameRow key={row.id} row={row} />)
            : null}
        </div>
      )}

      {list.length === 0 ? null : (
        <div className="sk-list">
          <div className="sk-head">
            <span>#</span>
            <span>When</span>
            <span>Field</span>
            <span>Team</span>
            <span>Score</span>
            <span>Team</span>
          </div>
          {list.map((row, i) => (
            <GameRow
              key={row.id}
              row={row}
              rowRef={open.length && i === 0 ? nextRef : undefined}
              isNext={Boolean(open.length && i === 0)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameRow({ row, rowRef, isNext = false }) {
  const router = useRouter();
  const won1 =
    row.scored &&
    row.game.team1_score != null &&
    row.game.team1_score > row.game.team2_score;
  const won2 =
    row.scored &&
    row.game.team2_score != null &&
    row.game.team2_score > row.game.team1_score;

  return (
    <div
      ref={rowRef}
      id={isNext ? "sk-next" : undefined}
      className={
        `sk-game tl-tone-${row.tone}` +
        (row.scored ? " is-scored" : "") +
        (isNext ? " is-next" : "")
      }
    >
      <div className="sk-game__meta">
        <span className="sk-game__num">{row.number}</span>
        <span className="sk-game__div">{row.divisionLabel}</span>
        <span className="sk-game__when">{row.whenLabel}</span>
        <span className="sk-game__field">{row.fieldName ?? "—"}</span>
      </div>
      <span className={"sk-game__team sk-game__team1" + (won1 ? " is-won" : "")}>
        {row.team1Label}
      </span>
      <div className="sk-game__score">
        <ScoreEntry
          game={row.game}
          kind={row.kind}
          team1Name={row.team1Label}
          team2Name={row.team2Label}
          onSaved={() => router.refresh()}
        />
      </div>
      <span className={"sk-game__team sk-game__team2" + (won2 ? " is-won" : "")}>
        {row.team2Label}
      </span>
    </div>
  );
}
