"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const empty = () => ({
  firstName: "",
  lastName: "",
  preferredName: "",
  cardNumber: "",
  address: "",
  city: "",
  state: "UT",
  zip: "",
  phone: "",
  email: "",
  // Neither selected until they tap — keeps pitch block highlighted
  pitchFast: false,
  pitchSlow: false,
  status: "active",
  notes: "",
});

function umpDisplay(u) {
  const p = (u.preferredName || "").trim();
  if (p) return p;
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
}

function pitchKind(u) {
  if (u.pitchFast && u.pitchSlow) {
    return {
      key: "both",
      label: "Both",
      short: "B",
      chip: "bg-emerald-100 text-emerald-900 border-emerald-300",
      bar: "border-l-emerald-500",
      avatar: "bg-emerald-700 text-white",
    };
  }
  if (u.pitchFast) {
    return {
      key: "fast",
      label: "Fast",
      short: "F",
      chip: "bg-red-100 text-red-900 border-red-300",
      bar: "border-l-afa-red",
      avatar: "bg-afa-red text-white",
    };
  }
  if (u.pitchSlow) {
    return {
      key: "slow",
      label: "Slow",
      short: "S",
      chip: "bg-sky-100 text-sky-950 border-sky-300",
      bar: "border-l-sky-600",
      avatar: "bg-afa-navy text-white",
    };
  }
  return {
    key: "none",
    label: "—",
    short: "?",
    chip: "bg-afa-navy/5 text-afa-muted border-afa-navy/15",
    bar: "border-l-afa-navy/20",
    avatar: "bg-afa-navy/20 text-afa-navy",
  };
}

function initials(u) {
  const display = umpDisplay(u);
  if (display) {
    const parts = display.split(/\s+/);
    if (parts.length >= 2) {
      return (
        (parts[0][0] || "") + (parts[parts.length - 1][0] || "")
      ).toUpperCase();
    }
    return display.slice(0, 2).toUpperCase();
  }
  const a = (u.firstName || "").trim()[0] || "";
  const b = (u.lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

/**
 * Empty: explainer lives inside the field (placeholder).
 * Only the *next* incomplete step is highlighted (isNext) so the eye has one target.
 * Filled: short label above + calm green border.
 */
function PromptField({
  label,
  explainer,
  value,
  onChange,
  required = false,
  isNext = false,
  type = "text",
  autoComplete,
  className = "",
  inputRef,
}) {
  const [focused, setFocused] = useState(false);
  const filled = String(value ?? "").trim().length > 0;
  const showLabel = filled || focused;

  useEffect(() => {
    if (isNext && inputRef?.current) {
      // Small delay so the form is painted
      const t = setTimeout(() => {
        try {
          inputRef.current?.focus({ preventScroll: false });
          inputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        } catch {
          inputRef.current?.focus();
        }
      }, 80);
      return () => clearTimeout(t);
    }
  }, [isNext, inputRef]);

  return (
    <label
      className={
        "block transition-all " +
        (isNext ? "relative z-10 " : filled || !required ? "" : "opacity-55 ") +
        className
      }
    >
      {isNext && (
        <span className="inline-flex items-center gap-1.5 mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950 text-[10px]">
            →
          </span>
          Do this next
        </span>
      )}
      <span
        className={
          "t-label block transition-all " +
          (showLabel
            ? "mb-1 opacity-100 h-auto"
            : "mb-0 opacity-0 h-0 overflow-hidden")
        }
      >
        {label}
        {!required ? " · optional" : ""}
      </span>
      <input
        ref={inputRef}
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={showLabel ? "" : explainer}
        className={
          "w-full rounded-xl border-2 px-3 py-3 text-[15px] transition-all focus:outline-none " +
          (isNext
            ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(251,191,36,0.35)] placeholder:text-amber-900/60 focus:border-amber-500"
            : filled
              ? "border-emerald-300 bg-white focus:border-afa-navy/40 focus:ring-2 focus:ring-afa-navy/15"
              : "border-afa-navy/12 bg-afa-soft-gray/40 placeholder:text-afa-muted/80 focus:border-afa-navy/30 focus:ring-2 focus:ring-afa-navy/10")
        }
      />
    </label>
  );
}

/**
 * Clear zones only:
 *  1. Add button (primary action)
 *  2. Filters — only when roster has people
 *  3. Roster list
 *  4. Form — only when adding/editing
 */
export default function UmpireRoster({ initial = [], canEdit = true }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  // Empty roster → form open so the first job is obvious
  const [formOpen, setFormOpen] = useState(initial.length === 0 && canEdit);
  const [showMore, setShowMore] = useState(false);

  const counts = useMemo(() => {
    let all = list.length;
    let active = 0;
    let slow = 0;
    let fast = 0;
    let both = 0;
    let inactive = 0;
    for (const u of list) {
      if (u.status === "inactive") {
        inactive += 1;
        continue;
      }
      active += 1;
      if (u.pitchFast && u.pitchSlow) both += 1;
      else if (u.pitchFast) fast += 1;
      else if (u.pitchSlow) slow += 1;
    }
    return { all, active, slow, fast, both, inactive };
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((u) => {
      if (filter === "inactive") return u.status === "inactive";
      if (filter === "slow")
        return u.pitchSlow && !u.pitchFast && u.status !== "inactive";
      if (filter === "fast")
        return u.pitchFast && !u.pitchSlow && u.status !== "inactive";
      if (filter === "both")
        return u.pitchFast && u.pitchSlow && u.status !== "inactive";
      if (filter === "active") return u.status !== "inactive";
      return true;
    });
  }, [list, filter]);

  function openAdd() {
    setEditingId(null);
    setForm(empty());
    setError("");
    setShowMore(false);
    setFormOpen(true);
    setTimeout(() => {
      document.getElementById("umpire-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function startEdit(u) {
    setEditingId(u.id);
    setForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      preferredName: u.preferredName || "",
      cardNumber: u.cardNumber || "",
      address: u.address || "",
      city: u.city || "",
      state: u.state || "",
      zip: u.zip || "",
      phone: u.phone || "",
      email: u.email || "",
      pitchFast: !!u.pitchFast,
      pitchSlow: !!u.pitchSlow,
      status: u.status || "active",
      notes: u.notes || "",
    });
    setError("");
    setShowMore(true); // edit: show contact/details too
    setFormOpen(true);
    setTimeout(() => {
      document.getElementById("umpire-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(empty());
    setError("");
    setShowMore(false);
    setFormOpen(false);
  }

  function setPitch(mode) {
    if (mode === "both") setForm({ ...form, pitchSlow: true, pitchFast: true });
    else if (mode === "fast")
      setForm({ ...form, pitchSlow: false, pitchFast: true });
    else setForm({ ...form, pitchSlow: true, pitchFast: false });
  }

  async function save(e) {
    e.preventDefault();
    if (!canEdit) return;
    if (!form.pitchFast && !form.pitchSlow) {
      setError("Pick Slow, Fast, or Both");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/umpires", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      const row = json.umpire;
      setList((prev) => {
        if (editingId) {
          return prev
            .map((u) => (u.id === row.id ? row : u))
            .sort((a, b) =>
              `${a.lastName}${a.firstName}`.localeCompare(
                `${b.lastName}${b.firstName}`
              )
            );
        }
        return [...prev, row].sort((a, b) =>
          `${a.lastName}${a.firstName}`.localeCompare(
            `${b.lastName}${b.firstName}`
          )
        );
      });
      cancelForm();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const pitchMode =
    form.pitchFast && form.pitchSlow
      ? "both"
      : form.pitchFast
        ? "fast"
        : form.pitchSlow
          ? "slow"
          : null;
  const pitchPicked = pitchMode != null;

  // Core path only — not every field on the form
  const steps = [
    {
      key: "lastName",
      done: Boolean(String(form.lastName).trim()),
      label: "Legal last name",
    },
    {
      key: "firstName",
      done: Boolean(String(form.firstName).trim()),
      label: "Legal first name",
    },
    { key: "pitch", done: pitchPicked, label: "Pitch type" },
  ];
  const nextStep = steps.find((s) => !s.done)?.key ?? "save";
  const requiredLeft = steps.filter((s) => !s.done).length;
  const stepIndex = steps.findIndex((s) => s.key === nextStep);
  const stepN = stepIndex >= 0 ? stepIndex + 1 : steps.length;

  const refLast = useRef(null);
  const refFirst = useRef(null);
  const refPitch = useRef(null);

  useEffect(() => {
    if (!formOpen) return;
    if (nextStep === "pitch" && refPitch.current) {
      refPitch.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [nextStep, formOpen]);

  const filterTabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "slow", label: "Slow", count: counts.slow, color: "sky" },
    { key: "fast", label: "Fast", count: counts.fast, color: "red" },
    { key: "both", label: "Both", count: counts.both, color: "green" },
    ...(counts.inactive > 0
      ? [{ key: "inactive", label: "Inactive", count: counts.inactive, color: "muted" }]
      : []),
  ];

  function chipClass(tab, on) {
    if (on) {
      if (tab.color === "sky") return "bg-sky-700 text-white border-sky-700";
      if (tab.color === "red") return "bg-afa-red text-white border-afa-red";
      if (tab.color === "green")
        return "bg-emerald-700 text-white border-emerald-700";
      if (tab.color === "muted") return "bg-afa-muted text-white border-afa-muted";
      return "bg-afa-navy text-white border-afa-navy";
    }
    if (tab.color === "sky")
      return "bg-white text-sky-950 border-sky-200 hover:border-sky-400";
    if (tab.color === "red")
      return "bg-white text-red-900 border-red-200 hover:border-red-400";
    if (tab.color === "green")
      return "bg-white text-emerald-900 border-emerald-200 hover:border-emerald-400";
    if (tab.color === "muted")
      return "bg-white text-afa-muted border-afa-navy/15";
    return "bg-white text-afa-navy border-afa-navy/20 hover:border-afa-navy/40";
  }

  // ---- FORM (add / edit) ----
  const formCard = formOpen && canEdit && (
    <form
      id="umpire-form"
      onSubmit={save}
      className="rounded-xl border-2 border-afa-navy/20 bg-white shadow-sm overflow-hidden max-w-2xl"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-afa-navy text-white">
        <div>
          <p className="font-bold text-base">
            {editingId ? "Edit umpire" : "Add umpire"}
          </p>
          <p className="text-xs text-white/75 mt-0.5">
            {nextStep === "save"
              ? "Done — tap Save"
              : `Step ${stepN} of ${steps.length} — ${steps.find((s) => s.key === nextStep)?.label}`}
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold underline text-white/90 shrink-0"
          onClick={cancelForm}
        >
          Cancel
        </button>
      </div>

      <div className="p-4 space-y-4 max-w-md">
        {error && (
          <p
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Done so far — compact, not full fields */}
        {steps.some((s) => s.done) && (
          <ul className="space-y-1">
            {steps
              .filter((s) => s.done)
              .map((s) => {
                let value = "";
                if (s.key === "lastName") value = form.lastName;
                if (s.key === "firstName") value = form.firstName;
                if (s.key === "pitch")
                  value =
                    pitchMode === "both"
                      ? "Both"
                      : pitchMode === "fast"
                        ? "Fast"
                        : "Slow";
                return (
                  <li
                    key={s.key}
                    className="flex items-center gap-2 text-sm text-emerald-900"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                      ✓
                    </span>
                    <span className="t-meta">{s.label}:</span>
                    <span className="font-semibold">{value}</span>
                  </li>
                );
              })}
          </ul>
        )}

        {/* ONLY the current action field — not the whole form */}
        {nextStep === "lastName" && (
          <PromptField
            label="Legal last name"
            explainer="Legal last name (as on AFA card)"
            required
            isNext
            inputRef={refLast}
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        )}
        {nextStep === "firstName" && (
          <PromptField
            label="Legal first name"
            explainer="Legal first name (as on AFA card)"
            required
            isNext
            inputRef={refFirst}
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        )}
        {nextStep === "pitch" && (
          <div
            ref={refPitch}
            className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 shadow-[0_0_0_4px_rgba(251,191,36,0.35)]"
          >
            <span className="inline-flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950 text-[10px]">
                →
              </span>
              Do this next
            </span>
            <p className="text-sm font-semibold text-amber-950 mb-2">
              Tap pitch type — Slow, Fast, or Both
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  mode: "slow",
                  label: "Slow",
                  letter: "S",
                  on: "border-sky-700 bg-sky-700 text-white",
                  off: "border-sky-300 bg-white text-sky-950",
                },
                {
                  mode: "fast",
                  label: "Fast",
                  letter: "F",
                  on: "border-afa-red bg-afa-red text-white",
                  off: "border-red-300 bg-white text-red-900",
                },
                {
                  mode: "both",
                  label: "Both",
                  letter: "B",
                  on: "border-emerald-700 bg-emerald-700 text-white",
                  off: "border-emerald-300 bg-white text-emerald-900",
                },
              ].map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setPitch(opt.mode)}
                  className={
                    "rounded-xl border-2 px-2 py-3 text-center " +
                    (pitchMode === opt.mode ? opt.on : opt.off)
                  }
                >
                  <span className="block text-xl font-black leading-none">
                    {opt.letter}
                  </span>
                  <span className="block text-sm font-bold mt-1">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phone / email / address — optional, only when they ask or when done */}
        {(nextStep === "save" || showMore) && (
          <div className="space-y-3 border-t border-afa-navy/10 pt-3">
            {!showMore ? (
              <button
                type="button"
                className="btn-transient text-sm w-full"
                onClick={() => setShowMore(true)}
              >
                + Phone, email, address (optional)
              </button>
            ) : (
              <>
                <p className="t-label">Optional details</p>
                <PromptField
                  label="Phone"
                  explainer="Phone — call on game day"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                />
                <PromptField
                  label="Email"
                  explainer="Email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                />
                <PromptField
                  label="Preferred name"
                  explainer="Preferred name if different"
                  value={form.preferredName}
                  onChange={(e) =>
                    setForm({ ...form, preferredName: e.target.value })
                  }
                />
                <PromptField
                  label="Card #"
                  explainer="Umpire card # (optional)"
                  value={form.cardNumber}
                  onChange={(e) =>
                    setForm({ ...form, cardNumber: e.target.value })
                  }
                />
                <PromptField
                  label="Address"
                  explainer="Street address (optional)"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <PromptField
                    label="City"
                    explainer="City"
                    value={form.city}
                    onChange={(e) =>
                      setForm({ ...form, city: e.target.value })
                    }
                  />
                  <PromptField
                    label="State"
                    explainer="ST"
                    value={form.state}
                    onChange={(e) =>
                      setForm({ ...form, state: e.target.value })
                    }
                  />
                  <PromptField
                    label="Zip"
                    explainer="Zip"
                    value={form.zip}
                    onChange={(e) =>
                      setForm({ ...form, zip: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      value: "active",
                      label: "Active",
                      on: "border-afa-navy bg-afa-navy text-white",
                      off: "border-afa-navy/20 bg-white text-afa-navy",
                    },
                    {
                      value: "inactive",
                      label: "Inactive",
                      on: "border-afa-muted bg-afa-muted text-white",
                      off: "border-afa-navy/15 bg-white text-afa-muted",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setForm({ ...form, status: opt.value })
                      }
                      className={
                        "rounded-xl border-2 px-3 py-2.5 text-sm font-bold " +
                        (form.status === opt.value ? opt.on : opt.off)
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {nextStep !== "save" && (
                  <button
                    type="button"
                    className="t-label underline text-afa-muted"
                    onClick={() => setShowMore(false)}
                  >
                    Hide optional
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div
          className={
            "flex flex-wrap items-center gap-2 pt-1 rounded-xl p-2 -mx-1 transition-all " +
            (nextStep === "save"
              ? "bg-emerald-50 ring-4 ring-emerald-200/80"
              : "")
          }
        >
          {nextStep === "save" && (
            <span className="w-full text-xs font-bold uppercase tracking-wide text-emerald-800 mb-1">
              → Do this next
            </span>
          )}
          <button
            type="submit"
            disabled={busy || requiredLeft > 0}
            className={
              "btn-action " +
              (requiredLeft > 0
                ? "opacity-40 cursor-not-allowed"
                : nextStep === "save"
                  ? "ring-2 ring-emerald-400"
                  : "")
            }
          >
            {busy
              ? "Saving…"
              : requiredLeft > 0
                ? `Next: ${steps.find((s) => s.key === nextStep)?.label ?? "…"}`
                : editingId
                  ? "Save changes"
                  : "Save to roster"}
          </button>
          <button type="button" className="btn-transient" onClick={cancelForm}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {/* ZONE 1 — primary action */}
      {canEdit && !formOpen && (
        <button type="button" className="btn-action w-full sm:w-auto" onClick={openAdd}>
          + Add umpire
        </button>
      )}

      {/* ZONE 2 — filters only when there is a roster to filter */}
      {list.length > 0 && !formOpen && (
        <div>
          <p className="t-label mb-2">Show</p>
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => {
              const on = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold " +
                    chipClass(tab, on)
                  }
                >
                  {tab.label}
                  <span className="tabular-nums opacity-80">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ZONE 3 — roster list (hidden while form open to avoid clutter) */}
      {!formOpen && (
        <div className="rounded-xl border border-afa-navy/10 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-afa-navy/10 bg-afa-soft-gray/60 flex items-baseline justify-between gap-2">
            <p className="t-strong text-sm">
              {list.length === 0
                ? "Roster"
                : filter === "all"
                  ? `${list.length} umpire${list.length === 1 ? "" : "s"}`
                  : `${filtered.length} shown · ${list.length} total`}
            </p>
            {list.length > 0 && (
              <p className="t-meta text-xs">S = Slow · F = Fast · B = Both</p>
            )}
          </div>

          {list.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="t-strong">No umpires yet</p>
              <p className="t-meta">
                Tap <strong>Add umpire</strong> to put the first person on file.
              </p>
              {canEdit && (
                <button type="button" className="btn-action" onClick={openAdd}>
                  + Add umpire
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="t-strong">Nobody in this filter</p>
              <p className="t-meta">
                Try <strong>All</strong> or <strong>Active</strong>.
              </p>
              <button
                type="button"
                className="btn-transient text-sm"
                onClick={() => setFilter("all")}
              >
                Show all
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-afa-navy/8">
              {filtered.map((u) => {
                const p = pitchKind(u);
                const inactive = u.status === "inactive";
                return (
                  <li
                    key={u.id}
                    className={
                      "flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 border-l-4 bg-white " +
                      p.bar +
                      (inactive ? " opacity-60" : "")
                    }
                  >
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                        (inactive ? "bg-afa-navy/15 text-afa-muted" : p.avatar)
                      }
                      aria-hidden
                    >
                      {initials(u)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-body font-semibold leading-tight">
                        {umpDisplay(u)}
                      </p>
                      <p className="t-meta text-sm mt-0.5">
                        Legal: {u.lastName}, {u.firstName}
                        {u.phone ? ` · ${u.phone}` : ""}
                        {u.email ? ` · ${u.email}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold " +
                          p.chip
                        }
                      >
                        {p.short}
                      </span>
                      {inactive && (
                        <span className="inline-flex rounded-full border border-afa-navy/15 bg-afa-navy/5 px-2 py-0.5 text-xs font-bold text-afa-muted">
                          Inactive
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="btn-transient text-sm px-2.5 py-1"
                          onClick={() => startEdit(u)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ZONE 4 — form only when open */}
      {formCard}
    </div>
  );
}
