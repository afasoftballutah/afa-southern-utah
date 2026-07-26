"use client";

import { createContext, useContext } from "react";

// A game to open ON, arriving from somewhere else.
//
// Clicking a result on the home page should land you at that game, not at
// the top of a bracket with forty others. The page reads it off the URL;
// the drawing is server-rendered, so a context is what carries it the last
// step — the same shape as the followed team and the loser-paths switch.
const FocusRoundContext = createContext(null);

export function FocusRoundProvider({ round, children }) {
  return <FocusRoundContext.Provider value={round ?? null}>{children}</FocusRoundContext.Provider>;
}

export function useFocusRound() {
  return useContext(FocusRoundContext);
}
