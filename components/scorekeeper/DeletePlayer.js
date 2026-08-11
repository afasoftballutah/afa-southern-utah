"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Hard-delete a person from the players directory.
 * Roster member rows stay (names/waivers); they just lose the player_id link.
 */
export default function DeletePlayer({
  playerId,
  name,
  buttonClass = "pill text-afa-red border-afa-red/30 hover:border-afa-red",
}) {
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
        body: JSON.stringify({ action: "deletePlayer", playerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => setAsk(true)}
      >
        {busy ? "…" : "Delete"}
      </button>
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}
      {ask && (
        <ConfirmDialog
          title={`Delete ${name}`}
          message="Removes them from the players list. Roster lines on past teams keep their name and waiver text, but no longer link to this player record. Prefer Merge for duplicates."
          confirmLabel="Delete player"
          busy={busy}
          onConfirm={go}
          onCancel={() => setAsk(false)}
        />
      )}
    </>
  );
}
