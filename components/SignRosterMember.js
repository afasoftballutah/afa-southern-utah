"use client";

import { useEffect, useState } from "react";
import { writeMe } from "@/lib/me";
import SignaturePad from "./SignaturePad";
import AddressInput from "./AddressInput";
import SoftField from "@/components/forms/SoftField";
import LegalIdBox from "@/components/forms/LegalIdBox";
import { RELEASE_TEXT } from "@/lib/waiver";

const ROLE_VERB = { player: "playing on", coach: "coaching", manager: "managing" };

/** Identity attestation — shown next to the AFA release (which stays verbatim). */
export const ID_ATTESTATION_TEXT =
  "I certify that the information I provide on this form — including my legal name, preferred name (if any), date of birth, gender, email, and address — is true and correct, and is consistent with official identification that I can present on game day (for example a driver’s license or other government-issued ID).";

function splitName(full) {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// Players (and managers who play) complete their own identity here. Managers
// only put first/last + gender on the roster; the rest is the player's job.
export default function SignRosterMember({ token, member }) {
  useEffect(() => {
    if (member.alreadySigned && member.teamName) {
      writeMe({ name: member.name, teamName: member.teamName, source: "signed" });
    }
  }, [member.alreadySigned, member.name, member.teamName]);

  const needsPlayerFields = member.role === "player" || member.role === "manager";
  const fromManager = splitName(member.name);

  const [legalFirstName, setLegalFirstName] = useState(
    member.legalFirstName || fromManager.first || ""
  );
  const [legalLastName, setLegalLastName] = useState(
    member.legalLastName || fromManager.last || ""
  );
  // Default preferred to first name only (what shows on the roster).
  const [preferredName, setPreferredName] = useState(
    member.preferredName ||
      member.legalFirstName ||
      fromManager.first ||
      ""
  );
  const [gender, setGender] = useState(member.gender ?? "");
  const [birthDate, setBirthDate] = useState(member.birthDate ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [address, setAddress] = useState(member.address ?? "");
  const [idAttested, setIdAttested] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [state, setState] = useState(member.alreadySigned ? "done" : "idle");
  const [error, setError] = useState("");

  const playerReady =
    !needsPlayerFields ||
    (legalFirstName.trim() &&
      legalLastName.trim() &&
      (gender === "M" || gender === "F") &&
      birthDate &&
      email.trim().length > 0 &&
      address.trim().length > 0 &&
      idAttested);

  const canSign =
    agreed &&
    signature &&
    state !== "submitting" &&
    playerReady;

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
          legalFirstName: legalFirstName.trim(),
          legalLastName: legalLastName.trim(),
          preferredName: preferredName.trim() || null,
          gender: gender || null,
          email: email.trim(),
          address: address.trim() || null,
          birthDate: birthDate || null,
          idAttested: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save your signature");
      const display =
        preferredName.trim() ||
        [legalFirstName, legalLastName].filter(Boolean).join(" ") ||
        member.name;
      writeMe({ name: display, teamName: member.teamName, source: "signed" });
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
          {preferredName.trim() ||
            [legalFirstName, legalLastName].filter(Boolean).join(" ") ||
            member.name}
          , you&rsquo;re on record for{" "}
          {ROLE_VERB[member.role] ?? ROLE_VERB.player} this team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {member.name && (
        <p className="t-meta">
          Roster name from your manager:{" "}
          <span className="font-semibold text-afa-navy">{member.name}</span>
          {member.gender ? ` · ${member.gender}` : ""}
        </p>
      )}

      {needsPlayerFields && (
        <div className="space-y-3 form-surface p-3">
          <p className="t-strong text-sm">Your information</p>
          <p className="t-meta">Complete this yourself.</p>

          <LegalIdBox detail="You must be able to present that ID on game day.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SoftField
                label="Legal first name"
                explainer="As on license / ID"
                value={legalFirstName}
                onChange={(e) => setLegalFirstName(e.target.value)}
                autoComplete="given-name"
              />
              <SoftField
                label="Legal last name"
                explainer="As on license / ID"
                value={legalLastName}
                onChange={(e) => setLegalLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
            <label className="block">
              <span className="form-label">
                Address (as on license / official ID)
              </span>
              <AddressInput
                value={address}
                onChange={setAddress}
                placeholder="Street address as on license or official document"
                required
              />
            </label>
          </LegalIdBox>

          <SoftField
            label="Preferred name"
            explainer="Optional — what you go by on rosters / score sheets"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            autoComplete="nickname"
          />
          <fieldset>
            <legend className="form-label mb-1">Gender</legend>
            <div className="flex gap-2">
              {["M", "F"].map((g) => (
                <button
                  key={g}
                  type="button"
                  className={
                    "flex-1 rounded-lg border-2 px-3 py-2 font-bold text-sm " +
                    (gender === g
                      ? "border-afa-navy bg-afa-navy text-white"
                      : "border-afa-navy/20 bg-white text-afa-navy")
                  }
                  onClick={() => setGender(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </fieldset>
          <SoftField
            label="Birth date"
            explainer="YYYY-MM-DD"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            autoComplete="bday"
          />
          <SoftField
            label="Email"
            explainer="Contact email (required)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      )}

      {/* Coaches: show name only (manager already collected contact) */}
      {!needsPlayerFields && (
        <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="font-semibold">Name on roster</dt>
          <dd>{member.name}</dd>
          {member.email && (
            <>
              <dt className="font-semibold">Email</dt>
              <dd>{member.email}</dd>
            </>
          )}
          {member.phone && (
            <>
              <dt className="font-semibold">Phone</dt>
              <dd>{member.phone}</dd>
            </>
          )}
        </dl>
      )}

      <div className="max-h-48 overflow-y-auto rounded-xl bg-white p-3 text-sm card">
        {RELEASE_TEXT}
      </div>

      {needsPlayerFields && (
        <label className="register-agree">
          <input
            type="checkbox"
            className="register-agree__box"
            checked={idAttested}
            onChange={(e) => setIdAttested(e.target.checked)}
          />
          <span className="register-agree__text">{ID_ATTESTATION_TEXT}</span>
        </label>
      )}

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
