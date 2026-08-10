"use client";

import { useMemo, useState } from "react";

const empty = () => ({
  firstName: "",
  lastName: "",
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

function pitchLabel(u) {
  if (u.pitchFast && u.pitchSlow) return "Both";
  if (u.pitchFast) return "Fast";
  if (u.pitchSlow) return "Slow";
  return "—";
}

export default function UmpireRoster({ initial = [], canEdit = true }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | slow | fast | both

  const filtered = useMemo(() => {
    return list.filter((u) => {
      if (filter === "slow") return u.pitchSlow && !u.pitchFast;
      if (filter === "fast") return u.pitchFast && !u.pitchSlow;
      if (filter === "both") return u.pitchFast && u.pitchSlow;
      return true;
    });
  }, [list, filter]);

  function startEdit(u) {
    setEditingId(u.id);
    setForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
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
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty());
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    if (!canEdit) return;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["slow", "Slow only"],
          ["fast", "Fast only"],
          ["both", "Both"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              filter === k ? "btn-action text-sm px-3 py-1.5" : "btn-transient text-sm px-3 py-1.5"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-afa-navy/10">
        {filtered.length === 0 ? (
          <p className="p-6 t-meta text-center">No umpires match.</p>
        ) : (
          filtered.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="t-body font-semibold">
                  {u.lastName}, {u.firstName}
                  {u.status === "inactive" && (
                    <span className="t-meta font-normal"> · inactive</span>
                  )}
                </p>
                <p className="t-meta">
                  {pitchLabel(u)}
                  {u.cardNumber ? ` · Card ${u.cardNumber}` : ""}
                  {u.phone ? ` · ${u.phone}` : ""}
                  {u.city ? ` · ${u.city}` : ""}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn-transient text-sm"
                  onClick={() => startEdit(u)}
                >
                  Edit
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {canEdit && (
        <form onSubmit={save} className="card p-4 space-y-3">
          <p className="t-strong">
            {editingId ? "Edit umpire" : "Add umpire"}
          </p>
          <p className="t-meta">
            Fields match the AFA State Umpire Batch Registration form.
          </p>
          {error && (
            <p className="text-sm font-bold text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="t-label">Last</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="t-label">First</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
              />
            </label>
          </div>
          <label className="block">
            <span className="t-label">Card #</span>
            <input
              className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
              value={form.cardNumber}
              onChange={(e) =>
                setForm({ ...form, cardNumber: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="t-label">Address</span>
            <input
              className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block col-span-1">
              <span className="t-label">City</span>
              <input
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="t-label">ST</span>
              <input
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="t-label">Zip</span>
              <input
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="t-label">Phone</span>
              <input
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="t-label">Email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.pitchSlow}
                onChange={(e) =>
                  setForm({ ...form, pitchSlow: e.target.checked })
                }
              />
              Slow pitch (S)
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.pitchFast}
                onChange={(e) =>
                  setForm({ ...form, pitchFast: e.target.checked })
                }
              />
              Fast pitch (F)
            </label>
            <span className="t-meta self-center">
              Both = check F and S
            </span>
          </div>
          <label className="block">
            <span className="t-label">Status</span>
            <select
              className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-action">
              {busy ? "Saving…" : editingId ? "Save changes" : "Add umpire"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-transient"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
