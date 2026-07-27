"use client";

import { useState } from "react";
import { directorPost } from "./DirectorForm";
import ConfirmDialog from "./ConfirmDialog";

// The coed split, edited where the division lives.
//
// JD, 2026-07-27: "a CoEd tournament, when being set up, should say how many
// men and women. 5 and 5 should be default for Coed (sometimes it will be 7/3
// or 6/4) for now but should be able to be changed."
//
// Only shown on a coed division. A Men's or Women's division has no split to
// meet, and an input asking for one there would be a question with no answer.
export default function DivisionMinimums({ divisionId, minMen, minWomen }) {
  const [men, setMen] = useState(minMen ?? "");
  const [women, setWomen] = useState(minWomen ?? "");
  const [state, setState] = useState("idle");
  const [ask, setAsk] = useState(false);

  const dirty = String(men) !== String(minMen ?? "") || String(women) !== String(minWomen ?? "");

  async function save() {
    setAsk(false);
    setState("saving");
    const res = await directorPost({
      action: "setDivisionMinimums",
      divisionId,
      minMen: men === "" ? null : Number(men),
      minWomen: women === "" ? null : Number(women),
    });
    if (res.error) return setState("error");
    setState("saved");
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <label className="block">
        <span className="t-label block mb-1">Men</span>
        <input
          inputMode="numeric"
          value={men}
          onChange={(e) => setMen(e.target.value.replace(/\D/g, ""))}
          className="w-16 border border-afa-navy/30 rounded-lg px-2 py-1 text-[15px] text-center"
        />
      </label>
      <label className="block">
        <span className="t-label block mb-1">Women</span>
        <input
          inputMode="numeric"
          value={women}
          onChange={(e) => setWomen(e.target.value.replace(/\D/g, ""))}
          className="w-16 border border-afa-navy/30 rounded-lg px-2 py-1 text-[15px] text-center"
        />
      </label>
      {ask && (
        <ConfirmDialog
          title="Roster minimum"
          message={`Require at least ${men || 0} men and ${women || 0} women for this division? Teams below that are flagged, never blocked.`}
          confirmLabel="Save"
          busy={state === "saving"}
          onConfirm={save}
          onCancel={() => setAsk(false)}
        />
      )}
      {dirty && (
        <button type="button" className="btn-quiet" disabled={state === "saving"} onClick={() => setAsk(true)}>
          {state === "saving" ? "Saving…" : state === "error" ? "Try again" : "Save"}
        </button>
      )}
    </div>
  );
}
