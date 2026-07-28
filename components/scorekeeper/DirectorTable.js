"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";

// The one table. Every director list is one of these.
//
// JD, 2026-07-27: "we need concise lists. the director is going to be on a
// computer most of the time, not phone. So use the screen width we have and
// dont have one piece of data extend to two lines unless needed. With very
// readable font... Sorting should be intuitive, not a huge dropdown box."
//
// So: real columns, a header you click to sort, and one line per record. This
// is what the sanctioning bodies do and it is what these directors already
// read on paper. Cards were the wrong instrument for a list you scan.
//
// Columns are described, never computed by the caller — a server component
// cannot hand a function across, so every cell arrives as a finished value
// and this file owns sorting and filtering.
//
//   columns [{ key, label, align?, width?, type?: "check"|"text", hideBelow? }]
//   rows    [{ key, href, detailRows?, cells: {…}, sortValues: {…}, tags: [],
//              search }]
//
// A row with `detailRows` opens in place instead of navigating, and the rows
// it opens use THE SAME COLUMNS. JD, 2026-07-27: "youre reinventing formats
// over and over... have the accordion open in the same columns." A nested
// table with its own headings was a third layout to read; aligned rows are
// just more of the record you are already looking at.

function Arrow({ dir }) {
  return <span className="text-afa-navy/60">{dir === "desc" ? "▼" : "▲"}</span>;
}

export default function DirectorTable({
  columns,
  rows,
  filters = [],
  defaultSort,
  empty = "Nothing matches that.",
  searchPlaceholder = "Type a name…",
  openRow = null,
  // A Tailwind max-w class. A table with four columns should not stretch to
  // the width a nine-column one needs — the extra all lands in the first
  // column and pushes everything else to the far side of the screen (JD,
  // 2026-07-27: "still seems super wide?").
  width = "",
}) {
  const [query, setQuery] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [sort, setSort] = useState(defaultSort ?? { key: columns[0]?.key, dir: "asc" });
  const [openKey, setOpenKey] = useState(openRow ?? null);

  const suggestions = useMemo(
    () => [...new Set(rows.map((r) => r.cells[columns[0].key]).filter(Boolean))].sort(),
    [rows, columns]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tag = filters.find((f) => f.key === filterKey)?.tag;
    let out = rows;
    if (tag) out = out.filter((r) => (r.tags ?? []).includes(tag));
    if (q) out = out.filter((r) => (r.search ?? "").toLowerCase().includes(q));

    const dir = sort.dir === "desc" ? -1 : 1;
    return [...out].sort((a, b) => {
      const av = a.sortValues?.[sort.key] ?? a.cells?.[sort.key];
      const bv = b.sortValues?.[sort.key] ?? b.cells?.[sort.key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "boolean" && typeof bv === "boolean") return (av === bv ? 0 : av ? 1 : -1) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [rows, query, filterKey, sort, filters]);

  function toggleSort(key) {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className={"space-y-2 " + width}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          list="director-suggestions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 min-w-[14rem] border border-afa-navy/30 rounded-lg px-3 py-2 text-[15px]"
        />
        <datalist id="director-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterKey((cur) => (cur === f.key ? "all" : f.key))}
            className={
              "px-3 py-2 rounded-lg whitespace-nowrap t-label border " +
              (filterKey === f.key
                ? "bg-afa-navy text-white border-afa-navy"
                : "border-afa-navy/20 text-afa-muted")
            }
          >
            {f.label}
          </button>
        ))}

        <span className="t-meta ml-auto whitespace-nowrap">
          {visible.length} of {rows.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="t-meta">{empty}</p>
        </div>
      ) : (
        // Scrolls inside itself rather than pushing the page sideways. On a
        // laptop nothing scrolls; on a phone the table survives.
        <div className="card overflow-x-auto dense-controls">
          {/* 14px, not 15 — the Team and Tournament columns had to fit on one
              line and a name may never be cut off (JD, 2026-07-27: "the names
              cant be ellipsis... shrink the fonts as needed"). */}
          <table className="w-full text-[14px] leading-snug">
            <thead>
              <tr className="border-b border-afa-navy/15">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={
                      "px-3 py-1.5 font-normal " +
                      (c.align === "right" ? "text-right " : c.align === "center" ? "text-center " : "text-left ") +
                      (c.hideBelow === "sm" ? "hidden sm:table-cell " : "")
                    }
                    style={c.width ? { width: c.width } : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="t-label hover:text-afa-navy inline-flex items-center gap-1"
                    >
                      {c.label}
                      {sort.key === c.key && <Arrow dir={sort.dir} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const expandable = Boolean(r.detailRows?.length);
                const isOpen = expandable && openKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr
                      className={
                        "border-b border-black/5 " +
                        (expandable ? "cursor-pointer " : "") +
                        (isOpen ? "bg-afa-navy/[0.05]" : "hover:bg-afa-navy/[0.03]")
                      }
                      onClick={
                        expandable
                          ? (e) => {
                              // A click on a control inside the row is for
                              // that control, not for opening the row.
                              if (e.target.closest("select, a, button, input")) return;
                              setOpenKey(isOpen ? null : r.key);
                            }
                          : undefined
                      }
                    >
                      {columns.map((c, i) => {
                        const value = r.cells[c.key];
                        const content =
                          c.type === "check" ? (
                            <span className={"tick " + (value ? "text-afa-go" : "text-afa-muted/50")}>
                              {value ? "☑" : "☐"}
                            </span>
                          ) : (
                            value
                          );
                        return (
                          <td
                            key={c.key}
                            className={
                              "px-3 py-1.5 whitespace-nowrap " +
                              (c.align === "right"
                                ? "text-right tabular-nums "
                                : c.align === "center"
                                  ? "text-center "
                                  : "") +
                              (c.hideBelow === "sm" ? "hidden sm:table-cell " : "") +
                              (i === 0 ? "font-semibold text-afa-navy" : "text-afa-ink")
                            }
                          >
                            {i === 0 && expandable && (
                              <span className="text-afa-navy/40 mr-1.5 inline-block w-2">
                                {isOpen ? "▾" : "▸"}
                              </span>
                            )}
                            {i === 0 && r.href && !expandable ? (
                              <Link href={r.href} className="hover:underline">
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isOpen &&
                      (r.detailRows ?? []).map((d) => (
                        <tr key={d.key} className="border-b border-black/5 bg-afa-navy/[0.03]">
                          {columns.map((c, i) => (
                            <td
                              key={c.key}
                              className={
                                "px-3 py-1 whitespace-nowrap text-afa-ink/85 " +
                                (c.align === "right"
                                  ? "text-right tabular-nums "
                                  : c.align === "center"
                                    ? "text-center "
                                    : "") +
                                (c.hideBelow === "sm" ? "hidden sm:table-cell " : "") +
                                (i === 0 ? "pl-8" : "")
                              }
                            >
                              {c.type === "check" && typeof d.cells[c.key] === "boolean" ? (
                                <span
                                  className={
                                    "tick " + (d.cells[c.key] ? "text-afa-go" : "text-afa-muted/50")
                                  }
                                >
                                  {d.cells[c.key] ? "☑" : "☐"}
                                </span>
                              ) : (
                                (d.cells[c.key] ?? "")
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
