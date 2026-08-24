"use client";

import { useMemo, useState } from "react";
import DrawnBracket from "@/components/bracket/DrawnBracket";
import { drawnGamesFrom3GG } from "@/lib/bracket/for-drawn-bracket";
import { generate3GG } from "@/lib/bracket/three-game-guarantee";

const SEEDS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
];

/**
 * 9-team 3GG mockup: generate3GG() → DrawnBracket (Heat Stroker language).
 */
export default function ThreeGg9MockupPage() {
  const [reentry, setReentry] = useState("reference");

  const games = useMemo(
    () => drawnGamesFrom3GG(SEEDS, { reentry }),
    [reentry]
  );

  const raw = useMemo(() => generate3GG(SEEDS.length, { reentry }), [reentry]);

  return (
    <div className="min-h-screen bg-[var(--afa-cream,#f7f4ee)]">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[.08em] text-afa-navy/60 mb-1">
          Mockup · DrawnBracket (same as Heat Stroker)
        </p>
        <h1 className="font-display text-2xl text-afa-navy mb-1">9-team 3GG</h1>
        <p className="text-sm text-afa-ink/70 mb-4 max-w-2xl">
          PrintYourBrackets 9-team seeded 3GG via{" "}
          <code className="text-afa-navy">generate3GG(9)</code>, rendered with the
          site’s <code className="text-afa-navy">DrawnBracket</code> (paper G#, Winner/Loser of Game
          N). Compare to{" "}
          <a
            className="underline font-semibold text-afa-navy"
            href="/tournaments/2026-coed-heat-stroker/division/00e80340-8db4-4149-bb8f-c77cb1e6e425"
          >
            Heat Stroker Gold
          </a>
          .
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-afa-navy">
            reentry{" "}
            <select
              className="ml-1 rounded border border-afa-navy/30 bg-white px-2 py-1"
              value={reentry}
              onChange={(e) => setReentry(e.target.value)}
            >
              <option value="reference">reference (default)</option>
              <option value="strict">strict</option>
            </select>
          </label>
          <span className="text-xs text-afa-ink/60">
            {raw.games.length} games · bracket size {raw.meta.bracketSize} · unsettled{" "}
            {raw.meta.unsettled}
          </span>
        </div>

        <DrawnBracket games={games} division="Gold" />

        <details className="mt-8 card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-afa-navy">
            Raw generate3GG list
          </summary>
          <ol className="mt-3 space-y-1 text-sm font-mono text-afa-ink/80">
            {raw.games.map((g) => {
              const fmt = (r) =>
                r.seed !== undefined ? `seed${r.seed}` : r.W !== undefined ? `W${r.W}` : `L${r.L}`;
              return (
                <li key={g.id}>
                  G{g.id} [{g.bracket} R{g.round}] {fmt(g.a)} vs {fmt(g.b)}
                </li>
              );
            })}
          </ol>
        </details>
      </div>
    </div>
  );
}
