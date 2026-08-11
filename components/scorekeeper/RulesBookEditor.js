"use client";

import { useMemo, useState } from "react";
import RulesBrowser from "@/components/RulesBrowser";

/**
 * Same public rule-book page, with an Edit mode for directors.
 * Saves structured JSON via /api/scorekeeper/docs.
 */
export default function RulesBookEditor({
  initialSource,
  initialSections,
  docId = null,
  initialTitle = "",
  initialSourceUrl = "",
  initialPublished = true,
}) {
  const [source, setSource] = useState(initialSource);
  const [sections, setSections] = useState(initialSections);
  const [title, setTitle] = useState(initialTitle || initialSource?.title || "");
  const [sourceUrl, setSourceUrl] = useState(
    initialSourceUrl || initialSource?.url || ""
  );
  const [year, setYear] = useState(initialSource?.year || "");
  const [published, setPublished] = useState(initialPublished !== false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [openSection, setOpenSection] = useState(0);

  const ruleCount = useMemo(
    () => sections.reduce((n, s) => n + (s.rules?.length || 0), 0),
    [sections]
  );

  function updateSection(si, patch) {
    setSections((cur) =>
      cur.map((s, i) => (i === si ? { ...s, ...patch } : s))
    );
  }

  function updateRule(si, ri, patch) {
    setSections((cur) =>
      cur.map((s, i) => {
        if (i !== si) return s;
        const rules = (s.rules || []).map((r, j) =>
          j === ri ? { ...r, ...patch } : r
        );
        return { ...s, rules };
      })
    );
  }

  function itemsToText(items) {
    return Array.isArray(items) ? items.join("\n") : "";
  }

  function textToItems(text) {
    return String(text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const nextSource = {
        title: title.trim() || source.title,
        year: year.trim() || source.year,
        url: sourceUrl.trim() || source.url,
      };
      const body = JSON.stringify({
        format: "rules-sections-v1",
        source: nextSource,
        sections,
      });
      const payload = {
        title: nextSource.title,
        kind: "rules",
        body,
        sourceUrl: nextSource.url || null,
        published,
        sortOrder: 0,
      };
      const res = await fetch(
        docId ? `/api/scorekeeper/docs/${docId}` : "/api/scorekeeper/docs",
        {
          method: docId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            docId
              ? payload
              : { ...payload, slug: "afa-slow-pitch-rule-book" }
          ),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setSource(nextSource);
      setSavedAt(new Date().toLocaleTimeString());
      setEditing(false);
      // If created, reload so next save has id
      if (!docId && json.doc?.id) {
        window.location.reload();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="t-strong">{source.title}</p>
            <p className="t-meta">
              {source.year ? `${source.year} · ` : ""}
              {sections.length} sections · {ruleCount} rules
              {savedAt ? ` · saved ${savedAt}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-transient text-sm"
              >
                Original PDF
              </a>
            )}
            <button
              type="button"
              className="btn-action"
              onClick={() => setEditing(true)}
            >
              Edit rule book
            </button>
          </div>
        </div>
        {error && (
          <p className="text-sm font-bold text-afa-ink underline">{error}</p>
        )}
        <p className="t-meta text-sm">
          This is the same book the public sees on{" "}
          <a href="/rules" className="underline">
            /rules
          </a>
          . Edit to change the live page.
        </p>
        <RulesBrowser sections={sections} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-strong">Editing rule book</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-transient"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setError("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-action"
            disabled={busy}
            onClick={save}
          >
            {busy ? "Saving…" : "Save to site"}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-sm font-bold text-afa-ink underline">{error}</p>
      )}

      <div className="card p-4 space-y-3">
        <label className="block space-y-1">
          <span className="form-label">Title</span>
          <input
            className="form-field w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="form-label">Year</span>
            <input
              className="form-field w-full"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="form-label">PDF / source link</span>
            <input
              className="form-field w-full"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published on /rules
        </label>
      </div>

      <div className="space-y-3">
        {sections.map((section, si) => (
          <div key={si} className="card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-afa-soft-gray/50"
              onClick={() =>
                setOpenSection((cur) => (cur === si ? -1 : si))
              }
            >
              <span className="font-display text-afa-navy">
                {section.number ? `${section.number} · ` : ""}
                {section.heading || `Section ${si + 1}`}
              </span>
              <span className="t-meta text-xs">
                {(section.rules || []).length} rules ·{" "}
                {openSection === si ? "Hide" : "Edit"}
              </span>
            </button>
            {openSection === si && (
              <div className="p-4 space-y-4 border-t border-afa-navy/10">
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="block space-y-1 sm:col-span-1">
                    <span className="form-label">Number</span>
                    <input
                      className="form-field w-full"
                      value={section.number || ""}
                      onChange={(e) =>
                        updateSection(si, { number: e.target.value })
                      }
                    />
                  </label>
                  <label className="block space-y-1 sm:col-span-3">
                    <span className="form-label">Heading</span>
                    <input
                      className="form-field w-full"
                      value={section.heading || ""}
                      onChange={(e) =>
                        updateSection(si, { heading: e.target.value })
                      }
                    />
                  </label>
                </div>
                {(section.rules || []).map((rule, ri) => (
                  <div
                    key={ri}
                    className="rounded-lg border border-afa-navy/10 p-3 space-y-2"
                  >
                    <div className="grid gap-2 sm:grid-cols-4">
                      <label className="block space-y-1">
                        <span className="form-label">#</span>
                        <input
                          className="form-field w-full"
                          value={rule.number || ""}
                          onChange={(e) =>
                            updateRule(si, ri, { number: e.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-1 sm:col-span-3">
                        <span className="form-label">Title</span>
                        <input
                          className="form-field w-full"
                          value={rule.title || ""}
                          onChange={(e) =>
                            updateRule(si, ri, { title: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className="form-label">Body</span>
                      <textarea
                        className="form-field w-full min-h-[100px] text-sm"
                        value={rule.body || ""}
                        onChange={(e) =>
                          updateRule(si, ri, { body: e.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="form-label">
                        List items (one per line, optional)
                      </span>
                      <textarea
                        className="form-field w-full min-h-[72px] text-sm font-mono"
                        value={itemsToText(rule.items)}
                        onChange={(e) =>
                          updateRule(si, ri, {
                            items: textToItems(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-action"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save to site"}
        </button>
        <button
          type="button"
          className="btn-transient"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Done
        </button>
      </div>
    </div>
  );
}
