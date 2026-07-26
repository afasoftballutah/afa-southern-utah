"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";

// The door into a team's own tournament, and — once they have picked one
// — a line about where they are (JD, 2026-07-26: "Team Name, Pool or
// Bracket depending on stage, Next Game or Final Result").
//
// The pick is the same one the division page remembers, under the same
// per-tournament key, so choosing your team in either place is choosing
// it in both.

const TIER = {
  Gold: "bg-[#f7edcd] text-[#7a5c12]",
  Silver: "bg-[#dbe3ee] text-[#3b4a60]",
  Bronze: "bg-[#f3e2d6] text-[#7b4a28]",
};

function whenLabel(iso, tz) {
  if (!iso) return "time to come";
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return `${get("weekday")} ${get("hour")}${min !== "00" ? ":" + min : ""} ${get("dayPeriod")}`;
}

export default function MyTeamCard({ slug, summaries = {}, fallbackHref, timeZone }) {
  const [team, setTeam] = useState("");
  useEffect(() => {
    try {
      const t = window.localStorage.getItem(`afa-team-${slug}`);
      if (t && summaries[t]) setTeam(t);
    } catch {
      // private browsing — the card just stays unset
    }
  }, [slug, summaries]);

  function pick(value) {
    setTeam(value);
    try {
      if (value) window.localStorage.setItem(`afa-team-${slug}`, value);
      else window.localStorage.removeItem(`afa-team-${slug}`);
    } catch {
      // still works for this visit, it just will not be remembered
    }
  }

  const teams = Object.keys(summaries).sort((a, b) => a.localeCompare(b));
  const me = team ? summaries[team] : null;
  const href = me?.next?.divisionId
    ? `/tournaments/${slug}/division/${me.next.divisionId}${
        me.next.pool ? `?pool=${encodeURIComponent(me.next.pool)}&pg=${me.next.id}` : `?game=${me.next.round}`
      }`
    : me?.divisionId
      ? `/tournaments/${slug}/division/${me.divisionId}`
      : fallbackHref;

  return (
    <Card className="relative hover:shadow-[0_1px_2px_rgba(22,35,61,.06),0_14px_30px_-16px_rgba(22,35,61,.55)]">
      {/* Once a team is set the whole card is the way through — every part
          of it EXCEPT the dropdown (JD, 2026-07-26). The link is a layer
          underneath; the content above it does not take clicks, and the
          picker is the one thing that takes them back. */}
      {me && (
        <Link
          href={href}
          aria-label={`${me.team} — schedule and tournament updates`}
          className="absolute inset-0 z-0 rounded-lg"
        />
      )}
      <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* The title IS the picker — the same control the division page
            uses, so setting your team in either place sets it in both. The
            card cannot be one big link any more or tapping the title would
            navigate instead of opening it; the summary on the right is the
            door through. */}
        <div className="min-w-0 flex-1">
          <span className="pointer-events-auto relative inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded focus-within:ring-2 focus-within:ring-afa-navy/30">
            <span className="truncate font-display text-lg text-afa-navy">
              {me ? me.team : "My Team"}
            </span>
            {/* Same line as the division page's header — name, record,
                caret — so a team reads identically in both places (JD,
                2026-07-26). */}
            {me && me.w + me.l > 0 && (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-afa-ink/45">
                ({me.w}&ndash;{me.l})
              </span>
            )}
            <span aria-hidden="true" className="shrink-0 text-sm text-afa-navy/50">
              ▾
            </span>
            <select
              aria-label="Pick your team"
              value={team}
              onChange={(e) => pick(e.target.value)}
              // A <select> has a minimum intrinsic height — 44px against this
              // span's 28 — so without appearance-none it spilled 16px below
              // and swallowed clicks meant for the line underneath.
              className="absolute inset-0 h-full min-h-0 w-full cursor-pointer appearance-none border-0 p-0 opacity-0"
            >
              <option value="">Find your team</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </span>
          <p className="text-xs text-afa-ink/60 mt-0.5">
            {me ? "Schedule and tournament updates" : "Tap to pick your team"}
          </p>
        </div>

        {me && (
          <div className="flex min-h-11 items-center gap-3">
            {me.stage && (
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                  TIER[me.stage] ?? "bg-afa-navy/[0.07] text-afa-ink/60"
                }`}
              >
                {me.stage}
              </span>
            )}
            {/* Their next game, or — once there is no next game — where
                they finished. One of the two is always the answer. */}
            <span className="text-right text-sm">
              {me.next ? (
                <>
                  <span className="block font-semibold text-afa-ink">
                    {me.next.opponent ? `vs ${me.next.opponent}` : me.next.label}
                  </span>
                  <span className="block text-xs text-afa-muted">
                    {whenLabel(me.next.scheduledTime, timeZone)}
                    {me.next.field ? ` · ${String(me.next.field).replace(/^Field\s*/i, "F")}` : ""}
                  </span>
                </>
              ) : me.result ? (
                <>
                  <span className="block font-semibold text-afa-ink">
                    {me.result.state === "champion"
                      ? "Champion"
                      : me.result.placement
                        ? `Finished ${me.result.placement}`
                        : "Done"}
                  </span>

                </>
              ) : (
                <span className="block text-xs text-afa-muted">No games scheduled</span>
              )}
            </span>
            <span aria-hidden="true" className="text-afa-navy/50">
              &rarr;
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
