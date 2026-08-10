"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// Next to Save, because that is where a director is when they decide a
// tournament should not exist. Refused by the route when a team is registered
// — a registration is somebody's roster, waiver and signature.
export default function DeleteTournament({ tournamentId, name }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setAsk(false);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteTournament", tournamentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete it");
      window.location.href = "/director/tournaments";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="pill text-afa-red border-afa-red/30 hover:border-afa-red text-[15px] px-2 py-0.5"
        aria-label="Delete tournament"
        title="Delete tournament"
        disabled={busy}
        onClick={() => setAsk(true)}
      >
        {busy ? "…" : "✕"}
      </button>
      {error && <span className="t-meta text-afa-red font-semibold whitespace-nowrap">{error}</span>}
      {ask && (
        <ConfirmDialog
          title={`Delete ${name}`}
          message="Its divisions and any schedule go with it. Teams are not deleted — if any are registered, this is refused."
          confirmLabel="Delete it"
          busy={busy}
          onConfirm={go}
          onCancel={() => setAsk(false)}
        />
      )}
    </>
  );
}
