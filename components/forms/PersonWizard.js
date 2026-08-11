"use client";

import { useState } from "react";
import SoftField, { FixedSummary, PageDots } from "./SoftField";
import AddressInput from "@/components/AddressInput";

/**
 * Shared person entry flow (same shape as umpire add):
 *   1) Name + contact
 *   2) Address (page 1 fixed)
 *   3) Domain extras (birth date for players, etc.)
 *
 * variants:
 *   manager — name, email, phone/cell; address; (no page 3 extras)
 *   player  — name, email (no phone); address; birth date
 *   coach   — name, email, phone; address optional page 2; no page 3
 *   addPlayer — name, email; birth date on page 2 (no address page)
 */

function displayName(p) {
  const preferred = (p.preferredName || "").trim();
  if (preferred) return preferred;
  return [p.legalFirstName, p.legalLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export default function PersonWizard({
  value,
  onChange,
  variant = "player",
  /** When true, show all pages in one scroll (for edit). */
  singlePage = false,
  /**
   * When true, render as a div (no nested form) — use inside RegistrationForm.
   * Continue/Done are type="button".
   */
  embedded = false,
  /** Called when wizard finishes last page. */
  onComplete,
  completeLabel = "Done",
  className = "",
  fieldClass = "form-field",
}) {
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const p = value || {};
  const set = (patch) => onChange({ ...p, ...patch });

  const hasPhone = variant === "manager" || variant === "coach";
  const hasCell = variant === "manager";
  const hasAddress =
    variant === "manager" || variant === "player" || variant === "coach";
  const hasBirth = variant === "player" || variant === "addPlayer";
  // addPlayer: contact then birth (2 pages). coach: contact then address (2). manager: 2 pages. player: 3.
  const totalPages =
    variant === "addPlayer"
      ? 2
      : variant === "coach"
        ? 2
        : variant === "manager"
          ? 2
          : 3;

  function page1Ok() {
    if (!String(p.legalFirstName || "").trim() || !String(p.legalLastName || "").trim())
      return false;
    if (variant === "manager" || variant === "coach") {
      if (!String(p.email || "").trim()) return false;
      if (!String(p.phone || "").trim()) return false;
    }
    // players / addPlayer: email optional but recommended — require for consistency with registration
    if (variant === "player" || variant === "addPlayer") {
      // email optional for manage-roster speed; name is enough
    }
    return true;
  }

  function goNext() {
    setError("");
    if (page === 1 && !page1Ok()) {
      setError(
        hasPhone
          ? "Name, phone, and email are needed to continue."
          : "First and last name are needed to continue."
      );
      return;
    }
    if (page < totalPages) {
      setPage(page + 1);
      return;
    }
    if (onComplete) onComplete(p);
  }

  function goBack() {
    setError("");
    setPage(Math.max(1, page - 1));
  }

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (singlePage) {
      if (!page1Ok()) {
        setError("First and last name are required.");
        return;
      }
      if (onComplete) onComplete(p);
      return;
    }
    if (page < totalPages) {
      goNext();
      return;
    }
    if (onComplete) onComplete(p);
  }

  const onLast = singlePage || page >= totalPages;
  // Embedded parent forms (registration) use their own Next — last page is
  // just "Done" (no onComplete). Standalone wizards call onComplete.
  const nav = (
    <div className="flex flex-wrap gap-2 pt-1">
      {page > 1 && !singlePage && (
        <button type="button" className="btn-transient" onClick={goBack}>
          Back
        </button>
      )}
      {(!onLast || onComplete || singlePage) && (
        <button
          type={embedded || singlePage ? "button" : "submit"}
          className="btn-action"
          onClick={embedded || singlePage ? handleSubmit : undefined}
        >
          {onLast ? completeLabel : "Continue"}
        </button>
      )}
      {onLast && embedded && !onComplete && !singlePage && (
        <p className="t-meta text-sm self-center">Use Next below when ready</p>
      )}
    </div>
  );

  const body = (
    <>
      {!singlePage && <PageDots page={page} total={totalPages} />}

      {error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {(singlePage || page === 1) && contactBlock}

      {singlePage && addressBlock}
      {singlePage && birthBlock}

      {!singlePage && page === 2 && variant === "addPlayer" && birthBlock}

      {!singlePage && page === 2 && variant !== "addPlayer" && (
        <>
          {summary}
          {addressBlock}
        </>
      )}

      {!singlePage && page === 3 && variant === "player" && (
        <>
          {summary}
          {(p.address || p.city) && (
            <FixedSummary
              lines={[
                {
                  label: "Address",
                  value: [p.address, p.city, p.state, p.zip]
                    .filter(Boolean)
                    .join(", "),
                },
              ]}
            />
          )}
          {birthBlock}
        </>
      )}

      {nav}
    </>
  );

  const contactBlock = (
    <>
      <p className="text-sm text-afa-ink/75">
        <strong className="text-afa-navy">Legal name</strong>
        {" must match a driver’s license or other official ID. "}
        <strong className="text-afa-navy">Preferred name</strong>
        {" is what shows on the roster if different."}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SoftField
          label="Legal last name"
          explainer="Legal last — as on license / ID"
          autoComplete="family-name"
          value={p.legalLastName}
          onChange={(e) => set({ legalLastName: e.target.value })}
          inputClassName={fieldClass}
        />
        <SoftField
          label="Legal first name"
          explainer="Legal first — as on license / ID"
          autoComplete="given-name"
          value={p.legalFirstName}
          onChange={(e) => set({ legalFirstName: e.target.value })}
          inputClassName={fieldClass}
        />
      </div>
      <SoftField
        label="Preferred name"
        explainer="Preferred name on the roster (optional)"
        value={p.preferredName}
        onChange={(e) => set({ preferredName: e.target.value })}
        inputClassName={fieldClass}
      />
      {hasPhone && (
        <SoftField
          label="Phone"
          explainer="Phone"
          type="tel"
          autoComplete="tel"
          value={p.phone}
          onChange={(e) => set({ phone: e.target.value })}
          inputClassName={fieldClass}
        />
      )}
      {hasCell && (
        <SoftField
          label="Cell"
          explainer="Cell (optional)"
          type="tel"
          value={p.cell}
          onChange={(e) => set({ cell: e.target.value })}
          inputClassName={fieldClass}
        />
      )}
      <SoftField
        label="Email"
        explainer={
          variant === "player" || variant === "addPlayer"
            ? "Email (optional)"
            : "Email"
        }
        type="email"
        autoComplete="email"
        value={p.email}
        onChange={(e) => set({ email: e.target.value })}
        inputClassName={fieldClass}
      />
    </>
  );

  const addressBlock = hasAddress && (
    <>
      <p className="text-sm text-afa-ink/75">
        <strong className="text-afa-navy">Address</strong>
        {
          " must match a driver’s license or other official document (waiver)."
        }
      </p>
      <label className="block">
        <span className="t-label block mb-1 min-h-[1rem]">
          Street (as on license / ID)
        </span>
        <AddressInput
          value={p.address || ""}
          onChange={(v) => set({ address: v })}
          onPlace={(place) =>
            set({
              address: place.formatted || place.street || p.address,
              city: place.city || p.city,
              state: place.state || p.state,
              zip: place.zip || p.zip,
            })
          }
          name="address-line1"
          placeholder="Street address as on license / official ID"
          className={fieldClass}
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <SoftField
          label="City"
          explainer="City"
          value={p.city}
          onChange={(e) => set({ city: e.target.value })}
          inputClassName={fieldClass}
        />
        <SoftField
          label="State"
          explainer="ST"
          value={p.state}
          onChange={(e) => set({ state: e.target.value })}
          inputClassName={fieldClass}
        />
        <SoftField
          label="Zip"
          explainer="Zip"
          value={p.zip}
          onChange={(e) => set({ zip: e.target.value })}
          inputClassName={fieldClass}
        />
      </div>
      <p className="t-meta text-xs">
        Optional for now — the player can add it when they sign if needed.
      </p>
    </>
  );

  const birthBlock = hasBirth && (
    <SoftField
      label="Birth date"
      explainer="Birth date (for the waiver)"
      type="date"
      value={p.birthDate}
      onChange={(e) => set({ birthDate: e.target.value })}
      inputClassName={fieldClass}
    />
  );

  const summary = (
    <FixedSummary
      lines={[
        { label: "Name", value: displayName(p) },
        { label: "Phone", value: p.phone },
        { label: "Email", value: p.email },
      ]}
      onEdit={() => setPage(1)}
      editLabel="Edit contact"
    />
  );

  if (embedded || singlePage) {
    return <div className={"space-y-3 " + className}>{body}</div>;
  }

  return (
    <form
      className={"space-y-3 " + className}
      onSubmit={handleSubmit}
      noValidate
    >
      {body}
    </form>
  );
}

export { displayName as personWizardDisplayName };
