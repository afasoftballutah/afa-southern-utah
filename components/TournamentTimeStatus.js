"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import { isRegistrationOpen, resolveIsPast } from "@/lib/tournament-state";

function datesOf(tournament) {
  if (!tournament) return null;
  return {
    start_date: tournament.start_date,
    end_date: tournament.end_date,
    timezone: tournament.timezone,
    status: tournament.status,
    registration_closes: tournament.registration_closes,
    is_placeholder: tournament.is_placeholder,
    finished: tournament.finished,
  };
}

/**
 * Completed chip next to the title. Initial state matches the ISR HTML
 * (generate-time). After mount the clock can turn a live event into
 * Completed; it can never turn a past event back into an upcoming one.
 */
export function TournamentCompletedBadge({ tournament, finished = false, initialIsPast = false }) {
  const [isPast, setIsPast] = useState(() =>
    Boolean(finished || initialIsPast)
  );
  useEffect(() => {
    setIsPast(resolveIsPast(datesOf(tournament), { finished, initialIsPast, now: new Date() }));
  }, [tournament, finished, initialIsPast]);
  if (!isPast) return null;
  return <Chip variant="muted">Completed</Chip>;
}

/**
 * No-poster lobby: "Completed" vs "Details coming soon". Same latch: a
 * past tournament is never shown as future. Markup matches the previous
 * server-rendered stubs exactly.
 */
export function TournamentLaunchState({
  tournament,
  dateRange,
  initialIsPast = false,
  finished = false,
}) {
  const [isPast, setIsPast] = useState(() => Boolean(finished || initialIsPast));
  useEffect(() => {
    setIsPast(resolveIsPast(datesOf(tournament), { finished, initialIsPast, now: new Date() }));
  }, [tournament, finished, initialIsPast]);

  const when = (
    <p className="t-meta">
      {dateRange}
      {tournament.venue_name ? ` · ${tournament.venue_name}` : ""}
    </p>
  );

  if (isPast) {
    return (
      <div className="form-surface p-6 text-center space-y-3 max-w-lg mx-auto">
        <h1 className="t-title">{tournament.name}</h1>
        {when}
        <p className="t-strong">Completed</p>
        <p className="t-meta">This tournament has been played.</p>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Link href="/tournaments" className="btn-transient">
            All tournaments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="form-surface p-6 text-center space-y-3 max-w-lg mx-auto">
      <h1 className="t-title">{tournament.name}</h1>
      {when}
      <p className="t-strong">Details coming soon</p>
      <p className="t-meta">
        This tournament is on the calendar. The full page and registration
        open when the flyer is posted.
      </p>
      <div className="flex flex-wrap gap-2 justify-center pt-2">
        <Link href="/tournaments" className="btn-transient">
          All tournaments
        </Link>
        <span
          className="btn-action opacity-40 pointer-events-none select-none"
          aria-disabled="true"
          title="Registration opens when the tournament flyer is posted"
        >
          Register
        </span>
      </div>
    </div>
  );
}

export function useRegistrationOpen({
  tournament,
  hasPoster = true,
  initialOpen = false,
}) {
  const [open, setOpen] = useState(Boolean(initialOpen));
  useEffect(() => {
    setOpen(Boolean(hasPoster && isRegistrationOpen(datesOf(tournament), new Date())));
  }, [tournament, hasPoster, initialOpen]);
  return open;
}
