"use client";

import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SuspendUmpire from "./SuspendUmpire";
import RoomShell, { RoomField, RoomHall } from "@/components/forms/RoomShell";

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

const ROOM_TITLES = {
  1: "Name & contact",
  2: "Address",
  3: "Pitch type & card",
};

/**
 * Room flow: door (name) → contact → optional address → pitch/card → save.
 * Same shell as other create paths (RoomShell).
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

  const [formBaseline, setFormBaseline] = useState(() => JSON.stringify(empty()));

  function openAdd() {
    const blank = empty();
    setEditingId(null);
    setForm(blank);
    setFormBaseline(JSON.stringify(blank));
    setError("");
    setPage(1);
    setFormOpen(true);
  }

  function startEdit(u) {
    const next = {
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
    };
    setEditingId(u.id);
    setForm(next);
    setFormBaseline(JSON.stringify(next));
    setError("");
    setPage(1);
    setFormOpen(true);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(empty());
    setFormBaseline(JSON.stringify(empty()));
    setError("");
    setPage(1);
    setFormOpen(false);
  }

  const formDirty = JSON.stringify(form) !== formBaseline;

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

  const roomWelcome = isEditing
    ? "Legal name and address must match a driver’s license or other official ID."
    : page === 1
      ? "Legal name must match a driver’s license or other official ID. Preferred name is what we call them on the field if different."
      : page === 2
        ? "Address as on license / ID. Entire room is optional — Skip if you don’t have it yet."
        : "How they umpire, and card number if you have it.";

  const primaryDisabled = isEditing
    ? !nameOk()
    : page === 1
      ? !page1Ok()
      : page === 3
        ? !(form.pitchFast || form.pitchSlow)
        : false;

  const primaryLabel = isEditing
    ? busy
      ? "Saving…"
      : "Save changes"
    : page < 3
      ? "Continue"
      : busy
        ? "Saving…"
        : "Save to roster";

  const formCard = formOpen && canEdit && (
    <RoomShell
      key={editingId || "new"}
      title={isEditing ? "Edit umpire" : "Add umpire"}
      roomTitle={
        isEditing ? "All details" : ROOM_TITLES[page] || "Add umpire"
      }
      page={isEditing ? null : page}
      totalPages={3}
      dirty={formDirty}
      onClose={cancelForm}
      closeLabel="Close"
      error={error}
      welcome={roomWelcome}
      hall={
        !isEditing && page > 1 ? (
          <RoomHall
            lines={[
              { label: "Name", value: displayName },
              { label: "Phone", value: form.phone },
              { label: "Email", value: form.email },
            ]}
            onEdit={() => setPage(1)}
            editLabel="Edit contact"
          />
        ) : null
      }
      onBack={!isEditing && page > 1 ? goBack : null}
      showSkip={!isEditing && page === 2}
      onSkip={
        !isEditing && page === 2
          ? () => {
              setError("");
              setPage(3);
            }
          : null
      }
      skipLabel="Skip address"
      primaryLabel={primaryLabel}
      primaryDisabled={primaryDisabled || busy}
      busy={busy}
      onSubmit={handleFormSubmit}
    >
      {/* —— Edit: one scrollable page with everything —— */}
      {isEditing && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <RoomField
              label="Legal last name"
              explainer="Legal last — as on license / ID"
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
            <RoomField
              label="Legal first name"
              explainer="Legal first — as on license / ID"
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </div>
          <RoomField
            label="Preferred name"
            optional
            value={form.preferredName}
            onChange={(e) =>
              setForm({ ...form, preferredName: e.target.value })
            }
          />
          <RoomField
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <RoomField
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <RoomField
            label="Street (as on license / ID)"
            optional
            explainer="Street as on license / official document"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <RoomField
              label="City"
              optional
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <RoomField
              label="State"
              optional
              explainer="ST"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
            <RoomField
              label="Zip"
              optional
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          </div>
          <PitchPicker />
          <RoomField
            label="Card #"
            optional
            explainer="Umpire card # (optional)"
            value={form.cardNumber}
            onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
          />
          <StatusPicker />
        </>
      )}

      {!isEditing && page === 1 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <RoomField
              label="Legal last name"
              explainer="Legal last — as on license / ID"
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
            <RoomField
              label="Legal first name"
              explainer="Legal first — as on license / ID"
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </div>
          <RoomField
            label="Preferred name"
            optional
            value={form.preferredName}
            onChange={(e) =>
              setForm({ ...form, preferredName: e.target.value })
            }
          />
          <RoomField
            label="Phone"
            required
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <RoomField
            label="Email"
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </>
      )}

      {!isEditing && page === 2 && (
        <>
          <RoomField
            label="Street (as on license / ID)"
            optional
            explainer="Street as on license / official document"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <RoomField
              label="City"
              optional
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <RoomField
              label="State"
              optional
              explainer="ST"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
            <RoomField
              label="Zip"
              optional
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          </div>
        </>
      )}

      {!isEditing && page === 3 && (
        <>
          <PitchPicker />
          <RoomField
            label="Card #"
            optional
            explainer="Umpire card # (optional)"
            value={form.cardNumber}
            onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
          />
          <StatusPicker />
        </>
      )}
    </RoomShell>
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
