"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Idiot-proof tournament picker for scorekeeper.
 * Default: only tournaments that still need scores.
 */
export default function TournamentPickList({ tournaments = [] }) {
  const needScores = useMemo(
    () => tournaments.filter((t) => t.left > 0),
    [tournaments]
  );
  const done = useMemo(
    () => tournaments.filter((t) => !(t.left > 0)),
    [tournaments]
  );

  // Default to the useful list; fall back if nothing needs scoring
  const [view, setView] = useState(() =>
    needScores.length > 0 ? "need" : "all"
  );

  const list =
    view === "need" ? needScores : view === "done" ? done : tournaments;

  const tabs = [
    {
      key: "need",
      label: "Need scores",
      count: needScores.length,
      hint: "Games left to enter",
      tone: "action",
    },
    {
      key: "all",
      label: "All tournaments",
      count: tournaments.length,
      hint: "Everything on file",
      tone: "neutral",
    },
    {
      key: "done",
      label: "Already scored",
      count: done.length,
      hint: "Nothing left open",
      tone: "quiet",
    },
  ];

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        role="tablist"
        aria-label="Which tournaments to show"
      >
        {tabs.map((tab) => {
          const on = view === tab.key;
          const base =
            "rounded-xl border-2 px-3 py-3 text-left transition-colors min-h-[4.5rem] ";
          const styles = on
            ? tab.tone === "action"
              ? "border-afa-red bg-afa-red text-white shadow-sm"
              : tab.tone === "quiet"
                ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                : "border-afa-navy bg-afa-navy text-white shadow-sm"
            : tab.tone === "action"
              ? "border-red-200 bg-red-50 text-red-950 hover:border-afa-red"
              : tab.tone === "quiet"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-500"
                : "border-afa-navy/15 bg-white text-afa-navy hover:border-afa-navy/40";
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(tab.key)}
              className={base + styles}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-base leading-tight">{tab.label}</span>
                <span
                  className={
                    "tabular-nums text-xl font-black leading-none " +
                    (on ? "opacity-95" : "opacity-70")
                  }
                >
                  {tab.count}
                </span>
              </span>
              <span
                className={
                  "block text-xs mt-1 font-medium " +
                  (on ? "opacity-85" : "opacity-65")
                }
              >
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card divide-y divide-afa-navy/10 overflow-hidden">
        {list.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="t-strong">
              {view === "need"
                ? "Nothing left to score"
                : view === "done"
                  ? "No fully scored tournaments yet"
                  : "No tournaments on file"}
            </p>
            <p className="t-meta">
              {view === "need" && tournaments.length > 0
                ? "Tap “All tournaments” if you need to fix a score that is already in."
                : null}
            </p>
          </div>
        ) : (
          list.map((t) => (
            <Link
              key={t.id}
              href={`/scorekeeper/games?tournament=${t.id}`}
              className={
                "flex items-center justify-between gap-3 px-4 py-3.5 min-h-[56px] " +
                (t.left > 0
                  ? "bg-white hover:bg-red-50/40"
                  : "bg-afa-soft-gray/40 hover:bg-afa-soft-gray/80")
              }
            >
              <span className="min-w-0">
                <span className="t-body font-semibold block truncate">
                  {t.name}
                </span>
                <span className="t-meta block">
                  {t.start_date}
                  {t.left > 0
                    ? ` · ${t.left} game${t.left === 1 ? "" : "s"} still need a score`
                    : " · all scored (or no games)"}
                </span>
              </span>
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " +
                  (t.left > 0
                    ? "bg-afa-red text-white"
                    : "bg-emerald-100 text-emerald-900")
                }
              >
                {t.left > 0 ? "Score →" : "Open"}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
