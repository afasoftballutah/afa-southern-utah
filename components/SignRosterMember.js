"use client";

import { useState } from "react";
import SignaturePad from "./SignaturePad";
import { RELEASE_TEXT } from "@/lib/waiver";

export default function SignRosterMember({ token, member }) {
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [state, setState] = useState(member.alreadySigned ? "done" : "idle");
  const [error, setError] = useState("");

  async function submit() {
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/register/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signaturePng: signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save your signature");
      setState("done");
    } catch (err) {
      setState("error");
      setError(err.message || "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="chalk-panel p-4">
        <p className="font-semibold text-afa-navy">
          {member.alreadySigned ? "Already signed — thanks." : "Signed. Thanks."}
        </p>
        <p className="text-sm text-afa-ink/70 mt-1">
          {member.name}, you&rsquo;re on record for {member.role === "coach" ? "coaching" : "playing on"} this team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="font-semibold">Name</dt>
        <dd>{member.name}</dd>
        {member.role === "player" && (
          <>
            <dt className="font-semibold">Birth Date</dt>
            <dd>{member.birthDate || "—"}</dd>
            <dt className="font-semibold">Address</dt>
            <dd>{member.address || "—"}</dd>
          </>
        )}
        {member.role === "coach" && (
          <>
            <dt className="font-semibold">Email</dt>
            <dd>{member.email || "—"}</dd>
            <dt className="font-semibold">Phone</dt>
            <dd>{member.phone || "—"}</dd>
          </>
        )}
      </dl>

      <div className="max-h-48 overflow-y-auto chalk-panel p-3 text-sm">{RELEASE_TEXT}</div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        I have read this release and waiver of liability and I agree to it.
      </label>

      <div>
        <p className="font-semibold text-sm mb-1">Your Signature</p>
        <SignaturePad onChange={setSignature} />
      </div>

      {state === "error" && <p className="text-afa-ink text-sm font-bold underline">{error}</p>}

      <button
        type="button"
        disabled={!agreed || !signature || state === "submitting"}
        onClick={submit}
        className="w-full bg-afa-red text-white font-bold py-3 rounded-lg disabled:opacity-40"
      >
        {state === "submitting" ? "Submitting…" : "Sign"}
      </button>
    </div>
  );
}
