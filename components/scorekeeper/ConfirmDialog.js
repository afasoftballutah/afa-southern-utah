"use client";

import Modal from "./Modal";

// The one confirm. JD, 2026-07-27: "can we have basic confirms for changes
// (any)?"
//
// Every change in the control center asks first, in the same dialog, with the
// same two buttons in the same order. A native window.confirm would have been
// three lines of code and a different-looking box on every browser.
//
// The message names the CONSEQUENCE, not the operation — "Rate Kaydee
// Anderson as D?" rather than "Are you sure?" — because a director confirming
// their twentieth change of the morning has stopped reading anything generic.
export default function ConfirmDialog({ title, message, confirmLabel = "Yes", busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} width="max-w-sm"
      footer={
        <>
          <button type="button" className="btn-quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="t-body">{message}</p>
    </Modal>
  );
}
