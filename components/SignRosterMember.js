"use client";

import { useEffect, useState } from "react";
import { writeMe } from "@/lib/me";
import SignaturePad from "./SignaturePad";
import AddressInput from "./AddressInput";
import { RELEASE_TEXT } from "@/lib/waiver";

const ROLE_VERB = { player: "playing on", coach: "coaching", manager: "managing" };

// Players (and managers who play) enter their own address here if the manager
// left it blank — managers shouldn't have to type everyone else's street.
export default function SignRosterMember({ token, member }) {
  // Someone opening a link they already used is still telling us who they
  // are — remember it without making them sign twice.
  useEffect(() => {
    if (member.alreadySigned && member.teamName) {
      writeMe({ name: member.name, teamName: member.teamName, source: "signed" });
    }
  }, [member.alreadySigned, member.name, member.teamName]);

  const needsPlayerFields = member.role === "player" || member.role === "manager";

  const [birthDate, setBirthDate] = useState(member.birthDate ?? "");
  const [address, setAddress] = useState(member.address ?? "");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [state, setState] = useState(member.alreadySigned ? "done" : "idle");
  const [error, setError] = useState("");

  const canSign =
    agreed &&
    signature &&
    state !== "submitting" &&
    (!needsPlayerFields || address.trim().length > 0);

  async function submit() {
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/register/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signaturePng: signature,
          address: address.trim() || null,
          birthDate: birthDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save your signature");
      // Signing is the strongest thing this device will ever learn: the
      // person AND their team. Remember it so every page after this one
      // leads with them, this tournament and the next.
      writeMe({ name: member.name, teamName: member.teamName, source: "signed" });
      setState("done");
    } catch (err) {
      setState("error");
      setError(err.message || "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-4">
        <p className="font-semibold text-afa-navy">
          {member.alreadySigned ? "Already signed — thanks." : "Signed. Thanks."}
        </p>
        <p className="text-sm text-afa-ink/70 mt-1">
          {member.name}, you&rsquo;re on record for{" "}
          {ROLE_VERB[member.role] ?? ROLE_VERB.player} this team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="font-semibold">Name</dt>
        <dd>{member.name}</dd>
        {(member.email || member.phone) && (
          <>
            <dt className="font-semibold">Email</dt>
            <dd>{member.email || "—"}</dd>
            <dt className="font-semibold">Phone</dt>
            <dd>{member.phone || "—"}</dd>
          </>
        )}
      </dl>

      {needsPlayerFields && (
        <div className="space-y-3 form-surface p-3">
          <label className="block">
            <span className="form-label">Birth date</span>
            <input
              type="date"
              className="form-field"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="form-label">Address</span>
            <AddressInput
              value={address}
              onChange={setAddress}
              placeholder="Start typing your address…"
              required
            />
          </label>
          <p className="t-meta">
            Your address goes on the AFA waiver. Only you fill this in.
          </p>
        </div>
      )}

      <div className="max-h-48 overflow-y-auto rounded-xl bg-white p-3 text-sm card">
        {RELEASE_TEXT}
      </div>

      <label className="register-agree">
        <input
          type="checkbox"
          className="register-agree__box"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="register-agree__text">
          I have read this release and waiver of liability and I agree to it.
        </span>
      </label>

      <div>
        <p className="font-semibold text-sm mb-1">Your Signature</p>
        <SignaturePad onChange={setSignature} />
      </div>

      {state === "error" && (
        <p className="text-afa-ink text-sm font-bold underline">{error}</p>
      )}

      <button
        type="button"
        disabled={!canSign}
        onClick={submit}
        className="btn-action-block disabled:opacity-40"
      >
        {state === "submitting" ? "Submitting…" : "Sign"}
      </button>
    </div>
  );
}
