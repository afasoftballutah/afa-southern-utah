"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SeedBrackets from "./SeedBrackets";
import BracketEditor from "./BracketEditor";

// StageView — the scorekeeper's two stages (redesign spec §1, §2).
//
// A tournament is in pool play or it is in the bracket, and the screen
// says which. Confirming the bracket is the hinge: pool play becomes
// final, its scores stop being editable, and this screen opens on the
// bracket from then on.
//
// Reopening is deliberately one tap away behind a confirm. A locked
// screen with no way out is a trap at a ballpark at midnight, and
// directors do fix wrong scores.

function ConfirmRail({ open, title, detail, action, onCancel, onGo, busy }) {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-0 bottom-0 z-50 bg-afa-navy text-white shadow-[0_-12px_40px_-14px_rgba(22,35,61,.55)]"
    >
      <div className="mx-auto max-w-3xl px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-white/70">{detail}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-white/30 px-4 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            data-rail-go
            onClick={onGo}
            disabled={busy}
            className="rounded-full bg-white px-4 font-semibold text-afa-navy disabled:opacity-50"
          >
            {busy ? "Working…" : action}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StageView({ divisionId, tournamentSlug, poolGames, stages, confirmedAt }) {
  const router = useRouter();
  const confirmed = Boolean(confirmedAt);
  const [stage, setStage] = useState(confirmed ? "bracket" : "pools");
  const [ask, setAsk] = useState(null); // "confirm" | "reopen"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(stages?.[0]?.id ?? null);

  const waiting = poolGames.filter((g) => g.status !== "final").length;

  async function send(next) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/bracket/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, confirmed: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      setAsk(null);
      if (next) setStage("bracket");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setAsk(null);
    } finally {
      setBusy(false);
    }
  }

  const bracket = stages?.find((s) => s.id === shown) ?? stages?.[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="seg">
          {[
            ["pools", confirmed ? "Pool play 🔒" : "Pool play"],
            ["bracket", "Bracket"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={stage === key}
              disabled={key === "bracket" && !stages?.length}
              onClick={() => setStage(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-bold underline text-afa-ink">{error}</p>}

      {/* The Pull from QuickScores button is gone. JD, 2026-07-27: "lets get
          rid of the pull from quickscores link. thats not going to be a thing
          much anymore, lets not depend on it." Scores are typed here now. The
          hourly sync route is untouched, so nothing that already ran stops. */}

      {stage === "pools" ? (
        <>
          {confirmed && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-afa-ink/70 shadow-sm">
              <span>
                <b className="text-afa-ink">Pool play is final.</b> The bracket was confirmed, so
                scores here are read only.
              </span>
              <button
                type="button"
                onClick={() => setAsk("reopen")}
                className="ml-auto rounded-full border border-afa-ink/15 px-3 text-sm font-semibold text-afa-navy"
              >
                Reopen pool play
              </button>
            </div>
          )}
          {/* One surface, like the sample. Games live on their pool card,
              and the by-time question — "what is on Field 3 at 10?" — is
              answered by the field/time chips rather than by a second list
              of the same 28 games underneath. */}
          <SeedBrackets
            divisionId={divisionId}
            tournamentSlug={tournamentSlug}
            poolGames={poolGames}
            readOnly={confirmed}
          />
        </>
      ) : (
        <BracketEditor stages={stages} />
      )}

      {/* The one primary action, and it advances: confirm the bracket, then
          say so. Red is the act colour, so it stops being red once there is
          no act left to perform. */}
      {!confirmed ? (
        <button
          type="button"
          onClick={() => setAsk("confirm")}
          className="btn-action-block"
        >
          Confirm bracket
        </button>
      ) : (
        <p className="rounded-lg bg-[rgba(70,160,106,.14)] py-3 text-center font-bold text-[#2f7a4f]">
          ✓ Bracket confirmed
        </p>
      )}

      <ConfirmRail
        open={ask === "confirm"}
        title="Confirm the bracket?"
        detail={`Pool play becomes final and its scores stop being editable, and this screen moves to the bracket.${
          waiting ? ` ${waiting} pool game${waiting === 1 ? " is" : "s are"} still unscored.` : ""
        } You can reopen pool play afterwards if a score was wrong.`}
        action="Confirm bracket"
        busy={busy}
        onCancel={() => setAsk(null)}
        onGo={() => send(true)}
      />
      <ConfirmRail
        open={ask === "reopen"}
        title="Reopen pool play?"
        detail="Scores become editable again and the bracket stays exactly as it is. Any change you make still has to be re-applied to move a team."
        action="Reopen it"
        busy={busy}
        onCancel={() => setAsk(null)}
        onGo={() => send(false)}
      />
    </div>
  );
}
