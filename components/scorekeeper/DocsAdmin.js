"use client";

import { useMemo, useState } from "react";
import { DOC_KINDS, kindLabel } from "@/lib/site-docs-kinds";

const emptyForm = () => ({
  title: "",
  kind: "rules",
  body: "",
  sourceUrl: "",
  version: "",
  sortOrder: "0",
  published: true,
});

/**
 * Director documents desk: rules, umpire agreements, waivers, other.
 * List + expand one editor at a time (compact by default).
 */
export default function DocsAdmin({ initialDocs = [] }) {
  const [docs, setDocs] = useState(initialDocs);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (filter === "all") return docs;
    return docs.filter((d) => d.kind === filter);
  }, [docs, filter]);

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
    setError("");
  }

  function startEdit(d) {
    setEditingId(d.id);
    setForm({
      title: d.title || "",
      kind: d.kind || "other",
      body: d.body || "",
      sourceUrl: d.source_url || "",
      version: d.version || "",
      sortOrder: String(d.sort_order ?? 0),
      published: d.published !== false,
    });
    setShowForm(true);
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        kind: form.kind,
        body: form.body,
        sourceUrl: form.sourceUrl.trim() || null,
        version: form.version.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        published: form.published,
      };
      const res = await fetch(
        editingId
          ? `/api/scorekeeper/docs/${editingId}`
          : "/api/scorekeeper/docs",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      if (editingId) {
        setDocs((cur) =>
          cur.map((d) => (d.id === editingId ? json.doc : d))
        );
      } else {
        setDocs((cur) => [json.doc, ...cur]);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setPublished(d, published) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/docs/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      setDocs((cur) => cur.map((x) => (x.id === d.id ? json.doc : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d) {
    if (
      !window.confirm(
        `Delete “${d.title}”? This removes it from the public site.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/docs/${d.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not delete");
      setDocs((cur) => cur.filter((x) => x.id !== d.id));
      if (editingId === d.id) resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm font-bold text-afa-ink underline">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all", label: "All" },
          ...DOC_KINDS,
        ].map((k) => {
          const on = filter === k.value;
          return (
            <button
              key={k.value}
              type="button"
              className={on ? "btn-info" : "btn-transient"}
              aria-pressed={on}
              onClick={() => setFilter(k.value)}
            >
              {k.label}
            </button>
          );
        })}
        <button
          type="button"
          className="btn-action ml-auto"
          onClick={startNew}
          disabled={busy}
        >
          + Add document
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 space-y-3">
          <p className="t-strong">
            {editingId ? "Edit document" : "New document"}
          </p>
          <label className="block space-y-1">
            <span className="form-label">Title</span>
            <input
              className="form-field w-full"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="e.g. Southern Utah house rules"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="form-label">Type</span>
              <select
                className="form-field w-full"
                value={form.kind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, kind: e.target.value }))
                }
              >
                {DOC_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="form-label">Sort order</span>
              <input
                className="form-field w-full"
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="form-label">PDF or link (optional)</span>
            <input
              className="form-field w-full"
              type="url"
              value={form.sourceUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, sourceUrl: e.target.value }))
              }
              placeholder="https://…"
            />
          </label>
          {form.kind === "waiver" && (
            <label className="block space-y-1">
              <span className="form-label">
                Version tag (saved with each registration)
              </span>
              <input
                className="form-field w-full"
                value={form.version}
                onChange={(e) =>
                  setForm((f) => ({ ...f, version: e.target.value }))
                }
                placeholder="e.g. waiver-2026-v2"
              />
            </label>
          )}
          <label className="block space-y-1">
            <span className="form-label">Body</span>
            <textarea
              className="form-field w-full min-h-[180px] font-mono text-sm"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Plain text. Blank lines start new paragraphs."
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) =>
                setForm((f) => ({ ...f, published: e.target.checked }))
              }
            />
            Published (visible on the public site)
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn-action"
              disabled={busy || !form.title.trim()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn-transient"
              onClick={resetForm}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
          {form.kind === "waiver" && (
            <p className="t-meta text-xs">
              The first published waiver (by sort order) is what managers and
              players agree to on registration and signing.
            </p>
          )}
        </form>
      )}

      <ul className="card divide-y divide-black/5">
        {filtered.length === 0 && (
          <li className="p-6 text-center t-meta">
            No documents{filter !== "all" ? ` in ${kindLabel(filter)}` : ""}{" "}
            yet.
          </li>
        )}
        {filtered.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="t-body font-semibold truncate">{d.title}</p>
              <p className="t-meta">
                {kindLabel(d.kind)}
                {d.published ? "" : " · draft"}
                {d.version ? ` · ${d.version}` : ""}
                {d.source_url ? " · has link" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                className="btn-transient text-sm"
                onClick={() => startEdit(d)}
                disabled={busy}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-transient text-sm"
                onClick={() => setPublished(d, !d.published)}
                disabled={busy}
              >
                {d.published ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                className="btn-transient text-sm text-red-700"
                onClick={() => remove(d)}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
