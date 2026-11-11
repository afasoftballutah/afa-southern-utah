"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTimeZone } from "@/components/TimeZoneContext";
import ScoreEntry from "./ScoreEntry";
import SegmentBar from "./SegmentBar";
import {
  buildScorekeeperCatalog,
  scorekeeperFieldOptions,
  scorekeeperDayOptions,
  scorekeeperFieldAbbrev,
  filterScorekeeperCatalog,
  defaultDayKey,
  fieldStorageKey,
} from "@/lib/scorekeeper-list";

export default function ScorekeeperBoard({
  tournamentId,
  storageScope,
  divisions = [],
} = {}) {
  const timeZone = useTimeZone();
  const catalog = useMemo(
    () => buildScorekeeperCatalog(divisions, timeZone),
    [divisions, timeZone]
  );

  const fields = useMemo(() => scorekeeperFieldOptions(catalog), [catalog]);
  const storageKey = fieldStorageKey(tournamentId, storageScope);
  const [field, setField] = useState("all");
  const [fieldReady, setFieldReady] = useState(false);
  const [day, setDay] = useState(null);
  const [showScored, setShowScored] = useState(false);
  const [activeId, setActiveId] = useState(null);

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
  const days = useMemo(() => scorekeeperDayOptions(catalog), [catalog]);
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
          <SegmentBar
            aria-label="Day"
            value={dayFilter}
            onChange={setDay}
            options={[
              { key: "all", label: "All" },
              ...days.map((d) => ({ key: d.key, label: d.label })),
            ]}
          />
        )}
        {fields.length > 0 && (
          <SegmentBar
            aria-label="Field"
            value={field}
            onChange={setField}
            options={[
              { key: "all", label: "All" },
              ...fields.map((f) => ({
                key: f.key,
                label: scorekeeperFieldAbbrev(f.key) ?? f.key,
              })),
            ]}
          />
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
            ? scored.map((row) => (
              <GameRow key={row.id} row={row} active={activeId === row.id} onActivate={setActiveId} />
            ))
            : null}
        </div>
      )}

      {list.length === 0 ? null : (
        <div className="sk-list">
          {list.map((row, i) => (
            <GameRow
              key={row.id}
              row={row}
              rowRef={open.length && i === 0 ? nextRef : undefined}
              isNext={Boolean(open.length && i === 0)}
              active={activeId === row.id}
              onActivate={setActiveId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameRow({ row, rowRef, isNext = false, active = false, onActivate }) {
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
      className={"sk-game" + (row.scored ? " is-scored" : "") + (isNext ? " is-next" : "") + (active ? " is-active" : "")}
    >
      <span className={`sk-mark tl-tone-${row.tone}`} title={row.divisionLabel} aria-label={gameLabel(row)}>
        <span className={"sk-mark__pill" + (row.toneInkDark ? " is-dark" : "")}>
          {row.divisionAbbrev ? <span className="sk-mark__div">{row.divisionAbbrev}</span> : null}
          {row.number != null && row.number !== "" ? (
            <span className="sk-mark__num">{row.divisionAbbrev ? " " : ""}{row.number}</span>
          ) : null}
        </span>
        <span className={"sk-mark__meta" + (row.whenMark?.hasMinutes ? " is-tight" : "")}>
          {row.whenMark ? (
            <>
              <span className="sk-mark__when">
                <span className="sk-mark__day">{row.whenMark.day}</span>
                <span className="sk-mark__clock">{row.whenMark.clock}</span>
              </span>
              {row.fieldAbbrev ? (
                <>
                  <span className="sk-mark__dot" aria-hidden="true">·</span>
                  <span className="sk-mark__field">{row.fieldAbbrev}</span>
                </>
              ) : null}
            </>
          ) : (
            row.fieldAbbrev ?? "—"
          )}
        </span>
      </span>
      <TeamName className={"sk-game__team sk-game__team1" + (won1 ? " is-won" : "")}>
        {row.team1Label}
      </TeamName>
      <div className="sk-game__score">
        <ScoreEntry
          game={row.game}
          kind={row.kind}
          team1Name={row.team1Label}
          team2Name={row.team2Label}
          active={active}
          onActivate={(id) => onActivate?.(id === null ? null : row.id)}
          onSaved={() => router.refresh()}
        />
      </div>
      <TeamName className={"sk-game__team sk-game__team2" + (won2 ? " is-won" : "")}>
        {row.team2Label}
      </TeamName>
    </div>
  );
}

const TEAM_FONT_STEPS = ["0.75rem", "0.6875rem", "0.625rem", "0.5625rem"];

function TeamName({ className, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    function fit() {
      el.style.fontSize = "";
      const words = String(children ?? "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      const styles = getComputedStyle(el);
      const available = el.clientWidth;
      const widthOf = (word, size) => {
        ctx.font = `${styles.fontStyle} ${styles.fontWeight} ${size} ${styles.fontFamily}`;
        return ctx.measureText(word).width;
      };
      for (const size of TEAM_FONT_STEPS) {
        if (words.every((w) => widthOf(w, size) <= available + 0.25)) {
          el.style.fontSize = size === TEAM_FONT_STEPS[0] ? "" : size;
          return;
        }
      }
      el.style.fontSize = TEAM_FONT_STEPS[TEAM_FONT_STEPS.length - 1];
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

function gameLabel(row) {
  const bits = [
    row.number != null ? `Game ${row.number}` : null,
    row.divisionLabel,
    row.markLine,
  ].filter(Boolean);
  return bits.join(", ");
}
