"use client";

import { createContext, useContext } from "react";

// Which team the reader is following, shared down to the drawing.
//
// The bracket is rendered on the SERVER — it has to be, it is the whole
// tournament — but the team is picked in the browser. A context is what
// lets the one reach the other without turning the drawing into a client
// component or cloning elements to inject a prop.
const HighlightTeamContext = createContext(null);

export function HighlightTeamProvider({ team, children }) {
  return <HighlightTeamContext.Provider value={team || null}>{children}</HighlightTeamContext.Provider>;
}

export function useHighlightTeam() {
  return useContext(HighlightTeamContext);
}

export default HighlightTeamContext;
