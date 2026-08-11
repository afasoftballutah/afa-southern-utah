"use client";

import { useMemo, useState } from "react";
import RulesBrowser from "@/components/RulesBrowser";

/**
 * Rule book for directors: same public browser, then edit section-by-section
 * without a wall of empty Number / # / Title / list fields.
 */
export default function RulesBookEditor({
  initialSource,
  initialSections,
  docId = null,
  initialTitle = "",
  initialSourceUrl = "",
  initialPublished = true,
  onClose,
}) {
  const [source, setSource] = useState(initialSource);
  const [sections, setSections] = useState(initialSections);
  const [title] = useState(initialTitle || initialSource?.title || "");
  const [sourceUrl] = useState(initialSourceUrl || initialSource?.url || "");
  const [year] = useState(initialSource?.year || "");
  const [published] = useState(initialPublished !== false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [openSection, setOpenSection] = useState(null);

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
      setOpenSection(null);
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
        <div className="rounded-lg border border-afa-navy/20 bg-afa-navy/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-afa-navy">
              Viewing · not editing
            </p>
            <p className="t-strong">{source.title}</p>
            <p className="t-meta">
              Live on /rules · {sections.length} sections · {ruleCount} rules
              {savedAt ? ` · last saved ${savedAt}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
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
            {onClose && (
              <button type="button" className="btn-transient" onClick={onClose}>
                Close
              </button>
            )}
            <button
              type="button"
              className="btn-action"
              onClick={() => {
                setEditing(true);
                setOpenSection(0);
              }}
            >
              Edit rule book
            </button>
          </div>
        </div>
        {error && (
          <p className="text-sm font-bold text-afa-ink underline">{error}</p>
        )}
        <RulesBrowser sections={sections} />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-afa-red/40 bg-red-50/30 p-3 sm:p-4">
      <div className="rounded-lg bg-afa-red text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider opacity-90">
            Editing rule book
          </p>
          <p className="font-bold leading-tight">
            Open a section and edit the text. Save when done.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            className="btn-transient bg-white text-afa-ink border-white"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setOpenSection(null);
              setError("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-action bg-white text-afa-red border-white hover:bg-afa-soft-gray"
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

      <div className="space-y-2">
        {sections.map((section, si) => {
          const open = openSection === si;
          const label = section.number
            ? `${section.number} · ${section.heading || ""}`
            : section.heading || `Section ${si + 1}`;
          return (
            <div
              key={si}
              className={
                "card overflow-hidden bg-white " +
                (open ? "ring-2 ring-afa-red/30" : "")
              }
            >
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                onClick={() => setOpenSection(open ? null : si)}
              >
                <span className="font-display text-afa-navy text-left">
                  {label}
                </span>
                <span className="t-meta text-xs shrink-0">
                  {(section.rules || []).length} rules ·{" "}
                  {open ? "Done" : "Edit"}
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-afa-navy/10 pt-3">
                  <label className="block space-y-1">
                    <span className="form-label">Section heading</span>
                    <input
                      className="form-field w-full"
                      value={section.heading || ""}
                      onChange={(e) =>
                        updateSection(si, { heading: e.target.value })
                      }
                    />
                  </label>

                  {(section.rules || []).map((rule, ri) => {
                    const hasTitle = Boolean(
                      String(rule.title || "").trim() ||
                        String(rule.number || "").trim()
                    );
                    const hasBody = Boolean(String(rule.body || "").trim());
                    const hasItems =
                      Array.isArray(rule.items) && rule.items.length > 0;
                    // Show body only when it has text, or when there is no list
                    // (list-only rules like Acts of Disbarment skip the empty box).
                    const showBody = hasBody || !hasItems;
                    return (
                      <div key={ri} className="space-y-2">
                        {hasTitle && (
                          <p className="text-sm font-bold text-afa-navy">
                            {[rule.number, rule.title].filter(Boolean).join(" ")}
                          </p>
                        )}
                        {showBody && (
                          <textarea
                            className="form-field w-full min-h-[120px] text-sm leading-relaxed"
                            value={rule.body || ""}
                            onChange={(e) =>
                              updateRule(si, ri, { body: e.target.value })
                            }
                            aria-label={
                              hasTitle
                                ? `Text for ${rule.title || rule.number}`
                                : `Section text ${ri + 1}`
                            }
                          />
                        )}
                        {hasItems && (
                          <label className="block space-y-1">
                            <span className="form-label">List items</span>
                            <textarea
                              className="form-field w-full min-h-[80px] text-sm"
                              value={itemsToText(rule.items)}
                              onChange={(e) =>
                                updateRule(si, ri, {
                                  items: textToItems(e.target.value),
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 sticky bottom-2 bg-white/95 border border-afa-red/30 rounded-lg p-2 shadow-sm">
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
          onClick={() => {
            setEditing(false);
            setOpenSection(null);
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
