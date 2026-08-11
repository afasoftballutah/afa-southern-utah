"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Compact tournament picker. Default: only events that still need scores.
 * Huge filter cards were drowning the actual work (pick tournament → type scores).
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

  const [view, setView] = useState(() =>
    needScores.length > 0 ? "need" : "all"
  );

  const list =
    view === "need" ? needScores : view === "done" ? done : tournaments;

  const tabs = [
    { key: "need", label: "Need scores", count: needScores.length },
    { key: "all", label: "All", count: tournaments.length },
    { key: "done", label: "Done", count: done.length },
  ];

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Which tournaments to show"
      >
        {tabs.map((tab) => {
          const on = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(tab.key)}
              className={
                "rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums " +
                (on
                  ? tab.key === "need"
                    ? "border-afa-red bg-afa-red text-white"
                    : "border-afa-navy bg-afa-navy text-white"
                  : "border-afa-navy/20 bg-white text-afa-navy/70 hover:border-afa-navy/40")
              }
            >
              {tab.label}
              <span className="ml-1 opacity-80">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="card divide-y divide-afa-navy/10 overflow-hidden">
        {list.length === 0 ? (
          <div className="p-5 text-center space-y-1">
            <p className="t-strong text-sm">
              {view === "need"
                ? "Nothing left to score"
                : view === "done"
                  ? "No fully scored tournaments yet"
                  : "No tournaments on file"}
            </p>
            {view === "need" && tournaments.length > 0 ? (
              <p className="t-meta text-[12px]">
                Switch to All if you need to fix a score already in.
              </p>
            ) : null}
          </div>
        ) : (
          list.map((t) => (
            <Link
              key={t.id}
              href={`/scorekeeper/games?tournament=${t.id}`}
              className={
                "flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-0 " +
                (t.left > 0
                  ? "bg-white hover:bg-red-50/50"
                  : "bg-afa-soft-gray/30 hover:bg-afa-soft-gray/60")
              }
            >
              <span className="min-w-0">
                <span className="t-body font-semibold text-[14px] block truncate">
                  {t.name}
                </span>
                <span className="t-meta text-[12px] block">
                  {t.start_date}
                  {t.left > 0
                    ? ` · ${t.left} open`
                    : " · all scored"}
                </span>
              </span>
              <span
                className={
                  "shrink-0 text-[12px] font-bold " +
                  (t.left > 0 ? "text-afa-red" : "text-afa-muted")
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
