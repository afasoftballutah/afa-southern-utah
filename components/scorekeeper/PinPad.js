"use client";

import { useState } from "react";

export default function PinPad() {
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("director"); // director | scorekeeper
  const [state, setState] = useState("idle"); // idle | submitting | error
  const [error, setError] = useState("");

  async function submit(value) {
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Wrong PIN");
      // Land in the right room
      window.location.href =
        json.role === "scorekeeper" ? "/scorekeeper" : "/director";
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
      <h1 className="t-title">Staff door</h1>
      <p className="t-meta">PIN is the same. Pick who you are for this session.</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRole("director")}
          className={`rounded-xl border px-3 py-3 text-sm font-bold ${
            role === "director"
              ? "border-afa-navy bg-afa-navy text-white"
              : "border-afa-navy/20 bg-white text-afa-navy"
          }`}
        >
          Director
          <span className="block text-xs font-normal opacity-80 mt-0.5">
            Full control
          </span>
        </button>
        <button
          type="button"
          onClick={() => setRole("scorekeeper")}
          className={`rounded-xl border px-3 py-3 text-sm font-bold ${
            role === "scorekeeper"
              ? "border-afa-navy bg-afa-navy text-white"
              : "border-afa-navy/20 bg-white text-afa-navy"
          }`}
        >
          Scorekeeper
          <span className="block text-xs font-normal opacity-80 mt-0.5">
            Enter scores only
          </span>
        </button>
      </div>

      <div className="text-3xl font-mono tracking-widest text-afa-navy min-h-10">
        {"•".repeat(pin.length) || (
          <span className="text-afa-ink/30">Enter PIN</span>
        )}
      </div>
      {state === "error" && (
        <p className="text-afa-ink font-bold underline text-sm">{error}</p>
      )}
      <div className="grid grid-cols-3 gap-2 pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => tap(d)}
            className="pin-pad__key"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          className="pin-pad__key pin-pad__key--ghost"
        >
          Del
        </button>
        <button type="button" onClick={() => tap("0")} className="pin-pad__key">
          0
        </button>
        <button
          type="button"
          disabled={pin.length === 0 || state === "submitting"}
          onClick={() => submit(pin)}
          className="pin-pad__key pin-pad__key--go"
        >
          Go
        </button>
      </div>
    </div>
  );
}
