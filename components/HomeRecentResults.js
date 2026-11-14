"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MatchupCard from "@/components/ui/MatchupCard";

/** Gender options — same order as before (W / M / Coed). */
const GENDER_TABS = [
  { key: "womens", short: "W", label: "Women's" },
  { key: "mens", short: "M", label: "Men's" },
  { key: "coed", short: "Coed", label: "Coed" },
];

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
 * Gender dropdown lives in the panel header — same place as before.
 * A client-side slider switches By division (headline result per
 * division) and Recent games (latest scored games, already in the
 * ISR payload).
 *
 * @param {{ events: Array<{ id: string, slug: string, name: string, when: string, genderFinals: object, recentGames?: object }> }} props
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

  const available = useMemo(() => {
    return GENDER_TABS.filter((t) => {
      const finals = (genderFinals?.[t.key] ?? []).length;
      const games = (recentGames?.[t.key] ?? []).length;
      return finals > 0 || games > 0;
    });
  }, [genderFinals, recentGames]);

  const [tab, setTab] = useState(available[0]?.key ?? null);

  useEffect(() => {
    const first = GENDER_TABS.find((t) => {
      const finals = (genderFinals?.[t.key] ?? []).length;
      const games = (recentGames?.[t.key] ?? []).length;
      return finals > 0 || games > 0;
    });
    setTab(first?.key ?? null);
  }, [event?.id, genderFinals, recentGames]);

  const activeKey =
    available.some((t) => t.key === tab) ? tab : available[0]?.key ?? null;
  const multiGender = available.length > 1;
  const multiTournament = events.length > 1;
  const divisionCards = activeKey ? genderFinals?.[activeKey] ?? [] : [];
  const gameCards = activeKey ? recentGames?.[activeKey] ?? [] : [];
  const cards = mode === "games" ? gameCards : divisionCards;
  const activeMeta = GENDER_TABS.find((t) => t.key === activeKey);
  const countLabel =
    mode === "games"
      ? `${gameCards.length} game${gameCards.length === 1 ? "" : "s"}`
      : `${divisionCards.length} bracket${divisionCards.length === 1 ? "" : "s"}`;

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
          {/* Gender — same panel-header slot as before */}
          <div className="home-results__select-row">
            {multiGender ? (
              <div className="home-results__select-wrap">
                <select
                  className="home-results__select"
                  aria-label="Gender"
                  value={activeKey ?? ""}
                  onChange={(e) => setTab(e.target.value)}
                >
                  {available.map((t) => {
                    const count =
                      mode === "games"
                        ? (recentGames?.[t.key] ?? []).length
                        : (genderFinals?.[t.key] ?? []).length;
                    const unit =
                      mode === "games"
                        ? count === 1
                          ? "game"
                          : "games"
                        : count === 1
                          ? "bracket"
                          : "brackets";
                    return (
                      <option key={t.key} value={t.key}>
                        {t.label} · {count} {unit}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              activeMeta && (
                <>
                  <span className="home-results__solo-label-text">
                    {activeMeta.label}
                  </span>
                  <span className="home-results__solo-count">{countLabel}</span>
                </>
              )
            )}
          </div>

          <div className="home-results__body" aria-label={activeMeta?.label}>
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
