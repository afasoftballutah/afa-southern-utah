"use client";

import { useMemo, useState } from "react";
import { DOC_KINDS, kindLabel } from "@/lib/site-docs-kinds";
import RulesBookEditor from "@/components/scorekeeper/RulesBookEditor";
import { AddButton, DirectorAddPortal } from "@/components/scorekeeper/DirectorAddSlot";

const emptyForm = () => ({
  title: "",
  kind: "other",
  body: "",
  sourceUrl: "",
  version: "",
  sortOrder: "0",
  published: true,
});

const RULEBOOK_SLUG = "afa-slow-pitch-rule-book";

function isMainRuleBook(d) {
  if (!d) return false;
  if (d.slug === RULEBOOK_SLUG) return true;
  const body = String(d.body || "").trim();
  return body.startsWith('{"format":"rules-sections-v1"');
}

/**
 * Documents list. Edit / Unpublish / Delete per row.
 * Main rule book Edit opens the structured editor.
 */
export default function DocsAdmin({
  initialDocs = [],
  ruleBook = null,
}) {
  const [docs, setDocs] = useState(initialDocs);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  const listDocs = useMemo(() => {
    const hasBook = docs.some(isMainRuleBook);
    const rows =
      hasBook || !ruleBook
        ? [...docs]
        : [
            {
              id: ruleBook.docId || "__rulebook__",
              slug: RULEBOOK_SLUG,
              kind: "rules",
              title: ruleBook.title || ruleBook.source?.title || "Rule book",
              body: "",
              source_url: ruleBook.sourceUrl || ruleBook.source?.url || null,
              published: ruleBook.published !== false,
              version: null,
              sort_order: -1,
            },
            ...docs,
          ];
    return rows.sort((a, b) => {
      const ar = isMainRuleBook(a) ? 0 : 1;
      const br = isMainRuleBook(b) ? 0 : 1;
      if (ar !== br) return ar - br;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [docs, ruleBook]);

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function openRuleBook() {
    resetForm();
    setRulesOpen(true);
  }

  function startNew() {
    setRulesOpen(false);
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
    setError("");
  }

  function startEdit(d) {
    if (isMainRuleBook(d) && ruleBook) {
      openRuleBook();
      return;
    }
    setRulesOpen(false);
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

  function realDocId(d) {
    if (!d?.id || d.id === "__rulebook__") {
      return ruleBook?.docId || null;
    }
    return d.id;
  }

  async function setPublished(d, published) {
    const id = realDocId(d);
    if (!id) {
      setError("Rule book is not saved in the database yet.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/docs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      setDocs((cur) => {
        const has = cur.some((x) => x.id === id || isMainRuleBook(x));
        if (has) {
          return cur.map((x) =>
            x.id === id || isMainRuleBook(x) ? json.doc : x
          );
        }
        return [json.doc, ...cur];
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d) {
    const id = realDocId(d);
    const label = d.title || "this document";
    const msg = isMainRuleBook(d)
      ? `Delete “${label}”? The public /rules page will fall back to the built-in book until you add it again.`
      : `Delete “${label}”? This removes it from the public site.`;
    if (!window.confirm(msg)) return;
    if (!id) {
      setError("Nothing to delete in the database.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/docs/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not delete");
      setDocs((cur) =>
        cur.filter(
          (x) => x.id !== id && !(isMainRuleBook(d) && isMainRuleBook(x))
        )
      );
      if (editingId === id) resetForm();
      if (isMainRuleBook(d)) setRulesOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (rulesOpen && ruleBook) {
    return (
      <RulesBookEditor
        initialSource={ruleBook.source}
        initialSections={ruleBook.sections}
        docId={ruleBook.docId}
        initialTitle={ruleBook.title}
        initialSourceUrl={ruleBook.sourceUrl}
        initialPublished={ruleBook.published}
        onClose={() => setRulesOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DirectorAddPortal>
        {!showForm ? (
          <AddButton onClick={startNew} disabled={busy}>
            + Add document
          </AddButton>
        ) : null}
      </DirectorAddPortal>

      {error && (
        <p className="text-sm font-bold text-afa-ink underline">{error}</p>
      )}

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
        {listDocs.length === 0 && (
          <li className="p-6 text-center t-meta">No documents yet.</li>
        )}
        {listDocs.map((d) => {
          const mainBook = isMainRuleBook(d);
          const sectionN = ruleBook?.sections?.length;
          const published = d.published !== false;
          return (
            <li
              key={d.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="t-body font-semibold truncate">{d.title}</p>
                <p className="t-meta">
                  {kindLabel(d.kind)}
                  {mainBook && sectionN ? ` · ${sectionN} sections` : ""}
                  {mainBook
                    ? published
                      ? " · live on /rules"
                      : " · draft"
                    : ""}
                  {!mainBook && (published ? "" : " · draft")}
                  {!mainBook && d.version ? ` · ${d.version}` : ""}
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
                  onClick={() => setPublished(d, !published)}
                  disabled={busy}
                >
                  {published ? "Unpublish" : "Publish"}
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
          );
        })}
      </ul>

    </div>
  );
}
