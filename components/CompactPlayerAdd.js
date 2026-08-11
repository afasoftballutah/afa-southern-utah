"use client";

import { useMemo, useState } from "react";
import {
  managerPlayerDisplay,
  managerPlayerReady,
} from "@/components/ManagerPlayerFields";

/**
 * Compact roster builder: short list of people, add one at a time.
 * Directory pick stays one row; manual entry expands only when needed.
 */
export default function CompactPlayerAdd({
  players,
  onChange,
  knownPlayers = [],
  maxPlayers = 22,
  minPlayers = 1,
  /** Optional: offer adding the manager as a one-tap row */
  managerOffer = null, // { firstName, lastName, display }
}) {
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState("search"); // search | manual
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    playerId: null,
  });
  const [needGender, setNeedGender] = useState(null); // pending pick awaiting M/F

  const excludeIds = useMemo(
    () => new Set(players.map((p) => p.playerId).filter(Boolean)),
    [players]
  );

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (knownPlayers ?? [])
      .filter((p) => !excludeIds.has(p.id))
      .filter(
        (p) =>
          (p.search && p.search.includes(q)) ||
          (p.label && p.label.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [knownPlayers, excludeIds, query]);

  function resetDraft() {
    setDraft({ firstName: "", lastName: "", gender: "", playerId: null });
    setQuery("");
    setMode("search");
    setNeedGender(null);
    setListOpen(false);
  }

  function closeAdd() {
    resetDraft();
    setAdding(false);
  }

  function commit(player) {
    if (!managerPlayerReady(player)) return;
    // Avoid exact name+gender dupes on the list
    const label = managerPlayerDisplay(player).toLowerCase();
    if (
      players.some(
        (p) =>
          managerPlayerDisplay(p).toLowerCase() === label &&
          p.gender === player.gender
      )
    ) {
      closeAdd();
      return;
    }
    onChange([...players, { ...player }]);
    closeAdd();
  }

  function pickKnown(hit) {
    if (!hit) return;
    const base = {
      firstName: hit.firstName || "",
      lastName: hit.lastName || "",
      gender: hit.gender || "",
      playerId: hit.id,
    };
    if (base.gender === "M" || base.gender === "F") {
      commit(base);
      return;
    }
    // Directory row missing gender — one compact M/F step
    setNeedGender(base);
    setQuery("");
    setListOpen(false);
  }

  function removeAt(i) {
    onChange(players.filter((_, idx) => idx !== i));
  }

  const managerAlready =
    managerOffer &&
    players.some(
      (p) =>
        managerPlayerDisplay(p).toLowerCase() ===
        managerOffer.display.toLowerCase()
    );

  return (
    <div className="space-y-3">
      <p className="t-meta text-[13px]">
        Search the directory or add a new name. At least one player required.
        They finish details when they sign.
      </p>

      {/* Compact roster list */}
      {players.length > 0 ? (
        <ul className="card divide-y divide-afa-navy/10 overflow-hidden">
          {players.map((p, i) => (
            <li
              key={`${p.playerId || "n"}-${i}-${p.firstName}-${p.lastName}`}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="t-body text-sm font-semibold min-w-0 truncate">
                {managerPlayerDisplay(p) || "—"}
                {p.gender ? (
                  <span className="t-meta font-normal"> · {p.gender}</span>
                ) : null}
                {p.playerId ? (
                  <span className="t-meta font-normal"> · on file</span>
                ) : null}
              </span>
              <button
                type="button"
                className="pill text-[12px] shrink-0"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${managerPlayerDisplay(p)}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-meta text-center py-2 rounded-lg border border-dashed border-afa-navy/15">
          No players yet
        </p>
      )}

      {/* Manager self-add — one line */}
      {managerOffer && !managerAlready && !adding && (
        <button
          type="button"
          className="w-full text-left rounded-lg border border-afa-navy/15 px-3 py-2 hover:bg-afa-soft-gray/40"
          onClick={() => {
            setAdding(true);
            setNeedGender({
              firstName: managerOffer.firstName,
              lastName: managerOffer.lastName,
              gender: "",
              playerId: null,
            });
            setMode("search");
          }}
        >
          <span className="t-body text-sm font-semibold text-afa-navy">
            Add me ({managerOffer.display})
          </span>
          <span className="t-meta block text-[12px]">
            Managers usually play — pick M/F next
          </span>
        </button>
      )}

      {/* Gender-only step after directory pick without M/F */}
      {needGender && (
        <div className="rounded-lg border border-afa-navy/15 p-3 space-y-2">
          <p className="t-body text-sm font-semibold">
            {managerPlayerDisplay(needGender) || "Player"} — pick gender
          </p>
          <div className="flex gap-2">
            {["M", "F"].map((g) => (
              <button
                key={g}
                type="button"
                className="flex-1 rounded-lg border-2 border-afa-navy/20 py-2 font-bold text-sm hover:border-afa-navy hover:bg-afa-navy hover:text-white"
                onClick={() => commit({ ...needGender, gender: g })}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="t-label underline text-afa-muted"
            onClick={() => {
              setNeedGender(null);
              if (!adding) setAdding(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add one */}
      {!needGender && !adding && players.length < maxPlayers && (
        <button
          type="button"
          className="pill pill-solid w-full justify-center"
          onClick={() => {
            resetDraft();
            setAdding(true);
          }}
        >
          + Add player
        </button>
      )}

      {!needGender && adding && (
        <div className="rounded-lg border border-afa-navy/15 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="t-strong text-sm">Add player</p>
            <button
              type="button"
              className="t-label underline text-afa-muted"
              onClick={closeAdd}
            >
              Cancel
            </button>
          </div>

          {mode === "search" && knownPlayers.length > 0 && (
            <div className="relative">
              <input
                type="search"
                className="form-field"
                value={query}
                placeholder="Search last name, first name…"
                autoComplete="off"
                autoFocus
                onChange={(e) => {
                  setQuery(e.target.value);
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
                onBlur={() => setTimeout(() => setListOpen(false), 150)}
              />
              {listOpen && query.trim() && (
                <ul
                  className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-afa-navy/15 bg-white shadow-lg"
                  role="listbox"
                >
                  {options.length === 0 ? (
                    <li className="px-3 py-2 t-meta text-sm">
                      No match —{" "}
                      <button
                        type="button"
                        className="underline font-semibold text-afa-navy"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const parts = query.trim().split(/\s+/);
                          setDraft({
                            firstName: parts[0] || "",
                            lastName: parts.slice(1).join(" ") || "",
                            gender: "",
                            playerId: null,
                          });
                          setMode("manual");
                        }}
                      >
                        add as new
                      </button>
                    </li>
                  ) : (
                    options.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-afa-navy/5"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickKnown(p)}
                        >
                          <span className="font-semibold">{p.label}</span>
                          {p.gender ? (
                            <span className="t-meta"> · {p.gender}</span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <button
                type="button"
                className="t-label underline text-afa-muted mt-1.5"
                onClick={() => setMode("manual")}
              >
                New player (type name)
              </button>
            </div>
          )}

          {(mode === "manual" || knownPlayers.length === 0) && (
            <div className="space-y-2">
              {knownPlayers.length > 0 && (
                <button
                  type="button"
                  className="t-label underline text-afa-muted"
                  onClick={() => setMode("search")}
                >
                  ← Search directory
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="form-label">First</span>
                  <input
                    className="form-field"
                    value={draft.firstName}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        firstName: e.target.value,
                        playerId: null,
                      }))
                    }
                    placeholder="First"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="form-label">Last</span>
                  <input
                    className="form-field"
                    value={draft.lastName}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        lastName: e.target.value,
                        playerId: null,
                      }))
                    }
                    placeholder="Last"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                {["M", "F"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={
                      "flex-1 rounded-lg border-2 py-2 font-bold text-sm " +
                      (draft.gender === g
                        ? "border-afa-navy bg-afa-navy text-white"
                        : "border-afa-navy/20 bg-white text-afa-navy")
                    }
                    onClick={() => setDraft((d) => ({ ...d, gender: g }))}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-action w-full"
                disabled={!managerPlayerReady(draft)}
                onClick={() => commit(draft)}
              >
                Add to list
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
