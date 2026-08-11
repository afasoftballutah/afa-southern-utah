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
  pitchSlow: true, // default Slow for this region
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

/** Placeholder as explainer; short label only once filled or focused. */
function Field({
  label,
  explainer,
  value,
  onChange,
  type = "text",
  autoComplete,
  required = false,
}) {
  const [focused, setFocused] = useState(false);
  const filled = String(value ?? "").trim().length > 0;
  const showLabel = filled || focused;

  return (
    <label className="block">
      <span
        className={
          "t-label block transition-all " +
          (showLabel
            ? "mb-1 opacity-100"
            : "mb-0 h-0 opacity-0 overflow-hidden")
        }
      >
        {label}
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
          "w-full rounded-lg border border-afa-navy/20 bg-white px-3 py-2.5 text-[15px] placeholder:text-afa-muted/80 focus:outline-none focus:ring-2 focus:ring-afa-navy/20 focus:border-afa-navy/40 " +
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
export default function UmpireRoster({ initial = [], canEdit = true }) {
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

  function page1Ok() {
    return (
      String(form.lastName).trim() &&
      String(form.firstName).trim() &&
      String(form.phone).trim() &&
      String(form.email).trim()
    );
  }

  function goNext() {
    setError("");
    if (page === 1 && !page1Ok()) {
      setError("Name, phone, and email are needed to continue.");
      return;
    }
    setPage((p) => Math.min(3, p + 1));
  }

  function goBack() {
    setError("");
    setPage((p) => Math.max(1, p - 1));
  }

  async function save(e) {
    e.preventDefault();
    if (!canEdit) return;
    if (!page1Ok()) {
      setPage(1);
      setError("Name, phone, and email are required.");
      return;
    }
    if (!form.pitchFast && !form.pitchSlow) {
      setPage(3);
      setError("Pick Slow, Fast, or Both.");
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

  const filterTabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "slow", label: "Slow", count: counts.slow, color: "sky" },
    { key: "fast", label: "Fast", count: counts.fast, color: "red" },
    { key: "both", label: "Both", count: counts.both, color: "green" },
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
      id="umpire-form"
      onSubmit={save}
      className="rounded-xl border border-afa-navy/15 bg-white shadow-sm overflow-hidden max-w-md"
    >
      <div className="px-4 py-3 border-b border-afa-navy/10 flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-afa-navy">
            {editingId ? "Edit umpire" : "Add umpire"}
          </p>
          <p className="t-meta text-xs mt-0.5">
            {page === 1 && "Name & how to reach them"}
            {page === 2 && "Mailing address"}
            {page === 3 && "Pitch type & card"}
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

      {/* Simple page dots */}
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

      <div className="p-4 space-y-3">
        {error && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* —— Page 1: Name, email, phone —— */}
        {page === 1 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Last name"
                explainer="Last name"
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
              />
              <Field
                label="First name"
                explainer="First name"
                required
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
              required
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Field
              label="Email"
              explainer="Email"
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </>
        )}

        {/* —— Page 2: Address, with page 1 fixed —— */}
        {page === 2 && (
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
            <Field
              label="Street"
              explainer="Street address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="City"
                explainer="City"
                className="col-span-1"
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
            <p className="t-meta text-xs">Address is optional — skip if you don’t have it.</p>
          </>
        )}

        {/* —— Page 3: Softball —— */}
        {page === 3 && (
          <>
            <div className="rounded-lg bg-afa-soft-gray/80 border border-afa-navy/10 px-3 py-2.5 space-y-1">
              <FixedLine label="Name" value={displayName} />
              <FixedLine label="Phone" value={form.phone} />
              <FixedLine label="Email" value={form.email} />
              {(form.city || form.address) && (
                <FixedLine
                  label="Address"
                  value={[form.address, form.city, form.state, form.zip]
                    .filter(Boolean)
                    .join(", ")}
                />
              )}
            </div>
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
                    <span className="block text-sm font-bold mt-1">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Card #"
              explainer="Umpire card # (optional)"
              value={form.cardNumber}
              onChange={(e) =>
                setForm({ ...form, cardNumber: e.target.value })
              }
            />
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
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {page > 1 && (
            <button type="button" className="btn-transient" onClick={goBack}>
              Back
            </button>
          )}
          {page < 3 ? (
            <button type="button" className="btn-action" onClick={goNext}>
              Continue
            </button>
          ) : (
            <button type="submit" disabled={busy} className="btn-action">
              {busy
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Save to roster"}
            </button>
          )}
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {canEdit && !formOpen && (
        <button
          type="button"
          className="btn-action w-full sm:w-auto"
          onClick={openAdd}
        >
          + Add umpire
        </button>
      )}

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
                        (inactive
                          ? "bg-afa-navy/15 text-afa-muted"
                          : p.avatar)
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
                        {u.phone ? u.phone : ""}
                        {u.phone && u.email ? " · " : ""}
                        {u.email || ""}
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

      {formCard}
    </div>
  );
}
