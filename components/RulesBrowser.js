"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";

// Plain client-side substring search over the 140 transcribed rules
// (dispatch-brief-10, JD: "rules search (basic), no AI"). Case-insensitive
// substring matching is the whole algorithm — no fuzzy library, no debounce,
// no result-jump navigation. 140 rules filter instantly on every keystroke.

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(s) {
  return (s ?? "").toLowerCase();
}

// Highlights case-insensitive matches of `query` inside `text`, preserving
// the original casing of the matched substring. Returns the plain string
// unchanged when there's nothing to highlight.
function highlight(text, query) {
  if (!text) return text;
  if (!query) return text;
  const re = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = String(text).split(re);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-afa-navy/10 text-afa-ink rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function ruleMatches(rule, needle) {
  if (needle === "") return true;
  if (normalize(rule.number).includes(needle)) return true;
  if (normalize(rule.title).includes(needle)) return true;
  if (normalize(rule.body).includes(needle)) return true;
  if (rule.items && rule.items.some((item) => normalize(item).includes(needle))) return true;
  return false;
}

export default function RulesBrowser({ sections }) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const active = trimmed.length >= 2;
  const needle = active ? normalize(trimmed) : "";

  const filtered = active
    ? sections
        .map((section) => {
          const headingMatches = normalize(section.heading).includes(needle);
          const matchingRules = section.rules.filter((rule) => ruleMatches(rule, needle));
          if (headingMatches) {
            return { section, rules: section.rules, matched: true };
          }
          if (matchingRules.length > 0) {
            return { section, rules: matchingRules, matched: true };
          }
          return { section, rules: [], matched: false };
        })
        .filter((entry) => entry.matched)
    : sections.map((section) => ({ section, rules: section.rules, matched: true }));

  const ruleCount = active
    ? filtered.reduce((sum, entry) => sum + entry.rules.length, 0)
    : null;
  const sectionCount = active ? filtered.length : null;

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the rules"
          aria-label="Search the rules"
          className="w-full rounded-lg border border-afa-navy/25 bg-white px-4 py-3 text-base"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-afa-ink/50 hover:text-afa-navy"
          >
            &times;
          </button>
        )}
      </div>

      {active && (
        <p className="text-sm text-afa-ink/70">
          {ruleCount === 0
            ? `No rules match "${trimmed}".`
            : `${ruleCount} ${ruleCount === 1 ? "rule" : "rules"} in ${sectionCount} ${
                sectionCount === 1 ? "section" : "sections"
              }`}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map(({ section, rules }, i) => (
          <Card key={i} variant="default">
            <details className="group" open={active || undefined}>
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-11 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-lg text-afa-navy">
                  {section.number ? `${section.number} · ${section.heading}` : section.heading}
                </span>
                <span className="text-afa-muted transition-transform group-open:rotate-90">
                  &rsaquo;
                </span>
              </summary>
              <div className="mt-3 space-y-4">
                {rules.map((rule, j) => (
                  <div key={j}>
                    {(rule.number || rule.title) && (
                      <p className="text-sm font-bold text-afa-navy">
                        {rule.number}
                        {rule.number && rule.title ? " " : ""}
                        {highlight(rule.title, needle)}
                      </p>
                    )}
                    {rule.body && (
                      <p className="text-sm text-afa-ink/90 whitespace-pre-line">
                        {highlight(rule.body, needle)}
                      </p>
                    )}
                    {rule.items && rule.items.length > 0 && (
                      <ul className="list-disc pl-5 text-sm text-afa-ink/90 space-y-1">
                        {rule.items.map((item, k) => (
                          <li key={k}>{highlight(item, needle)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
