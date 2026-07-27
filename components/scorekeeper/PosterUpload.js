"use client";

import { useRef, useState } from "react";

// The tournament's poster, uploaded where its terms are edited.
//
// JD, 2026-07-27: "that one should also have a poster upload link."
//
// A file input rather than a URL box: a director has a flyer on their phone,
// not a hosted image. The `posters` bucket is public, which is right — this
// picture is the front of the tournament's public page.
export default function PosterUpload({ tournamentId, posterUrl }) {
  const [url, setUrl] = useState(posterUrl ?? null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const input = useRef(null);

  async function send(dataUrl) {
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
      setState("idle");
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }

  function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => send(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Tournament poster" className="h-12 w-auto rounded border border-afa-navy/15" />
      )}
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
      <button type="button" className="pill" disabled={state === "saving"} onClick={() => input.current?.click()}>
        {state === "saving" ? "Uploading…" : url ? "Replace poster" : "Upload poster"}
      </button>
      {url && (
        <button type="button" className="pill" disabled={state === "saving"} onClick={() => send(null)}>
          Remove
        </button>
      )}
      {error && <span className="t-meta text-afa-red font-semibold">{error}</span>}
    </div>
  );
}
