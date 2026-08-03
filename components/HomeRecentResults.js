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

/**
 * Recent Results on home.
 * Tournament control stays in the original top row (date · name).
 * Gender dropdown lives in the panel header — same place as before.
 *
 * @param {{ events: Array<{ id: string, slug: string, name: string, when: string, genderFinals: object }> }} props
 */
export default function HomeRecentResults({ events = [] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? null);

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

  const available = useMemo(
    () =>
      GENDER_TABS.filter((t) => (genderFinals?.[t.key] ?? []).length > 0),
    [genderFinals]
  );

  const [tab, setTab] = useState(available[0]?.key ?? null);

  useEffect(() => {
    const first = GENDER_TABS.find(
      (t) => (genderFinals?.[t.key] ?? []).length > 0
    );
    setTab(first?.key ?? null);
  }, [event?.id, genderFinals]);

  const activeKey =
    available.some((t) => t.key === tab) ? tab : available[0]?.key ?? null;
  const multiGender = available.length > 1;
  const multiTournament = events.length > 1;
  const finals = activeKey ? genderFinals?.[activeKey] ?? [] : [];
  const activeMeta = GENDER_TABS.find((t) => t.key === activeKey);

  return (
    <article className="home-dash__card home-dash__card--results">
      <h2>Recent Results</h2>

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
                    const count = (genderFinals?.[t.key] ?? []).length;
                    return (
                      <option key={t.key} value={t.key}>
                        {t.label} · {count} bracket{count === 1 ? "" : "s"}
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
                  <span className="home-results__solo-count">
                    {finals.length} bracket{finals.length === 1 ? "" : "s"}
                  </span>
                </>
              )
            )}
          </div>

          <div className="home-results__body" aria-label={activeMeta?.label}>
            {finals.length > 0 ? (
              <div className="home-results__stack">
                {finals.map((final) => (
                  <MatchupCard
                    key={final.key}
                    caption={final.caption}
                    division={final.divisionTint}
                    team1={final.team1}
                    team2={final.team2}
                    score1={final.score1}
                    score2={final.score2}
                    isFinal
                    className="home-results__matchup"
                  />
                ))}
              </div>
            ) : (
              <p className="home-results__empty">No finals posted yet.</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
