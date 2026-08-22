"use client";

import { useRef, useState } from "react";
import { directorPost } from "./DirectorForm";
import { missingSheetTeams } from "@/lib/bracket/read-sheet";

const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.72;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Photo of a paper bracket → editable draft → apply to this division.
 */
export default function ReadSheet({
  divisionId,
  playDay = null,
  teamNames = [],
  onApplied,
}) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [games, setGames] = useState(null);

  async function pick(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    setGames(null);
    try {
      const image = await compressImage(file);
      const res = await fetch("/api/scorekeeper/bracket/from-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, image, playDay }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not read that photo");
      setGames(json.games);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function setGame(i, patch) {
    setGames((cur) => cur.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  const newcomers = games ? missingSheetTeams(games, teamNames) : [];

  async function apply() {
    setBusy(true);
    setError("");
    const json = await directorPost({
      action: "applySheetDraft",
      divisionId,
      games,
    });
    setBusy(false);
    if (json.error) {
      setError(json.error);
      return;
    }
    setGames(null);
    onApplied?.();
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        className="pill"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy && !games ? "Reading sheet…" : "Photo of sheet"}
      </button>
      {error ? <p className="text-afa-ink font-bold underline text-sm">{error}</p> : null}
      {games ? (
        <div className="card p-3 space-y-2">
          <p className="t-meta">
            Draft — {games.length} game{games.length === 1 ? "" : "s"}. Fix anything wrong, then
            apply.
          </p>
          {newcomers.length > 0 ? (
            <p className="t-meta">
              Will add {newcomers.join(", ")} — manager TBD, no roster.
            </p>
          ) : null}
          <ol className="space-y-2">
            {games.map((g, i) => (
              <li key={`${g.n}-${i}`} className="grid grid-cols-[3rem_1fr] gap-2 items-start">
                <input
                  className="w-full border border-afa-navy/30 rounded px-1 py-1 text-sm tabular-nums"
                  inputMode="numeric"
                  aria-label={`Game number ${g.n}`}
                  value={g.n}
                  onChange={(e) => setGame(i, { n: Number(e.target.value) || g.n })}
                />
                <div className="grid gap-1 min-w-0">
                  <input
                    className="w-full border border-afa-navy/30 rounded px-2 py-1 text-sm"
                    value={g.a}
                    onChange={(e) => setGame(i, { a: e.target.value })}
                  />
                  <input
                    className="w-full border border-afa-navy/30 rounded px-2 py-1 text-sm"
                    value={g.b}
                    onChange={(e) => setGame(i, { b: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-action" disabled={busy} onClick={apply}>
              {busy ? "Saving…" : "Apply draft"}
            </button>
            <button
              type="button"
              className="pill"
              disabled={busy}
              onClick={() => setGames(null)}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
