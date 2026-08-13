"use client";

import { useState } from "react";
import { formatPlayDayLabel } from "@/lib/league-time";
import { playDaysSummary } from "@/lib/tournament-terms";

/**
 * Bulk play-day tools for a multi-day tournament:
 * Men's + Women's one day, Coed another; or all on one day.
 */
export default function TournamentPlayDays({
  tournamentId,
  startDate = null,
  endDate = null,
  /** Snapshot of parent divisions: { id, gender, dayDate, label } */
  divisions = [],
}) {
  const start = startDate ? String(startDate).slice(0, 10) : "";
  const end = endDate ? String(endDate).slice(0, 10) : start;
  const oneDay = start && end && start === end;

  const parents = divisions.filter((d) => !d.parentDivisionId);
  const hasMens = parents.some((d) => d.gender === "mens");
  const hasWomens = parents.some((d) => d.gender === "womens");
  const hasCoed = parents.some((d) => d.gender === "coed");
  const hasMensOrWomens = hasMens || hasWomens;

  const [mensWomensDay, setMensWomensDay] = useState(() => {
    const m = parents.find((d) => d.gender === "mens" && d.dayDate);
    const w = parents.find((d) => d.gender === "womens" && d.dayDate);
    return String(m?.dayDate || w?.dayDate || start || "").slice(0, 10);
  });
  const [coedDay, setCoedDay] = useState(() => {
    const c = parents.find((d) => d.gender === "coed" && d.dayDate);
    // Default coed to end date when multi-day (typical Sun), else start
    return String(c?.dayDate || (oneDay ? start : end) || "").slice(0, 10);
  });
  const [allDay, setAllDay] = useState(start || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const summary = playDaysSummary({
    startDate,
    endDate,
    divisions,
  });

  async function post(body) {
    const res = await fetch("/api/scorekeeper/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not save");
    return json;
  }

  async function applySplit() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body = { action: "setTournamentPlayDays", tournamentId };
      if (hasMensOrWomens) body.mensWomensDay = mensWomensDay || null;
      if (hasCoed) body.coedDay = coedDay || null;
      const json = await post(body);
      setMsg(
        `Updated ${json.updated} division${json.updated === 1 ? "" : "s"}. Reloading…`
      );
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function applyAll(day) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const json = await post({
        action: "setTournamentPlayDays",
        tournamentId,
        allDayDate: day || null,
      });
      setMsg(
        `Updated ${json.updated} division${json.updated === 1 ? "" : "s"}. Reloading…`
      );
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (parents.length === 0) return null;

  return (
    <div className={"card p-3 sm:p-4 space-y-3 " + (open ? "" : "py-2.5")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-afa-navy/40 inline-block w-2">{open ? "▾" : "▸"}</span>
        <span className="t-strong text-sm">Play days</span>
        {!open ? <span className="t-meta truncate">{summary}</span> : null}
      </button>

      {!open ? null : oneDay ? (
        <div className="flex flex-wrap items-end gap-2">
          <p className="t-meta text-[13px]">
            One-day tournament
            {start ? (
              <>
                {" "}
                — all divisions should play{" "}
                <strong>{formatPlayDayLabel(start) || start}</strong>
              </>
            ) : null}
            .
          </p>
          <button
            type="button"
            className="pill pill-solid"
            disabled={busy || !start}
            onClick={() => applyAll(start)}
          >
            {busy ? "Saving…" : "Set all divisions to start date"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            {hasMensOrWomens && (
              <label className="block">
                <span className="form-label">
                  Men&apos;s + Women&apos;s day
                </span>
                <input
                  type="date"
                  className="form-field"
                  value={mensWomensDay}
                  min={start || undefined}
                  max={end || undefined}
                  disabled={busy}
                  onChange={(e) => setMensWomensDay(e.target.value)}
                />
                {mensWomensDay ? (
                  <span className="t-meta text-[11px] block mt-0.5">
                    {formatPlayDayLabel(mensWomensDay)}
                  </span>
                ) : null}
              </label>
            )}
            {hasCoed && (
              <label className="block">
                <span className="form-label">Coed day</span>
                <input
                  type="date"
                  className="form-field"
                  value={coedDay}
                  min={start || undefined}
                  max={end || undefined}
                  disabled={busy}
                  onChange={(e) => setCoedDay(e.target.value)}
                />
                {coedDay ? (
                  <span className="t-meta text-[11px] block mt-0.5">
                    {formatPlayDayLabel(coedDay)}
                  </span>
                ) : null}
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="pill pill-solid"
              disabled={busy}
              onClick={applySplit}
            >
              {busy ? "Saving…" : "Apply play days by gender"}
            </button>
            {start && (
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => applyAll(start)}
              >
                All → tournament start
              </button>
            )}
          </div>
        </div>
      )}

      {open && !oneDay ? (
        <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-afa-navy/10">
          <label className="block">
            <span className="form-label">Set every division to</span>
            <input
              type="date"
              className="form-field"
              value={allDay}
              min={start || undefined}
              max={end || undefined}
              disabled={busy}
              onChange={(e) => setAllDay(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="pill"
            disabled={busy || !allDay}
            onClick={() => applyAll(allDay)}
          >
            Apply to all
          </button>
        </div>
      ) : null}

      {open && error ? (
        <p className="t-meta text-afa-red font-semibold" role="alert">
          {error}
        </p>
      ) : null}
      {open && msg ? <p className="t-meta text-afa-go font-semibold">{msg}</p> : null}
    </div>
  );
}
