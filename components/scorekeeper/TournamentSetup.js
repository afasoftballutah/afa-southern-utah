"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { directorPost } from "./DirectorForm";

// How this tournament is split up. Sits at the top of the Divisions card,
// because it is what makes the rows underneath it.
//
// JD, 2026-07-27: "its not intuitive whats going on. They are not linked to
// the lower table (problem), not a slider pill so you cant know that one is an
// either or and one is a multi-select... Pool Play should be on a separate
// line, and the left align doesnt suggest hierarchy."
//
// So: the format is a SEGMENTED CONTROL — one track, one filled segment, which
// is how a screen says "pick one". The options under it are separate buttons
// that turn green, which is how a screen says "pick as many as you like". Pool
// play gets its own line above the format, because it happens first.

const GENDERS = [
  { key: "mens", label: "Men's" },
  { key: "womens", label: "Women's" },
  { key: "coed", label: "Coed" },
];

const MODES = [
  { key: "divisions", label: "Divisions", options: ["Open", "D", "E", "Rec"] },
  { key: "levels", label: "Levels", options: ["Upper", "Lower"] },
  { key: "brackets", label: "Brackets", options: ["Gold", "Silver", "Bronze"] },
];

export default function TournamentSetup({ tournamentId, initial }) {
  const [plan, setPlan] = useState(initial);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (gender, patch) =>
    setPlan((cur) => cur.map((g) => (g.gender === gender ? { ...g, ...patch } : g)));

  const togglePick = (gender, option) =>
    setPlan((cur) =>
      cur.map((g) =>
        g.gender === gender
          ? {
              ...g,
              picks: g.picks.includes(option)
                ? g.picks.filter((p) => p !== option)
                : [...g.picks, option],
            }
          : g
      )
    );

  const summary = plan
    .filter((g) => g.on)
    .flatMap((g) => {
      const label = GENDERS.find((x) => x.key === g.gender).label;
      if (g.mode === "brackets") return [label, ...g.picks.map((p) => `${label} ${p}`)];
      return g.picks.length ? g.picks.map((p) => `${label} ${p}`) : [label];
    });

  async function save() {
    setAsk(false);
    setBusy(true);
    setError("");
    const res = await directorPost({ action: "applyDivisionSetup", tournamentId, plan });
    if (res.error) return (setError(res.error), setBusy(false));
    if (res.refused?.length) {
      setError(`Kept ${res.refused.join(", ")} — teams are registered in them.`);
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="border-b border-afa-navy/10 pb-4 space-y-3">
      <div className="grid gap-6 sm:grid-cols-3">
        {GENDERS.map((gender) => {
          const g = plan.find((x) => x.gender === gender.key);
          const mode = MODES.find((m) => m.key === g.mode) ?? MODES[0];
          const bracketsPending = g.mode === "brackets" && !g.poolPlayDone;

          return (
            // Centred, so each gender reads as its own column rather than three
            // things stacked against the left edge.
            <div key={gender.key} className={"text-center space-y-2 " + (g.on ? "" : "opacity-45")}>
              <button
                type="button"
                onClick={() => set(gender.key, { on: !g.on })}
                className={"pill " + (g.on ? "bg-afa-go text-white border-afa-go" : "")}
              >
                {gender.label}
              </button>

              <div>
                <button
                  type="button"
                  disabled={!g.on}
                  onClick={() => set(gender.key, { poolPlay: !g.poolPlay })}
                  className={"pill " + (g.poolPlay && g.on ? "bg-afa-go text-white border-afa-go" : "")}
                >
                  Pool play
                </button>
              </div>

              {/* One track, one filled segment: pick one. */}
              <div className="seg seg-sm mx-auto">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!g.on}
                    onClick={() => set(gender.key, { mode: m.key, picks: [] })}
                    className={g.mode === m.key ? "is-on" : ""}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Separate buttons: pick as many as apply. */}
              <div className="flex flex-wrap justify-center gap-1">
                {mode.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={!g.on}
                    onClick={() => togglePick(gender.key, o)}
                    className={
                      "pill " +
                      (g.picks.includes(o)
                        ? bracketsPending
                          ? "bg-afa-part/15 border-afa-part text-afa-part"
                          : "bg-afa-go text-white border-afa-go"
                        : "")
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
              {bracketsPending && g.picks.length > 0 && (
                <p className="t-meta">Fills once pool play is over</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="pill" disabled={busy} onClick={() => setAsk(true)}>
          {busy ? "Saving…" : "Save setup"}
        </button>
        <span className="t-meta">{summary.length === 0 ? "Nothing selected" : summary.join(" · ")}</span>
      </div>
      {error && <p className="t-meta text-afa-red font-semibold text-center">{error}</p>}

      {ask && (
        <ConfirmDialog
          title="Save this setup"
          message={
            summary.length === 0
              ? "Nothing is selected, so every division without teams in it will be removed."
              : `Make these ${summary.length} divisions: ${summary.join(", ")}. Anything not listed is removed unless a team is registered in it.`
          }
          confirmLabel="Save setup"
          busy={busy}
          onConfirm={save}
          onCancel={() => setAsk(false)}
        />
      )}
    </div>
  );
}
