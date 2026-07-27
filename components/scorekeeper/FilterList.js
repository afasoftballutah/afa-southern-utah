"use client";

import { useMemo, useState } from "react";
import DirectorCard, { CardGrid } from "./DirectorCard";

// The one list control. Every director list uses it, so search, filter and
// sort are in the same place, look the same and behave the same everywhere.
//
// JD, 2026-07-27: "easy filters, sorts, auto-filling searches" — and it has
// to stay usable by someone whose last tool was a printout.
//
// EVERYTHING IT TAKES IS PLAIN DATA. A server component cannot hand a
// function to a client one, so a row carries its own sort values and its own
// tags, and this file owns all the comparing. Callers describe, they do not
// compute.
//
//   rows    [{ key, href, label, sub, stats: [{label, value, alert?}],
//              footer, haystack, tags: string[],
//              sortValues: { [sortKey]: string|number } }]
//   sorts   [{ key, label, dir?: "asc"|"desc" }]   first is the default
//   filters [{ key, label, tag }]                  matches a row's tags
//
// Filtering is client-side on an already-loaded list. The whole league is
// tens of teams and hundreds of people, so it is instant, needs no API, and
// typing never waits on a round trip. A list that outgrows that needs paging,
// not a rewrite of this.
export default function FilterList({ rows, sorts = [], filters = [], empty }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(sorts[0]?.key ?? "");
  const [filterKey, setFilterKey] = useState("all");

  // Autocomplete comes from the list itself — no dictionary to maintain, and
  // it can only ever suggest something that will actually return a result.
  const suggestions = useMemo(
    () => [...new Set(rows.map((r) => r.label))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tag = filters.find((f) => f.key === filterKey)?.tag;
    let out = rows;
    if (tag) out = out.filter((r) => (r.tags ?? []).includes(tag));
    if (q) out = out.filter((r) => (r.haystack ?? r.label ?? "").toLowerCase().includes(q));

    const sort = sorts.find((s) => s.key === sortKey);
    if (sort) {
      const dir = sort.dir === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => {
        const av = a.sortValues?.[sort.key];
        const bv = b.sortValues?.[sort.key];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      });
    }
    return out;
  }, [rows, query, filterKey, sortKey, filters, sorts]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        list="director-suggestions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a name…"
        className="w-full border border-afa-navy/30 rounded-lg px-3 py-3 text-base"
      />
      <datalist id="director-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {filters.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ key: "all", label: "All" }, ...filters].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterKey(f.key)}
              className={
                "px-3 py-2 rounded-full whitespace-nowrap t-label border " +
                (filterKey === f.key
                  ? "bg-afa-navy text-white border-afa-navy"
                  : "border-afa-navy/20 text-afa-muted")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {sorts.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="t-label shrink-0">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="flex-1 border border-afa-navy/30 rounded-lg px-3 py-2 text-base"
          >
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* The count is always on screen. "Is this everything?" should never
          need asking, and a filtered list that looks short must say why. */}
      <p className="t-meta">
        Showing {visible.length} of {rows.length}
        {query.trim() && ` — matching “${query.trim()}”`}
      </p>

      {visible.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="t-meta">{empty ?? "Nothing matches that."}</p>
        </div>
      ) : (
        <CardGrid>
          {visible.map((r) => (
            <DirectorCard
              key={r.key}
              href={r.href}
              title={r.label}
              subtitle={r.sub}
              stats={r.stats}
              footer={r.footer}
              tone={r.tone}
            />
          ))}
        </CardGrid>
      )}
    </div>
  );
}
