"use client";

import { useMemo, useState } from "react";
import LegalIdBox from "@/components/forms/LegalIdBox";

/**
 * Manager-only player entry: first name, last name, gender.
 * When knownPlayers is provided, managers can search/pick someone already
 * in the directory instead of retyping.
 */
export default function ManagerPlayerFields({
  value,
  onChange,
  knownPlayers = [],
  fieldClass = "form-field",
  /** Hide people already on this roster (by player id). */
  excludePlayerIds = [],
}) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const exclude = useMemo(
    () => new Set((excludePlayerIds ?? []).filter(Boolean)),
    [excludePlayerIds]
  );

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (knownPlayers ?? []).filter((p) => !exclude.has(p.id));
    if (q) {
      list = list.filter(
        (p) =>
          (p.search && p.search.includes(q)) ||
          (p.label && p.label.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 40);
  }, [knownPlayers, exclude, query]);

  function pickKnown(hit) {
    if (!hit) return;
    set({
      firstName: hit.firstName || "",
      lastName: hit.lastName || "",
      gender: hit.gender || v.gender || "",
      playerId: hit.id,
    });
    setQuery("");
    setListOpen(false);
  }

  function clearPick() {
    set({ playerId: null });
  }

  const picked =
    v.playerId &&
    knownPlayers.find((p) => p.id === v.playerId);

  return (
    <div className="space-y-3">
      {knownPlayers.length > 0 && (
        <div className="space-y-1.5">
          <span className="form-label">
            Pick someone already on file (optional)
          </span>
          {picked ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-afa-navy/15 bg-afa-soft-gray/40 px-3 py-2">
              <span className="t-body text-sm font-semibold min-w-0">
                {picked.label}
                {picked.gender ? ` · ${picked.gender}` : ""}
              </span>
              <button
                type="button"
                className="t-label underline text-afa-muted shrink-0"
                onClick={clearPick}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="search"
                className={fieldClass}
                value={query}
                placeholder="Search last name, first name…"
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
                onBlur={() => {
                  // Delay so option click registers
                  setTimeout(() => setListOpen(false), 150);
                }}
              />
              {listOpen && query.trim() && (
                <ul
                  className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-afa-navy/15 bg-white shadow-lg"
                  role="listbox"
                >
                  {options.length === 0 ? (
                    <li className="px-3 py-2 t-meta text-sm">
                      No match — type a new name below.
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
              {!query.trim() && listOpen && (
                <p className="t-meta text-[11px] mt-1">
                  Type a few letters to search {knownPlayers.length} people on
                  file.
                </p>
              )}
            </div>
          )}
          <p className="t-meta text-[12px]">
            Or enter a new first and last name below.
          </p>
        </div>
      )}

      <LegalIdBox
        title="Player name"
        detail="Use their legal first and last if you know it. They confirm legal name and address when they sign."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="form-label">First name</span>
            <input
              className={fieldClass}
              autoComplete="given-name"
              value={v.firstName || ""}
              onChange={(e) =>
                set({ firstName: e.target.value, playerId: null })
              }
              placeholder="First"
            />
          </label>
          <label className="block">
            <span className="form-label">Last name</span>
            <input
              className={fieldClass}
              autoComplete="family-name"
              value={v.lastName || ""}
              onChange={(e) =>
                set({ lastName: e.target.value, playerId: null })
              }
              placeholder="Last"
            />
          </label>
        </div>
      </LegalIdBox>

      <fieldset>
        <legend className="form-label mb-1">Gender</legend>
        <div className="flex gap-2">
          {[
            { value: "M", label: "M" },
            { value: "F", label: "F" },
          ].map((opt) => {
            const on = v.gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={
                  "flex-1 rounded-lg border-2 px-3 py-2 font-bold text-sm " +
                  (on
                    ? "border-[var(--afa-action)] bg-[var(--afa-action)] text-white"
                    : "border-afa-navy/20 bg-white text-afa-navy")
                }
                onClick={() => set({ gender: opt.value })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function managerPlayerReady(p) {
  return Boolean(
    String(p?.firstName ?? "").trim() &&
      String(p?.lastName ?? "").trim() &&
      (p?.gender === "M" || p?.gender === "F")
  );
}

export function managerPlayerDisplay(p) {
  return [p?.firstName, p?.lastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
