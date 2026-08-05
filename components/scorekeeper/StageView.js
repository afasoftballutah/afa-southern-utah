"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SeedBrackets from "./SeedBrackets";
import BracketEditor from "./BracketEditor";

// StageView — pool play vs bracket.
// Confirm locks pool scores (read-only). You can open the Bracket tab as soon
// as a generated/transcribed bracket exists — no need to confirm first.

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

export default function StageView({
  divisionId,
  tournamentSlug,
  poolGames,
  stages,
  confirmedAt,
  /** Generated / own-division bracket UI (seed + generate + games) */
  bracketPanel = null,
  /** Prefer opening on Bracket after first generate */
  preferBracket = false,
}) {
  const router = useRouter();
  const confirmed = Boolean(confirmedAt);
  const hasChildStages = (stages?.length ?? 0) > 0;
  const canViewBracket = hasChildStages || Boolean(bracketPanel);

  const [stage, setStage] = useState(() => {
    if (confirmed && canViewBracket) return "bracket";
    if (preferBracket && canViewBracket) return "bracket";
    return "pools";
  });
  const [ask, setAsk] = useState(null); // "confirm" | "reopen"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // After generate (preferBracket flips true), jump to Bracket so you can preview.
  useEffect(() => {
    if (preferBracket && canViewBracket) setStage("bracket");
  }, [preferBracket, canViewBracket]);

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
      if (next && canViewBracket) setStage("bracket");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setAsk(null);
    } finally {
      setBusy(false);
    }
  }

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
              disabled={key === "bracket" && !canViewBracket}
              title={
                key === "bracket" && !canViewBracket
                  ? "Generate a bracket first (or wait for stages)"
                  : undefined
              }
              onClick={() => setStage(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-bold underline text-afa-ink">{error}</p>}

      {stage === "pools" ? (
        <>
          {confirmed && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-afa-ink/70 shadow-sm">
              <span>
                <b className="text-afa-ink">Pool play is final.</b> Scores here are read only.
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
          <SeedBrackets
            divisionId={divisionId}
            tournamentSlug={tournamentSlug}
            poolGames={poolGames}
            readOnly={confirmed}
          />
          {canViewBracket && !confirmed && (
            <button
              type="button"
              className="w-full rounded-lg border border-afa-navy/30 py-3 text-sm font-semibold text-afa-navy"
              onClick={() => setStage("bracket")}
            >
              Open Bracket — seed, preview, generate
            </button>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {!confirmed && (
            <p className="rounded-xl bg-white px-4 py-3 text-sm text-afa-ink/70 shadow-sm">
              <b className="text-afa-ink">Preview.</b> Look over seeds and the bracket. You can
              rebuild before confirming. Confirm only locks pool scores — it does not invent a
              bracket.
            </p>
          )}
          {bracketPanel}
          {hasChildStages && <BracketEditor stages={stages} />}
          {!bracketPanel && !hasChildStages && (
            <p className="t-meta">No bracket yet — generate one or finish seeding into stages.</p>
          )}
        </div>
      )}

      {!confirmed ? (
        <button
          type="button"
          onClick={() => setAsk("confirm")}
          className="btn-action-block"
        >
          Confirm pool play final
        </button>
      ) : (
        <p className="rounded-lg bg-[rgba(70,160,106,.14)] py-3 text-center font-bold text-[#2f7a4f]">
          ✓ Pool play locked
        </p>
      )}

      <ConfirmRail
        open={ask === "confirm"}
        title="Lock pool scores?"
        detail={`Pool scores become read-only. You can still view and (if draft) rebuild the bracket.${
          waiting
            ? ` ${waiting} pool game${waiting === 1 ? " is" : "s are"} still unscored.`
            : ""
        } You can reopen pool play later if a score was wrong.`}
        action="Lock pool play"
        busy={busy}
        onCancel={() => setAsk(null)}
        onGo={() => send(true)}
      />
      <ConfirmRail
        open={ask === "reopen"}
        title="Reopen pool play?"
        detail="Scores become editable again. The bracket stays as it is until you rebuild it."
        action="Reopen it"
        busy={busy}
        onCancel={() => setAsk(null)}
        onGo={() => send(false)}
      />
    </div>
  );
}
