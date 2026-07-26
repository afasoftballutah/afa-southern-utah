"use client";

import { createContext, useContext } from "react";

// Who owns the "show loser paths" switch.
//
// DrawnBracket keeps its own by default — the scorekeeper's editor
// renders it on its own and needs one. But on the public page the switch
// belongs in the same row as the Pool play / Bracket toggle and the
// bracket chips, and a control cannot be in two places at once. When a
// page provides this, the drawing reads the value and stops rendering a
// button of its own.
const DropsContext = createContext(null);

export function DropsProvider({ value, children }) {
  return <DropsContext.Provider value={value}>{children}</DropsContext.Provider>;
}

export function useDrops() {
  return useContext(DropsContext);
}
