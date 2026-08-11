"use client";

import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SuspendUmpire from "./SuspendUmpire";

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
  pitchSlow: false, // must pick on page 3 — do not pre-select
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
 * Placeholder as explainer. Label always occupies the same height so focus
 * does not bounce the row (no native required — we validate on Continue).
 */
function Field({
  label,
  explainer,
  value,
  onChange,
  type = "text",
  autoComplete,
}) {
  const [focused, setFocused] = useState(false);
  const filled = String(value ?? "").trim().length > 0;
  const showLabel = filled || focused;

  return (
    <label className="block">
      {/* Fixed-height label slot — opacity only, never collapses */}
      <span
        className={
          "t-label block mb-1 min-h-[1rem] leading-4 " +
          (showLabel ? "opacity-100" : "opacity-0")
        }
        aria-hidden={!showLabel}
      >
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={explainer}
        className={
          "w-full rounded-lg border border-afa-navy/20 bg-white px-3 py-2.5 text-[15px] placeholder:text-afa-muted/70 focus:outline-none focus:ring-2 focus:ring-afa-navy/20 focus:border-afa-navy/40 " +
          (filled ? "border-afa-navy/25" : "")
        }
      />
    </label>
  );
}

function FixedLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="t-meta shrink-0 w-16">{label}</span>
      <span className="font-semibold text-afa-navy">{value}</span>
    </div>
  );
}

const PAGES = [
  { id: 1, title: "Who" },
  { id: 2, title: "Address" },
  { id: 3, title: "Softball" },
];

/**
 * Zones: Add · Filters · List · Form (3 light pages)
 * Page 1: name, email, phone
 * Page 2: address (page 1 fixed above)
 * Page 3: pitch / card / status
 */
export default function UmpireRoster({
  initial = [],
  canEdit = true,
  tournaments = [],
}) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(initial.length === 0 && canEdit);
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    let all = list.length;
    let active = 0;
    let slow = 0;
    let fast = 0;
    let both = 0;
    let inactive = 0;
    let suspended = 0;
    for (const u of list) {
      if (u.suspended) suspended += 1;
      if (u.status === "inactive") {
        inactive += 1;
        continue;
      }
      active += 1;
      if (u.pitchFast && u.pitchSlow) both += 1;
      else if (u.pitchFast) fast += 1;
      else if (u.pitchSlow) slow += 1;
    }
    return { all, active, slow, fast, both, inactive, suspended };
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((u) => {
      if (filter === "inactive") return u.status === "inactive";
      if (filter === "suspended") return Boolean(u.suspended);
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
    setPage(1);
    setFormOpen(true);
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
      state: u.state || "UT",
      zip: u.zip || "",
      phone: u.phone || "",
      email: u.email || "",
      pitchFast: !!u.pitchFast,
      pitchSlow: !!u.pitchSlow,
      status: u.status || "active",
      notes: u.notes || "",
    });
    setError("");
    setPage(1);
    setFormOpen(true);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(empty());
    setError("");
    setPage(1);
    setFormOpen(false);
  }

  function setPitch(mode) {
    if (mode === "both") setForm({ ...form, pitchSlow: true, pitchFast: true });
    else if (mode === "fast")
      setForm({ ...form, pitchSlow: false, pitchFast: true });
    else setForm({ ...form, pitchSlow: true, pitchFast: false });
  }

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mergeKeep, setMergeKeep] = useState(null); // umpire we keep
  const [mergeDropId, setMergeDropId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function deleteUmpire() {
    if (!deleteTarget) return;
    setActionBusy(true);
    setActionError("");
    try {
      const res = await fetch(
        `/api/scorekeeper/umpires?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete");
      setList((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) cancelForm();
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err.message || "Delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function mergeUmpires() {
    if (!mergeKeep || !mergeDropId) return;
    setActionBusy(true);
    setActionError("");
    try {
      const res = await fetch("/api/scorekeeper/umpires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge",
          keepId: mergeKeep.id,
          dropId: mergeDropId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not merge");
      setList((prev) =>
        prev
          .filter((u) => u.id !== mergeDropId)
          .map((u) => (u.id === mergeKeep.id ? json.umpire : u))
      );
      if (editingId === mergeDropId) cancelForm();
      setMergeKeep(null);
      setMergeDropId("");
    } catch (err) {
      setActionError(err.message || "Merge failed");
    } finally {
      setActionBusy(false);
    }
  }

  const isEditing = Boolean(editingId);

  function nameOk() {
    return String(form.lastName).trim() && String(form.firstName).trim();
  }

  /** Add wizard page 1 requires contact; edit can save with name only. */
  function page1Ok() {
    if (!nameOk()) return false;
    if (isEditing) return true;
    return String(form.phone).trim() && String(form.email).trim();
  }

  function goBack() {
    setError("");
    setPage((p) => Math.max(1, p - 1));
  }

  /** Add: page 1→2→3→save. Edit: always save (single page). */
  function handleFormSubmit(e) {
    e.preventDefault();
    setError("");
    if (isEditing) {
      save();
      return;
    }
    if (page === 1) {
      if (!page1Ok()) {
        setError("Name, phone, and email are needed to continue.");
        return;
      }
      setPage(2);
      return;
    }
    if (page === 2) {
      setPage(3);
      return;
    }
    save();
  }

  async function save() {
    if (!canEdit) return;
    if (!nameOk()) {
      if (!isEditing) setPage(1);
      setError("First and last name are required.");
      return;
    }
    if (!isEditing && (!String(form.phone).trim() || !String(form.email).trim())) {
      setPage(1);
      setError("Phone and email are required for a new umpire.");
      return;
    }
    if (!form.pitchFast && !form.pitchSlow) {
      if (!isEditing) setPage(3);
      setError("Pick Slow, Fast, or Both before saving.");
      return;
    }
    const id = editingId;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/umpires", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id || undefined,
          firstName: form.firstName,
          lastName: form.lastName,
          preferredName: form.preferredName,
          cardNumber: form.cardNumber,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          phone: form.phone,
          email: form.email,
          pitchFast: form.pitchFast,
          pitchSlow: form.pitchSlow,
          status: form.status,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      const row = json.umpire;
      setList((prev) => {
        if (id) {
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

  function PitchPicker() {
    return (
      <div>
        <p className="t-label mb-2">Pitch type</p>
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
              <span className="block text-lg font-black leading-none">
                {opt.letter}
              </span>
              <span className="block text-sm font-bold mt-1">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function StatusPicker() {
    return (
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
              "rounded-xl border-2 px-3 py-2 text-sm font-bold " +
              (form.status === opt.value ? opt.on : opt.off)
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  const pitchMode =
    form.pitchFast && form.pitchSlow
      ? "both"
      : form.pitchFast
        ? "fast"
        : form.pitchSlow
          ? "slow"
          : null;

  const filterTabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "slow", label: "Slow", count: counts.slow, color: "sky" },
    { key: "fast", label: "Fast", count: counts.fast, color: "red" },
    { key: "both", label: "Both", count: counts.both, color: "green" },
    ...(counts.suspended > 0
      ? [
          {
            key: "suspended",
            label: "Suspended",
            count: counts.suspended,
            color: "red",
          },
        ]
      : []),
    ...(counts.inactive > 0
      ? [
          {
            key: "inactive",
            label: "Inactive",
            count: counts.inactive,
            color: "muted",
          },
        ]
      : []),
  ];

  function chipClass(tab, on) {
    if (on) {
      if (tab.color === "sky") return "bg-sky-700 text-white border-sky-700";
      if (tab.color === "red") return "bg-afa-red text-white border-afa-red";
      if (tab.color === "green")
        return "bg-emerald-700 text-white border-emerald-700";
      if (tab.color === "muted")
        return "bg-afa-muted text-white border-afa-muted";
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

  const displayName = [form.firstName, form.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const formCard = formOpen && canEdit && (
    <form
      key={editingId || "new"}
      id="umpire-form"
      onSubmit={handleFormSubmit}
      noValidate
      className="rounded-xl border border-afa-navy/15 bg-white shadow-sm overflow-hidden max-w-md"
    >
      <div className="px-4 py-3 border-b border-afa-navy/10 flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-afa-navy">
            {isEditing ? "Edit umpire" : "Add umpire"}
          </p>
          <p className="t-meta text-xs mt-0.5">
            {isEditing
              ? "Update any field, then save"
              : page === 1
                ? "Name & how to reach them"
                : page === 2
                  ? "Mailing address"
                  : "Pitch type & card"}
          </p>
        </div>
        <button
          type="button"
          className="t-label underline text-afa-muted"
          onClick={cancelForm}
        >
          Cancel
        </button>
      </div>

      {!isEditing && (
        <div className="flex gap-1.5 px-4 pt-3">
          {PAGES.map((p) => (
            <div
              key={p.id}
              className={
                "h-1 flex-1 rounded-full " +
                (p.id === page
                  ? "bg-afa-navy"
                  : p.id < page
                    ? "bg-afa-navy/40"
                    : "bg-afa-navy/10")
              }
              title={p.title}
            />
          ))}
        </div>
      )}

      <div className="p-4 space-y-3">
        {error && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* —— Edit: one scrollable page with everything —— */}
        {isEditing && (
          <>
            <p className="text-sm text-afa-ink/75">
              <strong className="text-afa-navy">Legal name</strong>
              {" and "}
              <strong className="text-afa-navy">address</strong>
              {
                " must match a driver’s license or other official ID."
              }
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Legal last name"
                explainer="Legal last — as on license / ID"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
              />
              <Field
                label="Legal first name"
                explainer="Legal first — as on license / ID"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
              />
            </div>
            <Field
              label="Preferred name"
              explainer="Preferred name (optional)"
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
            />
            <Field
              label="Phone"
              explainer="Phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Field
              label="Email"
              explainer="Email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Field
              label="Street (as on license / ID)"
              explainer="Street as on license / official document"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="City"
                explainer="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Field
                label="State"
                explainer="ST"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Field
                label="Zip"
                explainer="Zip"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </div>
            <PitchPicker />
            <Field
              label="Card #"
              explainer="Umpire card # (optional)"
              value={form.cardNumber}
              onChange={(e) =>
                setForm({ ...form, cardNumber: e.target.value })
              }
            />
            <StatusPicker />
          </>
        )}

        {/* —— Add wizard page 1 —— */}
        {!isEditing && page === 1 && (
          <>
            <p className="text-sm text-afa-ink/75">
              <strong className="text-afa-navy">Legal name</strong>
              {" and "}
              <strong className="text-afa-navy">address</strong>
              {
                " must match a driver’s license or other official ID. Preferred name is for the roster if different."
              }
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Legal last name"
                explainer="Legal last — as on license / ID"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
              />
              <Field
                label="Legal first name"
                explainer="Legal first — as on license / ID"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
              />
            </div>
            <Field
              label="Preferred name"
              explainer="Preferred name (optional)"
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
            />
            <Field
              label="Phone"
              explainer="Phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Field
              label="Email"
              explainer="Email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </>
        )}

        {/* —— Add wizard page 2 —— */}
        {!isEditing && page === 2 && (
          <>
            <div className="rounded-lg bg-afa-soft-gray/80 border border-afa-navy/10 px-3 py-2.5 space-y-1">
              <FixedLine label="Name" value={displayName} />
              <FixedLine label="Phone" value={form.phone} />
              <FixedLine label="Email" value={form.email} />
              <button
                type="button"
                className="t-label underline text-afa-navy mt-1"
                onClick={() => setPage(1)}
              >
                Edit contact
              </button>
            </div>
            <p className="text-sm text-afa-ink/75">
              <strong className="text-afa-navy">Address</strong>
              {" must match a license or other official document."}
            </p>
            <Field
              label="Street (as on license / ID)"
              explainer="Street as on license / official document"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="City"
                explainer="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Field
                label="State"
                explainer="ST"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Field
                label="Zip"
                explainer="Zip"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </div>
            <p className="t-meta text-xs">
              Optional — skip if you don&rsquo;t have it yet.
            </p>
          </>
        )}

        {/* —— Add wizard page 3 —— */}
        {!isEditing && page === 3 && (
          <>
            <div className="rounded-lg bg-afa-soft-gray/80 border border-afa-navy/10 px-3 py-2.5 space-y-1">
              <FixedLine label="Name" value={displayName} />
              <FixedLine label="Phone" value={form.phone} />
              <FixedLine label="Email" value={form.email} />
            </div>
            <PitchPicker />
            <Field
              label="Card #"
              explainer="Umpire card # (optional)"
              value={form.cardNumber}
              onChange={(e) =>
                setForm({ ...form, cardNumber: e.target.value })
              }
            />
            <StatusPicker />
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {!isEditing && page > 1 && (
            <button type="button" className="btn-transient" onClick={goBack}>
              Back
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-action">
            {isEditing
              ? busy
                ? "Saving…"
                : "Save changes"
              : page < 3
                ? "Continue"
                : busy
                  ? "Saving…"
                  : "Save to roster"}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {/* Form first so Edit is never below the fold / easy to miss */}
      {formCard}

      {!formOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {list.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 min-w-0">
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
          ) : (
            <p className="t-meta text-sm">Roster</p>
          )}
          {canEdit && (
            <button type="button" className="pill pill-solid" onClick={openAdd}>
              + Add umpire
            </button>
          )}
        </div>
      )}

      {!formOpen && (
        <div className="rounded-xl border border-afa-navy/10 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-afa-navy/10 bg-afa-soft-gray/60 flex items-baseline justify-between gap-2">
            <p className="t-strong text-sm">
              {list.length === 0
                ? "No umpires yet"
                : filter === "all"
                  ? `${list.length} umpire${list.length === 1 ? "" : "s"}`
                  : `${filtered.length} shown · ${list.length} total`}
            </p>
            {list.length > 0 && (
              <p className="t-meta text-xs">S = Slow · F = Fast · B = Both</p>
            )}
          </div>

          {list.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="t-meta">
                Use <strong>+ Add umpire</strong> above to put the first person
                on file.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="t-strong">Nobody in this filter</p>
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
                const suspended = Boolean(u.suspended);
                return (
                  <li
                    key={u.id}
                    className={
                      "flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 border-l-4 " +
                      p.bar +
                      (suspended
                        ? " bg-afa-red/[0.06]"
                        : " bg-white") +
                      (inactive && !suspended ? " opacity-60" : "")
                    }
                  >
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                        (inactive && !suspended
                          ? "bg-afa-navy/15 text-afa-muted"
                          : suspended
                            ? "bg-afa-red text-white"
                            : p.avatar)
                      }
                      aria-hidden
                    >
                      {initials(u)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-body font-semibold leading-tight">
                        {umpDisplay(u)}
                        {suspended ? (
                          <span className="t-meta font-semibold text-afa-red">
                            {" "}
                            · Suspended
                          </span>
                        ) : null}
                      </p>
                      <p className="t-meta text-sm mt-0.5">
                        {u.phone ? u.phone : ""}
                        {u.phone && u.email ? " · " : ""}
                        {u.email || ""}
                      </p>
                      {suspended && u.suspensionLabels?.length ? (
                        <p className="t-meta text-[12px] text-afa-red mt-0.5">
                          {u.suspensionLabels.join("; ")}
                        </p>
                      ) : null}
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
                      {canEdit && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="pill"
                            onClick={() => startEdit(u)}
                          >
                            Edit
                          </button>
                          <SuspendUmpire
                            umpire={u}
                            tournaments={tournaments}
                            suspensions={u.suspensions ?? []}
                            buttonClass={
                              suspended
                                ? "pill bg-afa-red/10 border-afa-red/40 text-afa-red"
                                : "pill"
                            }
                          />
                          <button
                            type="button"
                            className="pill"
                            onClick={() => {
                              setActionError("");
                              setMergeDropId("");
                              setMergeKeep(u);
                            }}
                          >
                            Merge
                          </button>
                          <button
                            type="button"
                            className="pill text-afa-red border-afa-red/30"
                            onClick={() => {
                              setActionError("");
                              setDeleteTarget(u);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${umpDisplay(deleteTarget)}`}
          message={
            `Remove ${umpDisplay(deleteTarget)} from the umpire roster.\n\nGames that listed them will show no umpire (not deleted). Prefer Merge if this is a duplicate.` +
            (actionError ? `\n\n${actionError}` : "")
          }
          confirmLabel="Delete umpire"
          busy={actionBusy}
          onConfirm={deleteUmpire}
          onCancel={() => {
            if (!actionBusy) {
              setDeleteTarget(null);
              setActionError("");
            }
          }}
        />
      )}

      {mergeKeep && (
        <Modal
          title={`Merge into ${umpDisplay(mergeKeep)}`}
          subtitle="Pick the duplicate. Game assignments move here. Blank fields on this umpire are filled from the duplicate. The duplicate is removed."
          onClose={() => {
            if (!actionBusy) {
              setMergeKeep(null);
              setMergeDropId("");
              setActionError("");
            }
          }}
          footer={
            <>
              <button
                type="button"
                className="btn-transient"
                disabled={actionBusy}
                onClick={() => {
                  setMergeKeep(null);
                  setMergeDropId("");
                  setActionError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={actionBusy || !mergeDropId}
                onClick={mergeUmpires}
              >
                {actionBusy ? "Merging…" : "Merge duplicate"}
              </button>
            </>
          }
        >
          <label className="block space-y-1">
            <span className="t-label">Duplicate to fold in</span>
            <select
              className="w-full rounded-lg border border-afa-navy/30 px-3 py-2 text-[15px]"
              value={mergeDropId}
              onChange={(e) => setMergeDropId(e.target.value)}
            >
              <option value="">Pick the other record…</option>
              {list
                .filter((o) => o.id !== mergeKeep.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {umpDisplay(o)}
                    {o.phone ? ` · ${o.phone}` : ""}
                    {o.email ? ` · ${o.email}` : ""}
                  </option>
                ))}
            </select>
          </label>
          {list.filter((o) => o.id !== mergeKeep.id).length === 0 && (
            <p className="t-meta mt-2">No other umpires to merge.</p>
          )}
          {actionError && (
            <p className="t-meta text-afa-red font-semibold mt-2" role="alert">
              {actionError}
            </p>
          )}
        </Modal>
      )}

      {actionError && !mergeKeep && !deleteTarget && (
        <p className="t-meta text-afa-red font-semibold" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
