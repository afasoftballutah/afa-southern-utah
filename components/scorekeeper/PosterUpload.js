"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// The tournament's poster. Two icon buttons, because the words "Replace
// poster" and "Remove" took more room than the picture did.
//
// JD, 2026-07-27: "replace poster/remove poster should just be a little edit
// pic and a x pic and both should have a popup to confirm."
//
// A file input rather than a URL box: a director has a flyer on their phone,
// not a hosted image. Both actions confirm, because this picture is the front
// of the tournament's PUBLIC page.
export default function PosterUpload({ tournamentId, posterUrl }) {
  const [url, setUrl] = useState(posterUrl ?? null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(null); // "replace" | "remove"
  const [show, setShow] = useState(false);
  const [staged, setStaged] = useState(null);
  const input = useRef(null);

  async function send(dataUrl) {
    setAsk(null);
    setState("saving");
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPoster", tournamentId, dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setUrl(json.posterUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setState("idle");
      setStaged(null);
    }
  }

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file twice still fires
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStaged(String(reader.result));
      // A poster replacing nothing needs no warning; replacing one does.
      if (url) setAsk("replace");
      else send(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {url ? (
        // Clicking the thumbnail shows it full size. A poster is a picture of
        // a flyer with dates and prices on it, and 36 pixels tall is not
        // enough to check any of that (JD, 2026-07-28).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onClick={() => setShow(true)}
          className="h-9 w-auto rounded border border-afa-navy/15 cursor-zoom-in"
        />
      ) : (
        <span className="t-meta">None</span>
      )}
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
      {/* Stacked, so two small icons read as one control rather than joining
          the row of fields beside them. */}
      <span className="inline-flex flex-col gap-0.5">
        <button
          type="button"
          className="pill px-1.5 py-0 leading-none"
          aria-label={url ? "Replace poster" : "Upload poster"}
          title={url ? "Replace poster" : "Upload poster"}
          disabled={state === "saving"}
          onClick={() => input.current?.click()}
        >
          {state === "saving" ? "…" : "✎"}
        </button>
        {url && (
          <button
            type="button"
            className="pill px-1.5 py-0 leading-none text-afa-red border-afa-red/30"
            aria-label="Remove poster"
            title="Remove poster"
            disabled={state === "saving"}
            onClick={() => setAsk("remove")}
          >
            ✕
          </button>
        )}
      </span>
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}

      {show && url && (
        <span
          className="fixed inset-0 z-50 bg-afa-ink/70 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setShow(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Tournament poster" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </span>
      )}

      {ask === "replace" && (
        <ConfirmDialog
          title="Replace the poster"
          message="Put this image on the tournament's public page in place of the current one?"
          confirmLabel="Replace it"
          busy={state === "saving"}
          onConfirm={() => send(staged)}
          onCancel={() => {
            setAsk(null);
            setStaged(null);
          }}
        />
      )}
      {ask === "remove" && (
        <ConfirmDialog
          title="Remove the poster"
          message="Take the poster off the tournament's public page?"
          confirmLabel="Remove it"
          busy={state === "saving"}
          onConfirm={() => send(null)}
          onCancel={() => setAsk(null)}
        />
      )}
    </span>
  );
}
