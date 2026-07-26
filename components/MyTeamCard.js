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
      // private browsing — the card just stays generic
    }
  }, [slug, summaries]);

  const me = team ? summaries[team] : null;
  const href = me?.next?.divisionId
    ? `/tournaments/${slug}/division/${me.next.divisionId}${
        me.next.pool ? `?pool=${encodeURIComponent(me.next.pool)}&pg=${me.next.id}` : `?game=${me.next.round}`
      }`
    : me?.divisionId
      ? `/tournaments/${slug}/division/${me.divisionId}`
      : fallbackHref;

  return (
    <Card className="hover:border-afa-navy/50">
      <Link href={href} className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-11">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-afa-navy">{me ? me.team : "My Team"}</p>
          <p className="text-xs text-afa-ink/60 mt-0.5">
            {me ? "Tap for the full picture" : "Schedule and tournament updates"}
          </p>
        </div>

        {me && (
          <div className="flex items-center gap-3">
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
            <div className="text-right text-sm">
              {me.next ? (
                <>
                  <p className="font-semibold text-afa-ink">
                    {me.next.opponent ? `vs ${me.next.opponent}` : me.next.label}
                  </p>
                  <p className="text-xs text-afa-muted">
                    {whenLabel(me.next.scheduledTime, timeZone)}
                    {me.next.field ? ` · ${String(me.next.field).replace(/^Field\s*/i, "F")}` : ""}
                  </p>
                </>
              ) : me.result ? (
                <>
                  <p className="font-semibold text-afa-ink">
                    {me.result.state === "champion"
                      ? "Champion"
                      : me.result.placement
                        ? `Finished ${me.result.placement}`
                        : "Done"}
                  </p>
                  <p className="text-xs text-afa-muted">{me.played} games played</p>
                </>
              ) : (
                <p className="text-xs text-afa-muted">No games scheduled</p>
              )}
            </div>
          </div>
        )}
      </Link>
    </Card>
  );
}
