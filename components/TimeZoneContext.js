"use client";

// The tournament's time zone for client components below a page (bracket,
// scorekeeper editors). Pages wrap their content in <TimeZoneProvider
// timeZone={tournamentTimeZone(tournament)}>. Without a provider it is
// league time — every existing screen renders exactly as before.

import { createContext, useContext } from "react";
import { LEAGUE_TZ, resolveTimeZone } from "@/lib/zone";

const TimeZoneContext = createContext(LEAGUE_TZ);

export function TimeZoneProvider({ timeZone, children }) {
  return (
    <TimeZoneContext.Provider value={resolveTimeZone(timeZone)}>{children}</TimeZoneContext.Provider>
  );
}

export function useTimeZone() {
  return useContext(TimeZoneContext);
}
