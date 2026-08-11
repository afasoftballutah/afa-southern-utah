"use client";

import { useState } from "react";

function umpLabel(u) {
  if (!u) return "—";
  return `${u.lastName}, ${u.firstName}`;
}

export default function GameUmpireAssign({
  gameId,
  kind = "bracket", // bracket | pool
  umpires = [],
  umpire1Id = null,
  umpire2Id = null,
  team1,
  team2,
  meta,
}) {
  const [u1, setU1] = useState(umpire1Id || "");
  const [u2, setU2] = useState(umpire2Id || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${gameId}/umpires`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          umpire1Id: u1 || null,
          umpire2Id: u2 || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMsg("Saved");
      setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setMsg(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const options = umpires.map((u) => (
    <option key={u.id} value={u.id}>
      {umpLabel(u)}
      {u.pitchFast && u.pitchSlow
        ? " (B)"
        : u.pitchFast
          ? " (F)"
          : u.pitchSlow
            ? " (S)"
            : ""}
      {u.suspended ? " — SUSPENDED" : ""}
    </option>
  ));

  const u1Susp = umpires.find((u) => u.id === u1)?.suspended;
  const u2Susp = umpires.find((u) => u.id === u2)?.suspended;
  const anySusp = u1Susp || u2Susp;

  return (
    <div
      className={
        "rounded-lg border px-3 py-2.5 space-y-2 " +
        (anySusp
          ? "border-afa-red/40 bg-afa-red/[0.04]"
          : "border-afa-navy/10 bg-white")
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-body font-semibold">
          {team1 || "TBD"} <span className="t-meta font-normal">vs</span>{" "}
          {team2 || "TBD"}
        </p>
        {meta && <p className="t-meta">{meta}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="t-label">
            Ump 1 (plate)
            {u1Susp ? (
              <span className="text-afa-red font-semibold"> · suspended</span>
            ) : null}
          </span>
          <select
            className={
              "mt-1 w-full rounded-lg border px-2 py-2 " +
              (u1Susp
                ? "border-afa-red/50 bg-afa-red/[0.06]"
                : "border-afa-navy/20")
            }
            value={u1}
            onChange={(e) => setU1(e.target.value)}
          >
            <option value="">— unassigned —</option>
            {options}
          </select>
        </label>
        <label className="block text-sm">
          <span className="t-label">
            Ump 2 (optional)
            {u2Susp ? (
              <span className="text-afa-red font-semibold"> · suspended</span>
            ) : null}
          </span>
          <select
            className={
              "mt-1 w-full rounded-lg border px-2 py-2 " +
              (u2Susp
                ? "border-afa-red/50 bg-afa-red/[0.06]"
                : "border-afa-navy/20")
            }
            value={u2}
            onChange={(e) => setU2(e.target.value)}
          >
            <option value="">— none —</option>
            {options}
          </select>
        </label>
      </div>
      {anySusp && (
        <p className="t-meta text-[12px] text-afa-red font-semibold">
          A suspended umpire is assigned on this game — they stay listed so
          you can see it; replace them if they should not work.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn-action text-sm px-3 py-1.5"
        >
          {busy ? "Saving…" : "Save umps"}
        </button>
        {msg && <span className="t-meta">{msg}</span>}
      </div>
    </div>
  );
}
