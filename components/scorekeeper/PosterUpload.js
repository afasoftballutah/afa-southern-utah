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
    <span className="inline-flex items-center gap-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-9 w-auto rounded border border-afa-navy/15" />
      ) : (
        <span className="t-meta">None</span>
      )}
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
      <button
        type="button"
        className="pill"
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
          className="pill"
          aria-label="Remove poster"
          title="Remove poster"
          disabled={state === "saving"}
          onClick={() => setAsk("remove")}
        >
          ✕
        </button>
      )}
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}

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
