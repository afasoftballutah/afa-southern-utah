"use client";

import { useState } from "react";
import Modal from "./Modal";
import SoftField from "@/components/forms/SoftField";
import LegalIdBox from "@/components/forms/LegalIdBox";
import { RATINGS } from "@/lib/class";

function splitName(full) {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function initialForm(player) {
  const fromLegalFirst = String(player.legal_first_name ?? "").trim();
  const fromLegalLast = String(player.legal_last_name ?? "").trim();
  const split = splitName(player.full_name);
  return {
    legalFirstName: fromLegalFirst || split.first,
    legalLastName: fromLegalLast || split.last,
    preferredName: String(player.preferred_name ?? "").trim(),
    birthDate: player.birth_date ?? "",
    email: String(player.email ?? "").trim(),
    address: String(player.address ?? "").trim(),
    gender: player.gender ?? "",
    rating: player.rating ?? "",
  };
}

/**
 * Full edit of a player directory record (name, DOB, email, M/F, rating).
 * Inline selects still handle quick rating/gender; this is for everything else.
 */
export default function EditPlayer({ player }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialForm(player));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setForm(initialForm(player));
    setError("");
    setOpen(true);
  }

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function save() {
    const legalFirstName = form.legalFirstName.trim();
    const legalLastName = form.legalLastName.trim();
    if (!legalFirstName || !legalLastName) {
      setError("Legal first and last name are required (as on a license or ID).");
      return;
    }
    if (!form.birthDate) {
      setError("Birth date is required so we can match this person later.");
      return;
    }
    if (!form.email.trim()) {
      setError("Contact email is required.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePlayer",
          playerId: player.id,
          legalFirstName,
          legalLastName,
          preferredName: form.preferredName.trim() || null,
          birthDate: form.birthDate,
          email: form.email.trim(),
          address: form.address.trim() || null,
          gender: form.gender || null,
          rating: form.rating || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="pill" onClick={openEditor}>
        Edit
      </button>

      {open && (
        <Modal
          title={`Edit ${player.full_name}`}
          onClose={() => !busy && setOpen(false)}
          width="max-w-lg"
          footer={
            <>
              <button
                type="button"
                className="btn-transient"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving…" : "Save player"}
              </button>
            </>
          }
        >
          <LegalIdBox detail="Preferred name (below) is what shows on rosters if different.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SoftField
                label="Legal first name"
                explainer="As on license / ID"
                value={form.legalFirstName}
                onChange={set("legalFirstName")}
                autoComplete="given-name"
              />
              <SoftField
                label="Legal last name"
                explainer="As on license / ID"
                value={form.legalLastName}
                onChange={set("legalLastName")}
                autoComplete="family-name"
              />
            </div>
            <SoftField
              label="Address"
              explainer="As on license / official ID"
              value={form.address}
              onChange={set("address")}
              autoComplete="street-address"
            />
          </LegalIdBox>
          <SoftField
            label="Preferred name"
            explainer="Optional — what they go by on rosters"
            value={form.preferredName}
            onChange={set("preferredName")}
            autoComplete="nickname"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SoftField
              label="Birth date"
              explainer="YYYY-MM-DD"
              type="date"
              value={form.birthDate}
              onChange={set("birthDate")}
              autoComplete="bday"
            />
            <SoftField
              label="Email"
              explainer="Contact email (required)"
              type="email"
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="t-label block mb-1">M / F</span>
              <select
                value={form.gender}
                onChange={set("gender")}
                className="form-field w-full"
              >
                <option value="">Not set</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </label>
            <label className="block">
              <span className="t-label block mb-1">Class</span>
              <select
                value={form.rating}
                onChange={set("rating")}
                className="form-field w-full"
              >
                <option value="">Unranked</option>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p className="t-meta text-afa-red font-semibold">{error}</p>
          )}
        </Modal>
      )}
    </>
  );
}
