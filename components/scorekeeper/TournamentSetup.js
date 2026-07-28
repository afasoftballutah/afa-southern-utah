"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { directorPost } from "./DirectorForm";

// How this tournament is split up, one column per gender.
//
// JD, 2026-07-27: "a bar split into thirds, checkbox for the M/W/Coed and
// slider between divisions... Levels... or Brackets", "mens coed and womens
// can all run different formats", "need a confirm at the end", "there should
// be a 'pool play' checkbox for each gender section first. Those rows only
// come up once pool play is over. Maybe to make it easier they come up grayed
// out initially", "Might be better if instead of checks it had buttons that
// turn green."
//
// Nothing is written until Save, and the confirm names what will be created.

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

// A button that turns green when it is on — the same green as every other
// "done" mark in the tool.
function Toggle({ on, disabled, onClick, children, title }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={
        "pill " +
        (disabled
          ? "opacity-40 cursor-not-allowed"
          : on
            ? "bg-afa-go text-white border-afa-go"
            : "")
      }
    >
      {children}
    </button>
  );
}

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

  // What Save will actually make, in the words of the rows it produces.
  const summary = plan
    .filter((g) => g.on)
    .flatMap((g) => {
      const label = GENDERS.find((x) => x.key === g.gender).label;
      if (g.mode === "brackets") {
        return [label, ...g.picks.map((p) => `${label} ${p}`)];
      }
      return g.picks.length ? g.picks.map((p) => `${label} ${p}`) : [label];
    });

  async function save() {
    setAsk(false);
    setBusy(true);
    setError("");
    const res = await directorPost({ action: "applyDivisionSetup", tournamentId, plan });
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    if (res.refused?.length) {
      setError(`Kept ${res.refused.join(", ")} — teams are registered in them.`);
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        {GENDERS.map((gender) => {
          const g = plan.find((x) => x.gender === gender.key);
          const mode = MODES.find((m) => m.key === g.mode) ?? MODES[0];
          // Brackets come out of pool play, so they cannot be filled until it
          // is over. Shown, greyed, so a director can see they are coming.
          const bracketsPending = g.mode === "brackets" && !g.poolPlayDone;

          return (
            <div key={gender.key} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Toggle on={g.on} onClick={() => set(gender.key, { on: !g.on })}>
                  {gender.label}
                </Toggle>
                <Toggle
                  on={g.poolPlay}
                  disabled={!g.on}
                  onClick={() => set(gender.key, { poolPlay: !g.poolPlay })}
                >
                  Pool play
                </Toggle>
              </div>

              <div className="flex flex-wrap gap-1">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!g.on}
                    onClick={() => set(gender.key, { mode: m.key, picks: [] })}
                    className={
                      "pill " +
                      (!g.on
                        ? "opacity-40 cursor-not-allowed"
                        : g.mode === m.key
                          ? "bg-afa-navy text-white border-afa-navy"
                          : "")
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1">
                {mode.options.map((o) => (
                  <Toggle
                    key={o}
                    on={g.picks.includes(o)}
                    disabled={!g.on}
                    title={bracketsPending ? "Fills once pool play is over" : undefined}
                    onClick={() => togglePick(gender.key, o)}
                  >
                    {o}
                  </Toggle>
                ))}
              </div>
              {bracketsPending && g.picks.length > 0 && (
                <p className="t-meta">Fills once pool play is over.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy} onClick={() => setAsk(true)}>
          {busy ? "Saving…" : "Save setup"}
        </button>
        <span className="t-meta">
          {summary.length === 0 ? "Nothing selected." : summary.join(" · ")}
        </span>
      </div>
      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}

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
