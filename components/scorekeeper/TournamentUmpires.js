"use client";

import { useMemo, useState } from "react";
import {
  timeInputValue,
  formatTimeWindowLabel,
  formatTimeOfDayLabel,
} from "@/lib/league-time";

const STATUS = [
  { value: "available", label: "Available", chip: "bg-afa-go/15 text-afa-go border-afa-go/40" },
  { value: "limited", label: "Limited", chip: "bg-amber-100 text-amber-950 border-amber-300" },
  {
    value: "unavailable",
    label: "Unavailable",
    chip: "bg-afa-navy/10 text-afa-muted border-afa-navy/20",
  },
];

function statusMeta(value) {
  return STATUS.find((s) => s.value === value) ?? STATUS[0];
}

function umpLabel(u) {
  if (!u) return "—";
  const pref = (u.preferredName || "").trim();
  if (pref) return pref;
  return [u.lastName, u.firstName].filter(Boolean).join(", ") || "—";
}

function pitchTag(u) {
  if (u.pitchFast && u.pitchSlow) return "B";
  if (u.pitchFast) return "F";
  if (u.pitchSlow) return "S";
  return "—";
}

/**
 * Director: attach umpires from the local roster to this tournament and
 * record their daily availability window (from / until).
 *
 * Scheduler note (future): these windows are tournament-wide wall-clock
 * times shared across all divisions — multiple divisions run in parallel
 * on the same fields, not as separate isolated schedules.
 */
export default function TournamentUmpires({
  tournamentId,
  tournamentName,
  /** League-local daily first-pitch time for this tournament (HH:MM[:SS]). */
  dayStartTime = null,
  /** Full local roster (active preferred). */
  roster = [],
  /** Existing tournament_umpires rows with nested umpire fields. */
  initial = [],
}) {
  const defaultFrom = timeInputValue(dayStartTime);

  const [entries, setEntries] = useState(initial);
  const [pickId, setPickId] = useState("");
  const [fromTime, setFromTime] = useState(defaultFrom);
  const [untilTime, setUntilTime] = useState("");
  const [status, setStatus] = useState("available");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editFrom, setEditFrom] = useState("");
  const [editUntil, setEditUntil] = useState("");
  const [editStatus, setEditStatus] = useState("available");

  const onCrew = useMemo(
    () => new Set(entries.map((e) => e.umpireId)),
    [entries]
  );

  const addable = useMemo(
    () =>
      roster
        .filter((u) => u.status !== "inactive" && !onCrew.has(u.id))
        .slice()
        .sort((a, b) =>
          umpLabel(a).localeCompare(umpLabel(b), undefined, {
            sensitivity: "base",
          })
        ),
    [roster, onCrew]
  );

  async function post(body) {
    const res = await fetch("/api/scorekeeper/umpires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function entryFromApi(jsonEntry, ump) {
    return {
      id: jsonEntry.id,
      umpireId: jsonEntry.umpire_id || ump?.id,
      status: jsonEntry.status,
      availableFrom: jsonEntry.available_from,
      availableUntil: jsonEntry.available_until,
      notes: jsonEntry.notes,
      umpire: ump || {
        id: jsonEntry.umpire_id,
        firstName: "?",
        lastName: "?",
      },
    };
  }

  async function add() {
    if (!pickId) {
      setError("Pick an umpire from the roster");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const json = await post({
        action: "addTournamentUmpire",
        tournamentId,
        umpireId: pickId,
        status,
        availableFrom: fromTime || null,
        availableUntil: untilTime || null,
      });
      const ump = roster.find((u) => u.id === pickId);
      setEntries((cur) =>
        [
          entryFromApi(json.entry, ump),
          ...cur,
        ].sort((a, b) =>
          umpLabel(a.umpire).localeCompare(umpLabel(b.umpire), undefined, {
            sensitivity: "base",
          })
        )
      );
      setPickId("");
      setFromTime(defaultFrom);
      setUntilTime("");
      setStatus("available");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e) {
    setEditingId(e.id);
    setEditFrom(timeInputValue(e.availableFrom));
    setEditUntil(timeInputValue(e.availableUntil));
    setEditStatus(e.status || "available");
    setError("");
  }

  async function saveEdit(id) {
    setBusy(true);
    setError("");
    try {
      const json = await post({
        action: "updateTournamentUmpire",
        id,
        status: editStatus,
        availableFrom: editFrom || null,
        availableUntil: editUntil || null,
      });
      setEntries((cur) =>
        cur.map((row) =>
          row.id === id
            ? {
                ...row,
                status: json.entry.status,
                availableFrom: json.entry.available_from,
                availableUntil: json.entry.available_until,
                notes: json.entry.notes,
              }
            : row
        )
      );
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e) {
    if (
      !window.confirm(
        `Remove ${umpLabel(e.umpire)} from ${tournamentName || "this tournament"}?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post({ action: "removeTournamentUmpire", id: e.id });
      setEntries((cur) => cur.filter((row) => row.id !== e.id));
      if (editingId === e.id) setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const availableCount = entries.filter((e) => e.status === "available").length;
  const limitedCount = entries.filter((e) => e.status === "limited").length;
  const dayLabel = formatTimeOfDayLabel(dayStartTime);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-afa-navy/10 bg-afa-soft-gray/50 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="t-strong text-sm">Umpire crew</p>
          <p className="t-meta text-[12px]">
            Who is on this event and when they can work each day
            {dayLabel ? ` (fields open ${dayLabel})` : ""}. Times are shared
            across all divisions — games run in parallel on the same clock.
          </p>
        </div>
        <p className="t-meta text-[12px] tabular-nums">
          {entries.length === 0
            ? "Nobody listed"
            : `${entries.length} listed · ${availableCount} available${
                limitedCount ? ` · ${limitedCount} limited` : ""
              }`}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <p className="t-meta text-afa-red font-semibold" role="alert">
            {error}
          </p>
        )}

        {!dayStartTime && (
          <p className="t-meta text-[12px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            Set <strong>Day start</strong> in tournament terms above so new
            umpires default to first pitch. You can still enter times manually.
          </p>
        )}

        {entries.length === 0 ? (
          <p className="t-meta text-center py-2">
            No umpires on this tournament yet. Add someone below.
          </p>
        ) : (
          <ul className="divide-y divide-afa-navy/10 rounded-lg border border-afa-navy/10 overflow-hidden">
            {entries.map((e) => {
              const st = statusMeta(e.status);
              const editing = editingId === e.id;
              const window =
                formatTimeWindowLabel(e.availableFrom, e.availableUntil) ||
                (e.availability ? String(e.availability) : "");
              return (
                <li
                  key={e.id}
                  className="px-3 py-2.5 bg-white flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="t-body font-semibold">
                      {umpLabel(e.umpire)}
                      <span className="t-meta font-normal">
                        {" "}
                        · {pitchTag(e.umpire)}
                      </span>
                      {e.umpire?.phone ? (
                        <span className="t-meta font-normal">
                          {" "}
                          · {e.umpire.phone}
                        </span>
                      ) : null}
                    </p>
                    {editing ? (
                      <div className="space-y-2 max-w-md">
                        <label className="block">
                          <span className="form-label">Status</span>
                          <select
                            className="form-field"
                            value={editStatus}
                            onChange={(ev) => setEditStatus(ev.target.value)}
                            disabled={busy}
                          >
                            {STATUS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="form-label">Available from</span>
                            <input
                              type="time"
                              className="form-field"
                              value={editFrom}
                              onChange={(ev) => setEditFrom(ev.target.value)}
                              disabled={busy}
                            />
                          </label>
                          <label className="block">
                            <span className="form-label">Until</span>
                            <input
                              type="time"
                              className="form-field"
                              value={editUntil}
                              onChange={(ev) => setEditUntil(ev.target.value)}
                              disabled={busy}
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="pill pill-solid"
                            disabled={busy}
                            onClick={() => saveEdit(e.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="pill"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold " +
                            st.chip
                          }
                        >
                          {st.label}
                        </span>
                        {window ? (
                          <p className="t-meta text-[13px] mt-1 tabular-nums">
                            {window}
                            <span className="text-afa-muted"> each day</span>
                          </p>
                        ) : (
                          <p className="t-meta text-[12px] mt-1 italic">
                            No hours set
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!editing && (
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="pill text-[12px]"
                        disabled={busy}
                        onClick={() => startEdit(e)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="pill text-[12px] text-afa-red border-afa-red/30"
                        disabled={busy}
                        onClick={() => remove(e)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-lg border border-dashed border-afa-navy/20 p-3 space-y-2 bg-afa-soft-gray/30">
          <p className="t-strong text-sm">Add from roster</p>
          {roster.length === 0 ? (
            <p className="t-meta text-[12px]">
              No umpires on file yet. Add people under{" "}
              <a href="/director/umpires" className="underline">
                Umpires
              </a>{" "}
              first.
            </p>
          ) : addable.length === 0 ? (
            <p className="t-meta text-[12px]">
              Everyone active on the roster is already listed here.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="form-label">Umpire</span>
                  <select
                    className="form-field"
                    value={pickId}
                    onChange={(e) => setPickId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— pick —</option>
                    {addable.map((u) => (
                      <option key={u.id} value={u.id}>
                        {umpLabel(u)}
                        {u.pitchFast || u.pitchSlow
                          ? ` (${pitchTag(u)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="form-label">Status</span>
                  <select
                    className="form-field"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={busy}
                  >
                    {STATUS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hidden sm:block" />
                <label className="block">
                  <span className="form-label">
                    Available from
                    {defaultFrom ? (
                      <span className="t-meta font-normal">
                        {" "}
                        (default day start)
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="time"
                    className="form-field"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="block">
                  <span className="form-label">Until</span>
                  <input
                    type="time"
                    className="form-field"
                    value={untilTime}
                    onChange={(e) => setUntilTime(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              <button
                type="button"
                className="pill pill-solid"
                disabled={busy || !pickId}
                onClick={add}
              >
                {busy ? "Adding…" : "Add to tournament"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
