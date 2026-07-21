"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX_DIMENSION = 1000;
const JPEG_QUALITY = 0.7;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PlacementsUpload({ divisionId, completion }) {
  const router = useRouter();
  const [championName, setChampionName] = useState(completion.championName || "");
  const [runnerUpName, setRunnerUpName] = useState(completion.runnerUpName || "");
  const [championPhoto, setChampionPhoto] = useState(null);
  const [runnerUpPhoto, setRunnerUpPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleFile(setPhoto, file) {
    if (!file) return;
    const dataUrl = await compressImage(file);
    setPhoto(dataUrl);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          champion: { teamName: championName, photoDataUrl: championPhoto },
          runnerUp: { teamName: runnerUpName, photoDataUrl: runnerUpPhoto },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="chalk-panel">
        <p className="font-semibold text-afa-navy">Champion and runner-up recorded.</p>
      </div>
    );
  }

  return (
    <div className="chalk-panel space-y-3">
      <h2 className="font-bold text-afa-navy">Record Champion &amp; Runner-Up</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold">Champion</label>
          <input
            className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
            value={championName}
            onChange={(e) => setChampionName(e.target.value)}
          />
          <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFile(setChampionPhoto, e.target.files?.[0])} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold">Runner-Up</label>
          <input
            className="w-full border border-afa-navy/30 rounded px-2 py-2 text-sm"
            value={runnerUpName}
            onChange={(e) => setRunnerUpName(e.target.value)}
          />
          <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFile(setRunnerUpPhoto, e.target.files?.[0])} />
        </div>
      </div>
      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
      <button
        type="button"
        disabled={busy || !championName || !runnerUpName}
        onClick={submit}
        className="w-full bg-afa-navy text-white font-bold py-3 rounded-lg disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
