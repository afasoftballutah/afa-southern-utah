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
  pitchFast: false,
  pitchSlow: true,
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

function Field({ label, children, className = "" }) {
  return (
    <label className={"block " + className}>
      <span className="t-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-afa-navy/20 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-afa-navy/25 focus:border-afa-navy/40";

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
        : "slow";

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
      className="rounded-xl border-2 border-afa-navy/20 bg-white shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-afa-navy text-white">
        <div>
          <p className="font-bold text-base">
            {editingId ? "Edit umpire" : "Add umpire"}
          </p>
          <p className="text-xs text-white/75 mt-0.5">
            Fill this out, then Save. Everything above is the roster list.
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

      <div className="p-4 space-y-4">
        {error && (
          <p
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="space-y-3">
          <p className="t-label text-afa-navy">1 · Legal name</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal last">
              <input
                required
                autoComplete="family-name"
                className={inputClass}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label="Legal first">
              <input
                required
                autoComplete="given-name"
                className={inputClass}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Preferred name (optional)">
            <input
              className={inputClass}
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
              placeholder="What they go by if different"
            />
          </Field>
          <Field label="Card # (optional)">
            <input
              className={inputClass}
              value={form.cardNumber}
              onChange={(e) =>
                setForm({ ...form, cardNumber: e.target.value })
              }
            />
          </Field>
        </div>

        <div className="border-t border-afa-navy/10 pt-4 space-y-3">
          <p className="t-label text-afa-navy">2 · Contact</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                type="tel"
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Address (optional)">
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City">
              <input
                className={inputClass}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="ST">
              <input
                className={inputClass}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
            <Field label="Zip">
              <input
                className={inputClass}
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="border-t border-afa-navy/10 pt-4 space-y-3">
          <p className="t-label text-afa-navy">3 · Pitch type</p>
          <p className="t-meta text-sm -mt-1">Tap one</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                mode: "slow",
                label: "Slow",
                letter: "S",
                on: "border-sky-700 bg-sky-700 text-white",
                off: "border-sky-200 bg-sky-50 text-sky-950",
              },
              {
                mode: "fast",
                label: "Fast",
                letter: "F",
                on: "border-afa-red bg-afa-red text-white",
                off: "border-red-200 bg-red-50 text-red-900",
              },
              {
                mode: "both",
                label: "Both",
                letter: "B",
                on: "border-emerald-700 bg-emerald-700 text-white",
                off: "border-emerald-200 bg-emerald-50 text-emerald-900",
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

        <div className="border-t border-afa-navy/10 pt-4 space-y-3">
          <p className="t-label text-afa-navy">4 · Status</p>
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
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" disabled={busy} className="btn-action">
            {busy
              ? "Saving…"
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
