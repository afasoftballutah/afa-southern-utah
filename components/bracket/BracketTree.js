"use client";

import { useState, useSyncExternalStore } from "react";
import { gamesForGroup } from "@/lib/bracket/tree";
import TreeCanvas from "./TreeCanvas";
import ListView from "./ListView";

const STORAGE_KEY = "afa-bracket-view";
const MQ = "(min-width: 768px)";

// isDesktop is read from window.matchMedia via useSyncExternalStore — React's
// own mechanism for external, possibly-SSR-mismatched browser state. It
// renders the server-safe guess during hydration, then corrects itself as
// soon as the real value is available, with no manual mount-effect/setState
// dance (and no react-hooks/set-state-in-effect violation from one).
function subscribeDesktop(callback) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getIsDesktop() {
  return window.matchMedia(MQ).matches;
}
function getIsDesktopServer() {
  return false; // list-view/mobile-tree default until the client corrects it
}

// Same treatment for the persisted tab choice — reading localStorage
// directly during render would be a hydration mismatch exactly like
// window.matchMedia above. 'storage' only fires for OTHER tabs writing the
// same key, which is fine here: this component also feeds explicit
// same-tab choices through setExplicitView below, not through this store.
function subscribeStorage(callback) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getStoredView() {
  return window.localStorage.getItem(STORAGE_KEY);
}
function getStoredViewServer() {
  return null;
}

/**
 * READ-ONLY. Public tournament/division page toggle between the drawn
 * bracket tree and the grouped list. No writes, no new tables — reads the
 * same `games`/`brackets` rows the scorekeeper's BracketManager already
 * fetches over the public anon client, and never touches that component
 * or its interactive state.
 *
 * Default view: tree on screens >=768px, list below that — remembered per
 * session via localStorage once the visitor picks either tab explicitly.
 * Print always shows the tree (see globals.css print rules), regardless
 * of which tab is active on screen.
 *
 * Sizing contract (Lacy's 7/21 ruling, REPLACES the earlier "whole tree,
 * no scroll" desktop behavior — that scale-to-fit transform was the
 * marooning bug, twice): fixed-size cells at every viewport width, desktop
 * included. Horizontal scroll if the tree is wider than the container —
 * desktop and phone alike, the standard everywhere brackets are drawn.
 * `fit={!isMobile}` still tells TreeCanvas to render an ADDITIONAL
 * print-only scaled-to-page variant for desktop-context divisions (sizing
 * contract's one exception); it no longer changes what's shown on screen.
 */
export default function BracketTree({ division }) {
  const mainGames = gamesForGroup(division.games ?? [], "main");
  const consolationGames = gamesForGroup(division.games ?? [], "consolation");

  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, getIsDesktopServer);
  const isMobile = !isDesktop;

  // In-session explicit tab choice overrides the stored/default guess.
  // Reading localStorage happens lazily in useState's initializer, which
  // only runs once and is fine to be client/server-divergent here because
  // the actual visible default merges with `isDesktop` below anyway (a
  // `null` explicit choice never gets rendered as-is).
  const [explicitView, setExplicitView] = useState(null);
  const storedView = useSyncExternalStore(subscribeStorage, getStoredView, getStoredViewServer);
  const view = explicitView ?? (storedView === "bracket" || storedView === "list" ? storedView : isDesktop ? "bracket" : "list");

  function choose(next) {
    setExplicitView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }

  if (mainGames.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 text-sm mb-3 print:hidden">
        <button
          type="button"
          onClick={() => choose("bracket")}
          className={`font-semibold ${view === "bracket" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          Bracket
        </button>
        <span className="text-afa-ink/30">|</span>
        <button
          type="button"
          onClick={() => choose("list")}
          className={`font-semibold ${view === "list" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          List
        </button>
      </div>

      {/* Tree — visible when selected, and always in print regardless of the toggle. */}
      <div className={`${view === "bracket" ? "block" : "hidden"} print:block`}>
        <TreeCanvas games={mainGames} scale={1} isMobile={isMobile} showRoundStrip={isMobile} fit={!isMobile} />
        {consolationGames.length > 0 && (
          <div className="mt-10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-afa-muted mb-2">Consolation</p>
            <TreeCanvas games={consolationGames} scale={0.82} isMobile={isMobile} showRoundStrip={false} fit={!isMobile} />
          </div>
        )}
      </div>

      {/* List — visible when selected, never in print. */}
      <div className={`${view === "list" ? "block" : "hidden"} print:hidden`}>
        <ListView games={mainGames} />
        {consolationGames.length > 0 && (
          <div className="mt-6">
            <div className="chalk-line" />
            <p className="text-xs font-semibold text-afa-navy/60 mb-2 mt-4">Consolation Bracket</p>
            <ListView games={consolationGames} />
          </div>
        )}
      </div>
    </div>
  );
}
