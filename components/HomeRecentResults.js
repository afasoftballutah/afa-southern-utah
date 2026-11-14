"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MatchupCard from "@/components/ui/MatchupCard";
import {
  cardsForResultPicker,
  defaultResultPickerValue,
  resultDivisionPickerOptions,
  shouldShowResultPicker,
} from "@/lib/home-result-picker";

const MODE_OPTIONS = [
  { key: "division", label: "By division" },
  { key: "games", label: "Recent games" },
];

const CAPTION_TINT = {
  Gold: "#c9a227",
  Silver: "#8b9bb0",
  Bronze: "#c47a4a",
};
const GROUND_TINT = {
  Gold: "#fbf6e6",
  Silver: "#f4f6f9",
  Bronze: "#f9f1eb",
};

function DivisionStandings({ final }) {
  const rows = final.standings ?? [];
  return (
    <div className="home-results__standings home-results__matchup">
      {final.caption ? (
        <p
          className="matchup-card__caption mb-1 truncate text-center text-[10.5px] font-semibold uppercase tracking-[.03em]"
          style={{
            color:
              CAPTION_TINT[final.divisionTint] ??
              "var(--matchup-caption, var(--afa-ink))",
          }}
        >
          {final.caption}
        </p>
      ) : null}
      <ol
        className="home-results__standings-card"
        style={{ background: GROUND_TINT[final.divisionTint] ?? "#fff" }}
      >
        {rows.map((row) => (
          <li
            key={`${row.place ?? "x"}-${row.team}`}
            className="home-results__standings-row"
          >
            <span className="home-results__standings-medal" aria-hidden="true">
              {row.medal ?? ""}
            </span>
            <span className="home-results__standings-place">
              {row.label ?? ""}
            </span>
            <span className="home-results__standings-team" title={row.team}>
              {row.team}
            </span>
            <span className="home-results__standings-record">
              {row.w}&ndash;{row.l}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Recent Results on home.
 * Tournament control stays in the original top row (date · name).
 * Division dropdown lives in the panel header (All Women's / Men's / Coed
 * plus each division, grouped by gender). Default is the same All-gender
 * view as before.
 * A client-side slider switches By division (headline result per
 * division) and Recent games (latest scored games, already in the
 * ISR payload).
 *
 * @param {{ events: Array<{ id: string, slug: string, name: string, when: string, genderFinals: object, recentGames?: object, recentGamesByDivision?: object }> }} props
 */
export default function HomeRecentResults({ events = [] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? null);
  const [mode, setMode] = useState("division");

  useEffect(() => {
    if (!events.some((e) => e.id === eventId)) {
      setEventId(events[0]?.id ?? null);
    }
  }, [events, eventId]);

  const event = useMemo(
    () => events.find((e) => e.id === eventId) ?? events[0] ?? null,
    [events, eventId]
  );

  const genderFinals = event?.genderFinals ?? null;
  const recentGames = event?.recentGames ?? null;
  const recentGamesByDivision = event?.recentGamesByDivision ?? null;

  const pickerGroups = useMemo(
    () => resultDivisionPickerOptions(genderFinals, recentGames),
    [genderFinals, recentGames]
  );
  const showPicker = shouldShowResultPicker(pickerGroups);
  const defaultPicker = defaultResultPickerValue(pickerGroups);

  const [picker, setPicker] = useState(defaultPicker);

  useEffect(() => {
    setPicker(defaultResultPickerValue(pickerGroups));
  }, [event?.id, pickerGroups]);

  const pickerValues = useMemo(() => {
    const values = new Set();
    for (const g of pickerGroups) {
      values.add(g.allValue);
      for (const d of g.divisions) values.add(d.value);
    }
    return values;
  }, [pickerGroups]);

  const activePicker = pickerValues.has(picker) ? picker : defaultPicker;
  const multiTournament = events.length > 1;
  const cards = cardsForResultPicker({
    mode,
    picker: activePicker,
    genderFinals,
    recentGames,
    recentGamesByDivision,
  });
  const activeGroup = pickerGroups.find(
    (g) =>
      g.allValue === activePicker ||
      g.divisions.some((d) => d.value === activePicker)
  );
  const activeDivision = activeGroup?.divisions.find((d) => d.value === activePicker);
  const bodyLabel = activeDivision?.label ?? activeGroup?.label;
  const soloLabel = activeDivision?.label ?? activeGroup?.label;
  const countLabel =
    mode === "games"
      ? `${cards.length} game${cards.length === 1 ? "" : "s"}`
      : `${cards.length} bracket${cards.length === 1 ? "" : "s"}`;

  return (
    <article className="home-dash__card home-dash__card--results">
      <h2>Recent Results</h2>

      {events.length > 0 && (
        <div className="home-results__mode" role="radiogroup" aria-label="Results view">
          <span
            className={
              "home-results__mode-thumb" + (mode === "games" ? " is-games" : "")
            }
            aria-hidden="true"
          />
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={mode === opt.key}
              className={
                "home-results__mode-btn" + (mode === opt.key ? " is-on" : "")
              }
              onClick={() => setMode(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Original placement: date · name row above the glass panel */}
      {event && (
        <div className="home-events home-events--results-tour">
          {multiTournament ? (
            <div className="home-results__tour-select-wrap">
              <select
                className="home-results__tour-select"
                aria-label="Tournament"
                value={event.id}
                onChange={(e) => setEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.when ? `${ev.when} · ${ev.name}` : ev.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Link
              href={`/tournaments/${event.slug}`}
              className="home-event home-event--date-name"
            >
              <span className="home-event__when">{event.when}</span>
              <span className="home-event__name">{event.name}</span>
            </Link>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <p className="home-results__empty">No finals posted yet.</p>
      ) : (
        <div className="home-results__panel">
          {/* Division picker — same panel-header slot as the old gender select */}
          <div className="home-results__select-row">
            {showPicker ? (
              <div className="home-results__select-wrap">
                <select
                  className="home-results__select"
                  aria-label="Division"
                  value={activePicker ?? ""}
                  onChange={(e) => setPicker(e.target.value)}
                >
                  {pickerGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      <option value={group.allValue}>{group.allLabel}</option>
                      {group.divisions.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : (
              soloLabel && (
                <>
                  <span className="home-results__solo-label-text">
                    {soloLabel}
                  </span>
                  <span className="home-results__solo-count">{countLabel}</span>
                </>
              )
            )}
          </div>

          <div className="home-results__body" aria-label={bodyLabel}>
            {cards.length > 0 ? (
              <div className="home-results__stack">
                {cards.map((final) =>
                  mode === "division" && final.standings?.length ? (
                    <DivisionStandings key={final.key} final={final} />
                  ) : (
                    <MatchupCard
                      key={final.key}
                      caption={final.caption}
                      division={final.divisionTint}
                      team1={final.team1}
                      team2={final.team2}
                      score1={final.score1}
                      score2={final.score2}
                      isFinal
                      championship={Boolean(final.championship)}
                      className="home-results__matchup"
                    />
                  )
                )}
              </div>
            ) : (
              <p className="home-results__empty">
                {mode === "games"
                  ? "No recent games posted yet."
                  : "No finals posted yet."}
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
