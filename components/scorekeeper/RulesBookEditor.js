"use client";

import { useMemo, useState } from "react";
import RulesBrowser from "@/components/RulesBrowser";
import WorkFocus from "@/components/forms/WorkFocus";

/**
 * Flatten a section's rules into one editable text block.
 * Entries separated by blank lines. First short line = title (optional number).
 * Lines that look like list markers become items.
 */
function sectionToText(section) {
  return (section.rules || [])
    .map((rule) => {
      const parts = [];
      const head = [rule.number, rule.title].filter(Boolean).join(" ").trim();
      if (head) parts.push(head);
      if (rule.body) parts.push(String(rule.body).trim());
      if (Array.isArray(rule.items) && rule.items.length) {
        parts.push(rule.items.map((i) => String(i).trim()).join("\n"));
      }
      return parts.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function looksLikeListLine(line) {
  return (
    /^[-•]\s/.test(line) ||
    /^[A-Z]\.\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    /^\(\d+\)\s/.test(line)
  );
}

function textToRules(text) {
  const blocks = String(text || "")
    .trim()
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) {
    return [{ number: "", title: "", body: "", items: [] }];
  }
  return blocks.map((block) => {
    const lines = block.split("\n");
    let number = "";
    let title = "";
    let start = 0;

    // First line as title when multi-line and short enough
    if (
      lines.length > 1 &&
      lines[0].length <= 120 &&
      !looksLikeListLine(lines[0])
    ) {
      const numbered = lines[0].match(/^(\d+[A-Za-z]?)\s+(.+)$/);
      if (numbered) {
        number = numbered[1];
        title = numbered[2];
      } else {
        title = lines[0];
      }
      start = 1;
    }

    const bodyLines = [];
    const items = [];
    for (const line of lines.slice(start)) {
      if (looksLikeListLine(line)) {
        items.push(line.replace(/^[-•]\s/, "").trim());
      } else {
        bodyLines.push(line);
      }
    }
    return {
      number,
      title,
      body: bodyLines.join("\n").trim(),
      items,
    };
  });
}

/**
 * Rule book for directors: one editable box per section.
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
  /** Parallel text draft per section index while editing */
  const [drafts, setDrafts] = useState({});

  const ruleCount = useMemo(
    () => sections.reduce((n, s) => n + (s.rules?.length || 0), 0),
    [sections]
  );

  function openEdit() {
    const next = {};
    sections.forEach((s, i) => {
      next[i] = sectionToText(s);
    });
    setDrafts(next);
    setEditing(true);
    setOpenSection(0);
  }

  function setDraft(si, text) {
    setDrafts((cur) => ({ ...cur, [si]: text }));
    setSections((cur) =>
      cur.map((s, i) =>
        i === si
          ? {
              ...s,
              rules: textToRules(text),
            }
          : s
      )
    );
  }

  function updateHeading(si, heading) {
    setSections((cur) =>
      cur.map((s, i) => (i === si ? { ...s, heading } : s))
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      // Flush drafts into sections once more
      const nextSections = sections.map((s, i) => ({
        ...s,
        rules: textToRules(
          drafts[i] !== undefined ? drafts[i] : sectionToText(s)
        ),
      }));
      const nextSource = {
        title: title.trim() || source.title,
        year: year.trim() || source.year,
        url: sourceUrl.trim() || source.url,
      };
      const body = JSON.stringify({
        format: "rules-sections-v1",
        source: nextSource,
        sections: nextSections,
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
      setSections(nextSections);
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
            <button type="button" className="btn-action" onClick={openEdit}>
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
    <WorkFocus
      onScrimClick={() => {
        if (busy) return;
        setEditing(false);
        setOpenSection(null);
        setError("");
      }}
      className="max-w-3xl"
    >
    <div className="space-y-3 p-3 sm:p-4 bg-red-50/40">
      <div className="rounded-lg bg-afa-red text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider opacity-90">
            Editing rule book
          </p>
          <p className="font-bold leading-tight">
            One box per section. Blank lines separate entries.
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
          const draft =
            drafts[si] !== undefined ? drafts[si] : sectionToText(section);
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
                  {(section.rules || []).length} entries ·{" "}
                  {open ? "Done" : "Edit"}
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-afa-navy/10 pt-3">
                  <label className="block space-y-1">
                    <span className="form-label">Section heading</span>
                    <input
                      className="form-field w-full"
                      value={section.heading || ""}
                      onChange={(e) => updateHeading(si, e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="form-label">Section text</span>
                    <textarea
                      className="form-field w-full min-h-[280px] text-sm leading-relaxed font-sans"
                      value={draft}
                      onChange={(e) => setDraft(si, e.target.value)}
                      spellCheck
                    />
                  </label>
                  <p className="t-meta text-xs">
                    Separate definitions or rules with a blank line. Put the
                    title on the first line of each block; list lines can start
                    with A. or 1.
                  </p>
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
    </WorkFocus>
  );
}
