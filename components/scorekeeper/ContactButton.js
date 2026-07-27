"use client";

import { useState } from "react";
import Modal from "./Modal";

// One Contact button rather than Text · Call · email strung across a cell.
// Three links inline pushed the row wide and read as three separate things
// when they are one job: reach this person.
export default function ContactButton({ name, phone, email, via }) {
  const [open, setOpen] = useState(false);
  if (!phone && !email) return null;
  const digits = String(phone ?? "").replace(/\D/g, "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pill"
      >
        Contact
      </button>

      {open && (
        <Modal
          title={name}
          subtitle={via ? `via ${via}, their manager` : null}
          onClose={() => setOpen(false)}
          width="max-w-sm"
        >
          {phone && (
            <div className="space-y-2">
              <p className="t-label">Phone</p>
              <p className="t-body tabular-nums">{phone}</p>
              <div className="flex gap-2">
                <a className="btn flex-1" href={`sms:${digits}`}>Text</a>
                <a className="btn-quiet flex-1" href={`tel:${digits}`}>Call</a>
              </div>
            </div>
          )}
          {email && (
            <div className="space-y-2">
              <p className="t-label">Email</p>
              <a className="t-body text-afa-navy underline break-all block" href={`mailto:${email}`}>
                {email}
              </a>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
