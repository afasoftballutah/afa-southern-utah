"use client";

import { useEffect, useState } from "react";

// One "Contact" button rather than Text · Call · email strung across a cell.
// Three links inline pushed the row wide and read as three separate things
// when they are one job: reach this person.
export default function ContactButton({ name, phone, email, via }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!phone && !email) return null;
  const digits = String(phone ?? "").replace(/\D/g, "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-label text-afa-navy underline decoration-afa-navy/30 underline-offset-2 min-h-0 py-0"
      >
        Contact
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-xs p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="t-strong">{name}</p>
                {via && <p className="t-meta">via {via}, their manager</p>}
              </div>
              <button type="button" className="t-label underline min-h-0 py-0" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {phone && (
              <div className="space-y-1">
                <p className="t-meta">{phone}</p>
                <div className="flex gap-2">
                  <a className="btn-quiet flex-1 text-center" href={`sms:${digits}`}>Text</a>
                  <a className="btn-quiet flex-1 text-center" href={`tel:${digits}`}>Call</a>
                </div>
              </div>
            )}
            {email && (
              <a className="btn-quiet w-full block text-center break-all" href={`mailto:${email}`}>
                {email}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
