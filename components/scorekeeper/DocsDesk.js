"use client";

import { useState } from "react";
import DocsAdmin from "@/components/scorekeeper/DocsAdmin";
import RulesBookEditor from "@/components/scorekeeper/RulesBookEditor";

/**
 * Documents desk: compact list by default. Rule book only opens when
 * you click Rules — then view or edit with a clear mode banner.
 */
export default function DocsDesk({
  otherDocs = [],
  bookSource,
  bookSections,
  bookDocId = null,
  bookTitle = "",
  bookSourceUrl = "",
  bookPublished = true,
}) {
  const [panel, setPanel] = useState("list"); // list | rules

  if (panel === "rules") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          className="btn-transient"
          onClick={() => setPanel("list")}
        >
          ← All documents
        </button>
        <RulesBookEditor
          initialSource={bookSource}
          initialSections={bookSections}
          docId={bookDocId}
          initialTitle={bookTitle}
          initialSourceUrl={bookSourceUrl}
          initialPublished={bookPublished}
          onClose={() => setPanel("list")}
        />
      </div>
    );
  }

  const sectionCount = bookSections?.length ?? 0;
  const ruleCount = (bookSections || []).reduce(
    (n, s) => n + (s.rules?.length || 0),
    0
  );

  return (
    <div className="space-y-4">
      <ul className="card divide-y divide-black/5">
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="t-body font-semibold">Rules</p>
            <p className="t-meta">
              {bookTitle || bookSource?.title || "Rule book"}
              {sectionCount
                ? ` · ${sectionCount} sections · ${ruleCount} rules`
                : ""}
              {bookPublished === false ? " · draft" : " · live on /rules"}
            </p>
          </div>
          <button
            type="button"
            className="btn-action shrink-0"
            onClick={() => setPanel("rules")}
          >
            Open
          </button>
        </li>
      </ul>

      <div className="space-y-2">
        <p className="t-meta">
          Umpire agreements, waivers, and house rules. The top published
          waiver is what teams sign at registration.
        </p>
        <DocsAdmin initialDocs={otherDocs} />
      </div>
    </div>
  );
}
