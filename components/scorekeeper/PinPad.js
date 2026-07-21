"use client";

import { useState } from "react";

export default function PinPad() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState("idle"); // idle | submitting | error
  const [error, setError] = useState("");

  async function submit(value) {
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Wrong PIN");
      window.location.reload();
    } catch (err) {
      setState("error");
      setError(err.message || "Wrong PIN");
      setPin("");
    }
  }

  function tap(digit) {
    if (state === "submitting") return;
    const next = (pin + digit).slice(0, 8);
    setPin(next);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div className="max-w-xs mx-auto space-y-4 text-center">
      <h1 className="text-xl font-bold text-afa-navy">Scorekeeper</h1>
      <div className="text-3xl font-mono tracking-widest text-afa-navy min-h-10">
        {"•".repeat(pin.length) || <span className="text-afa-ink/30">Enter PIN</span>}
      </div>
      {state === "error" && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => tap(d)}
            className="py-4 text-2xl font-bold bg-white border border-afa-navy/20 rounded-lg"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          className="py-4 text-lg font-bold text-afa-navy underline"
        >
          Del
        </button>
        <button
          type="button"
          onClick={() => tap("0")}
          className="py-4 text-2xl font-bold bg-white border border-afa-navy/20 rounded-lg"
        >
          0
        </button>
        <button
          type="button"
          disabled={pin.length === 0 || state === "submitting"}
          onClick={() => submit(pin)}
          className="py-4 text-lg font-bold text-white bg-afa-navy rounded-lg disabled:opacity-40"
        >
          Go
        </button>
      </div>
    </div>
  );
}
