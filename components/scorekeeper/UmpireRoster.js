"use client";

import { useMemo, useState } from "react";

const empty = () => ({
  firstName: "", // legal first
  lastName: "", // legal last
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

/** Visual identity for pitch type — color + short label. */
function pitchKind(u) {
  if (u.pitchFast && u.pitchSlow) {
    return {
      key: "both",
      label: "Both",
      short: "B",
      // teal = dual-qualified
      chip: "bg-emerald-100 text-emerald-900 border-emerald-300",
      bar: "border-l-emerald-500",
      avatar: "bg-emerald-700 text-white",
      btn: "border-emerald-600 bg-emerald-600 text-white",
      soft: "bg-emerald-50 border-emerald-200",
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
      btn: "border-afa-red bg-afa-red text-white",
      soft: "bg-red-50 border-red-200",
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
      btn: "border-afa-navy bg-afa-navy text-white",
      soft: "bg-sky-50 border-sky-200",
    };
  }
  return {
    key: "none",
    label: "—",
    short: "?",
    chip: "bg-afa-navy/5 text-afa-muted border-afa-navy/15",
    bar: "border-l-afa-navy/20",
    avatar: "bg-afa-navy/20 text-afa-navy",
    btn: "border-afa-navy/30 bg-white text-afa-navy",
    soft: "bg-afa-soft-gray border-afa-navy/10",
  };
}

function initials(u) {
  const display = umpDisplay(u);
  if (display) {
    const parts = display.split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase();
    }
    return display.slice(0, 2).toUpperCase();
  }
  const a = (u.firstName || "").trim()[0] || "";
  const b = (u.lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function Section({ step, title, hint, children, accent = "navy" }) {
  const accents = {
    navy: "border-afa-navy bg-afa-navy",
    sky: "border-sky-600 bg-sky-600",
    red: "border-afa-red bg-afa-red",
    green: "border-emerald-600 bg-emerald-600",
  };
  const a = accents[accent] || accents.navy;
  return (
    <section className="rounded-xl border border-afa-navy/10 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-afa-soft-gray/80 border-b border-afa-navy/8">
        <span
          className={
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white " +
            a.split(" ").find((c) => c.startsWith("bg-"))
          }
        >
          {step}
        </span>
        <div className="min-w-0">
          <p className="t-strong text-sm leading-tight">{title}</p>
          {hint && <p className="t-meta text-xs leading-tight">{hint}</p>}
        </div>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
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

export default function UmpireRoster({ initial = [], canEdit = true }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | slow | fast | both | inactive
  const [formOpen, setFormOpen] = useState(initial.length === 0);

  const counts = useMemo(() => {
    let active = 0,
      slow = 0,
      fast = 0,
      both = 0,
      inactive = 0;
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
    return { active, slow, fast, both, inactive, total: list.length };
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((u) => {
      if (filter === "inactive") return u.status === "inactive";
      if (filter === "slow") return u.pitchSlow && !u.pitchFast && u.status !== "inactive";
      if (filter === "fast") return u.pitchFast && !u.pitchSlow && u.status !== "inactive";
      if (filter === "both") return u.pitchFast && u.pitchSlow && u.status !== "inactive";
      if (filter === "active") return u.status !== "inactive";
      return true;
    });
  }, [list, filter]);

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
    // After paint, scroll form into view
    setTimeout(() => {
      document.getElementById("umpire-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty());
    setError("");
    if (list.length > 0) setFormOpen(false);
  }

  function setPitch(mode) {
    // mode: slow | fast | both
    if (mode === "both") setForm({ ...form, pitchSlow: true, pitchFast: true });
    else if (mode === "fast") setForm({ ...form, pitchSlow: false, pitchFast: true });
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
      cancelEdit();
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

  const filters = [
    { key: "all", label: "All", count: counts.total, tone: "neutral" },
    { key: "active", label: "Active", count: counts.active, tone: "navy" },
    { key: "slow", label: "Slow", count: counts.slow, tone: "sky" },
    { key: "fast", label: "Fast", count: counts.fast, tone: "red" },
    { key: "both", label: "Both", count: counts.both, tone: "green" },
    ...(counts.inactive
      ? [{ key: "inactive", label: "Inactive", count: counts.inactive, tone: "muted" }]
      : []),
  ];

  const filterTone = {
    neutral:
      filter === "all"
        ? "bg-afa-navy text-white border-afa-navy"
        : "bg-white text-afa-navy border-afa-navy/20 hover:border-afa-navy/40",
    navy:
      filter === "active"
        ? "bg-afa-navy text-white border-afa-navy"
        : "bg-sky-50 text-afa-navy border-sky-200 hover:border-sky-400",
    sky:
      filter === "slow"
        ? "bg-sky-700 text-white border-sky-700"
        : "bg-sky-50 text-sky-950 border-sky-200 hover:border-sky-400",
    red:
      filter === "fast"
        ? "bg-afa-red text-white border-afa-red"
        : "bg-red-50 text-red-900 border-red-200 hover:border-red-400",
    green:
      filter === "both"
        ? "bg-emerald-700 text-white border-emerald-700"
        : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:border-emerald-400",
    muted:
      filter === "inactive"
        ? "bg-afa-muted text-white border-afa-muted"
        : "bg-afa-navy/5 text-afa-muted border-afa-navy/15",
  };

  return (
    <div className="space-y-5">
      {/* Flow strip — what this page is for */}
      <div className="rounded-xl border border-afa-navy/10 bg-gradient-to-r from-afa-navy to-sky-800 text-white px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-white/70">
          Umpire roster
        </p>
        <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <li className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">
              1
            </span>
            Add names
          </li>
          <li className="text-white/40 hidden sm:inline" aria-hidden>
            →
          </li>
          <li className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">
              2
            </span>
            Mark Slow / Fast / Both
          </li>
          <li className="text-white/40 hidden sm:inline" aria-hidden>
            →
          </li>
          <li className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">
              3
            </span>
            Assign on a division
          </li>
        </ol>
      </div>

      {/* Count chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Active", value: counts.active, soft: "bg-sky-50 border-sky-200 text-afa-navy" },
          { label: "Slow only", value: counts.slow, soft: "bg-sky-50 border-sky-200 text-sky-950" },
          { label: "Fast only", value: counts.fast, soft: "bg-red-50 border-red-200 text-red-900" },
          { label: "Both", value: counts.both, soft: "bg-emerald-50 border-emerald-200 text-emerald-900" },
        ].map((s) => (
          <div
            key={s.label}
            className={"rounded-xl border px-3 py-2.5 " + s.soft}
          >
            <p className="text-2xl font-bold tabular-nums leading-none">{s.value}</p>
            <p className="t-label mt-1 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + add */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors " +
              filterTone[f.tone]
            }
          >
            {f.label}
            <span
              className={
                "tabular-nums text-xs " +
                (filter === f.key ? "opacity-90" : "opacity-60")
              }
            >
              {f.count}
            </span>
          </button>
        ))}
        {canEdit && !formOpen && (
          <button
            type="button"
            className="btn-action text-sm ml-auto"
            onClick={() => {
              setEditingId(null);
              setForm(empty());
              setFormOpen(true);
            }}
          >
            + Add umpire
          </button>
        )}
      </div>

      {/* Roster */}
      <div className="rounded-xl border border-afa-navy/10 bg-afa-soft-gray/50 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-afa-navy/10 bg-white/80 flex items-baseline justify-between gap-2">
          <p className="t-strong text-sm">
            {filtered.length === 0
              ? "No umpires match"
              : filtered.length === 1
                ? "1 umpire"
                : `${filtered.length} umpires`}
          </p>
          <p className="t-meta text-xs">Color = pitch type</p>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="t-meta">
              {list.length === 0
                ? "Nobody on the roster yet. Add the first umpire below."
                : "Nothing in this filter."}
            </p>
            {canEdit && list.length === 0 && !formOpen && (
              <button
                type="button"
                className="btn-action"
                onClick={() => setFormOpen(true)}
              >
                + Add first umpire
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-afa-navy/8">
            {filtered.map((u) => {
              const p = pitchKind(u);
              const inactive = u.status === "inactive";
              const editing = editingId === u.id;
              return (
                <li
                  key={u.id}
                  className={
                    "flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 border-l-4 bg-white " +
                    p.bar +
                    (inactive ? " opacity-60 " : "") +
                    (editing ? " ring-2 ring-inset ring-afa-navy/20 bg-sky-50/40" : "")
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
                      {u.preferredName ? ` · prefers ${u.preferredName}` : ""}
                    </p>
                    <p className="t-meta text-sm mt-0.5">
                      {u.cardNumber ? `Card ${u.cardNumber}` : "No card #"}
                      {u.phone ? ` · ${u.phone}` : ""}
                      {u.email ? ` · ${u.email}` : ""}
                      {u.city ? ` · ${u.city}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold " +
                        p.chip
                      }
                    >
                      {p.short} · {p.label}
                    </span>
                    {inactive && (
                      <span className="inline-flex items-center rounded-full border border-afa-navy/15 bg-afa-navy/5 px-2 py-0.5 text-xs font-bold text-afa-muted">
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

      {/* Add / edit form — stepped */}
      {canEdit && formOpen && (
        <form
          id="umpire-form"
          onSubmit={save}
          className="rounded-xl border-2 border-afa-navy/15 bg-afa-soft-gray/40 p-3 sm:p-4 space-y-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <p className="t-strong">
                {editingId ? "Edit umpire" : "Add umpire"}
              </p>
              <p className="t-meta text-sm">
                Same fields as the AFA State Umpire Batch Registration form.
              </p>
            </div>
            <button
              type="button"
              className="t-label underline text-afa-muted"
              onClick={cancelEdit}
            >
              Close
            </button>
          </div>

          {error && (
            <p
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          <Section
            step="1"
            title="Legal name"
            hint="As on the AFA card / waiver"
            accent="navy"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Legal last">
                <input
                  required
                  autoComplete="family-name"
                  className={inputClass}
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                />
              </Field>
              <Field label="Legal first">
                <input
                  required
                  autoComplete="given-name"
                  className={inputClass}
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
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
            <Field label="Card #">
              <input
                className={inputClass}
                value={form.cardNumber}
                onChange={(e) =>
                  setForm({ ...form, cardNumber: e.target.value })
                }
                placeholder="Optional"
              />
            </Field>
          </Section>

          <Section
            step="2"
            title="Contact"
            hint="Phone and email — both for umpires"
            accent="sky"
          >
            <Field label="Address">
              <input
                className={inputClass}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="City" className="col-span-1">
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
          </Section>

          <Section
            step="3"
            title="Pitch type"
            hint="Tap one — Slow, Fast, or Both"
            accent="red"
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  mode: "slow",
                  label: "Slow",
                  letter: "S",
                  on: "border-sky-700 bg-sky-700 text-white shadow-sm",
                  off: "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-400",
                },
                {
                  mode: "fast",
                  label: "Fast",
                  letter: "F",
                  on: "border-afa-red bg-afa-red text-white shadow-sm",
                  off: "border-red-200 bg-red-50 text-red-900 hover:border-red-400",
                },
                {
                  mode: "both",
                  label: "Both",
                  letter: "B",
                  on: "border-emerald-700 bg-emerald-700 text-white shadow-sm",
                  off: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400",
                },
              ].map((opt) => {
                const selected = pitchMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setPitch(opt.mode)}
                    className={
                      "rounded-xl border-2 px-2 py-3 text-center transition-colors " +
                      (selected ? opt.on : opt.off)
                    }
                  >
                    <span className="block text-xl font-black leading-none">
                      {opt.letter}
                    </span>
                    <span className="block text-sm font-bold mt-1">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section step="4" title="Status" hint="Inactive stays on file" accent="green">
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  value: "active",
                  label: "Active",
                  on: "border-afa-navy bg-afa-navy text-white",
                  off: "border-afa-navy/20 bg-white text-afa-navy hover:border-afa-navy/40",
                },
                {
                  value: "inactive",
                  label: "Inactive",
                  on: "border-afa-muted bg-afa-muted text-white",
                  off: "border-afa-navy/15 bg-white text-afa-muted hover:border-afa-navy/30",
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
          </Section>

          <div className="flex flex-wrap items-center gap-2 pt-1 px-1">
            <button type="submit" disabled={busy} className="btn-action">
              {busy
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Add to roster"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-transient"
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
