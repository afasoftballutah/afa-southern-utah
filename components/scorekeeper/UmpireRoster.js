"use client";

import { useMemo, useState } from "react";

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
 * Filled/focused: short label above; highlight drops when required is met.
 */
function PromptField({
  label,
  explainer,
  value,
  onChange,
  required = false,
  type = "text",
  autoComplete,
  className = "",
}) {
  const [focused, setFocused] = useState(false);
  const filled = String(value ?? "").trim().length > 0;
  const needs = required && !filled;
  const showLabel = filled || focused;

  return (
    <label className={"block " + className}>
      <span
        className={
          "t-label block transition-all " +
          (showLabel
            ? "mb-1 opacity-100 h-auto"
            : "mb-0 opacity-0 h-0 overflow-hidden")
        }
      >
        {label}
        {required ? "" : " · optional"}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={showLabel ? "" : explainer}
        className={
          "w-full rounded-xl border-2 px-3 py-3 text-[15px] transition-colors focus:outline-none " +
          (needs
            ? "border-amber-400 bg-amber-50/80 placeholder:text-amber-900/55 focus:border-amber-500 focus:ring-2 focus:ring-amber-300/50"
            : filled
              ? "border-emerald-300 bg-white focus:border-afa-navy/40 focus:ring-2 focus:ring-afa-navy/15"
              : "border-afa-navy/15 bg-white placeholder:text-afa-muted focus:border-afa-navy/35 focus:ring-2 focus:ring-afa-navy/15")
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

  const needLast = !String(form.lastName).trim();
  const needFirst = !String(form.firstName).trim();
  const needPhone = !String(form.phone).trim();
  const needEmail = !String(form.email).trim();
  const needPitch = !pitchPicked;
  const requiredLeft =
    [needLast, needFirst, needPhone, needEmail, needPitch].filter(Boolean)
      .length;

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
            {requiredLeft > 0
              ? `${requiredLeft} still needed — yellow boxes are required`
              : "Looks complete — tap Save"}
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

      <div className="p-4 space-y-3 sm:space-y-3">
        {error && (
          <p
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Desktop: two columns for name; mobile: stack */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PromptField
            label="Legal last name"
            explainer="Legal last name (as on AFA card)"
            required
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <PromptField
            label="Legal first name"
            explainer="Legal first name (as on AFA card)"
            required
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>

        <PromptField
          label="Preferred name"
          explainer="Preferred name — only if different from legal"
          value={form.preferredName}
          onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
        />
        <PromptField
          label="Card #"
          explainer="Umpire card # (optional)"
          value={form.cardNumber}
          onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PromptField
            label="Phone"
            explainer="Phone — call them on game day"
            required
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <PromptField
            label="Email"
            explainer="Email — for schedules and cards"
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <PromptField
          label="Address"
          explainer="Street address (optional)"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2">
          <PromptField
            label="City"
            explainer="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <PromptField
            label="State"
            explainer="ST"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          />
          <PromptField
            label="Zip"
            explainer="Zip"
            value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value })}
          />
        </div>

        {/* Pitch — highlighted until one is tapped */}
        <div
          className={
            "rounded-xl border-2 p-3 transition-colors " +
            (needPitch
              ? "border-amber-400 bg-amber-50/80"
              : "border-emerald-300 bg-white")
          }
        >
          <p
            className={
              "text-sm font-semibold mb-2 " +
              (needPitch ? "text-amber-950" : "text-afa-navy")
            }
          >
            {needPitch
              ? "Tap pitch type — Slow, Fast, or Both"
              : `Pitch: ${pitchMode === "both" ? "Both" : pitchMode === "fast" ? "Fast" : "Slow"}`}
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
                <span className="block text-sm font-bold mt-1">{opt.label}</span>
              </button>
            ))}
          </div>
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
              onClick={() => setForm({ ...form, status: opt.value })}
              className={
                "rounded-xl border-2 px-3 py-2.5 text-sm font-bold " +
                (form.status === opt.value ? opt.on : opt.off)
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || requiredLeft > 0}
            className={
              "btn-action " + (requiredLeft > 0 ? "opacity-50 cursor-not-allowed" : "")
            }
          >
            {busy
              ? "Saving…"
              : requiredLeft > 0
                ? `Fill ${requiredLeft} more…`
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
