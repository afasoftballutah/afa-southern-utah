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
//   columns [{ key, label, group?, align?, width?, type?: "check"|"text",
//              hideBelow? }]
//
// Consecutive columns sharing a `group` get one spanning heading above them,
// so "Minimum" is said once over M and W rather than twice inside them.
//   rows    [{ key, href, detailRows?, cells: {…}, sortValues: {…}, tags: [],
//              search }]
//
// A row with `detailRows` opens in place instead of navigating, and the rows
// it opens use THE SAME COLUMNS. JD, 2026-07-27: "youre reinventing formats
// over and over... have the accordion open in the same columns." A nested
// table with its own headings was a third layout to read; aligned rows are
// just more of the record you are already looking at.

/** Runs of columns that share a group, as {label, span} in column order. */
function groupSpans(columns) {
  const out = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (last && last.label === (c.group ?? null)) last.span += 1;
    else out.push({ label: c.group ?? null, span: 1 });
  }
  return out;
}

function Arrow({ dir }) {
  return <span className="text-afa-navy/60">{dir === "desc" ? "▼" : "▲"}</span>;
}

export default function DirectorTable({
  columns,
  rows,
  filters = [],
  defaultSort,
  /** Initial filter key, or "all". Score sheets default to "need a score". */
  defaultFilter = "all",
  empty = "Nothing matches that.",
  searchPlaceholder = "Type a name…",
  // A list of four divisions does not need a box to find one in (JD,
  // 2026-07-28). Off, the whole control row goes with it.
  search = true,
  openRow = null,
  // A Tailwind max-w class. A table with four columns should not stretch to
  // the width a nine-column one needs — the extra all lands in the first
  // column and pushes everything else to the far side of the screen (JD,
  // 2026-07-27: "still seems super wide?").
  width = "",
  // Rendered inside the same card, above the table. For a control that makes
  // the rows below it — a separate card left them looking unrelated.
  before = null,
  /** Bigger, labeled filter chips with counts — for scorekeeper game lists. */
  filterStyle = "default", // default | segmented
}) {
  const [query, setQuery] = useState("");
  const [filterKey, setFilterKey] = useState(defaultFilter);
  const [sort, setSort] = useState(defaultSort ?? { key: columns[0]?.key, dir: "asc" });
  const [openKey, setOpenKey] = useState(openRow ?? null);

  // Only string cells for the datalist — JSX cell values are not valid option keys.
  const suggestions = useMemo(() => {
    const firstKey = columns[0]?.key;
    return [
      ...new Set(
        rows
          .map((r) => r.cells[firstKey])
          .filter((v) => typeof v === "string" && v.length > 0)
      ),
    ].sort();
  }, [rows, columns]);

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

  // mx-auto, because a narrowed table pinned to the left leaves the page
  // looking broken rather than deliberate.
  return (
    <div className={"space-y-2 " + (width ? width + " mx-auto" : "")}>
      {(search || filters.length > 0) && (
      <div className="flex flex-wrap items-center gap-2">
        {search && (
        <>
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
        </>
        )}

        {filterStyle === "segmented" ? (
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              ...filters,
              { key: "all", label: "All games", tag: null, tone: "neutral" },
            ].map((f) => {
              const count =
                f.key === "all"
                  ? rows.length
                  : rows.filter((r) => (r.tags ?? []).includes(f.tag)).length;
              const on = filterKey === f.key;
              const tone = f.tone || "neutral";
              const onCls =
                tone === "action"
                  ? "border-afa-red bg-afa-red text-white"
                  : tone === "quiet"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-afa-navy bg-afa-navy text-white";
              const offCls =
                tone === "action"
                  ? "border-red-200 bg-red-50 text-red-950"
                  : tone === "quiet"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-afa-navy/15 bg-white text-afa-navy";
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterKey(f.key)}
                  className={
                    "rounded-xl border-2 px-3 py-2.5 text-left font-bold text-sm " +
                    (on ? onCls : offCls)
                  }
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span>{f.label}</span>
                    <span className="tabular-nums text-lg font-black">{count}</span>
                  </span>
                  {f.hint && (
                    <span
                      className={
                        "block text-xs font-medium mt-0.5 " +
                        (on ? "opacity-85" : "opacity-65")
                      }
                    >
                      {f.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          filters.map((f) => {
            const count = rows.filter((r) =>
              (r.tags ?? []).includes(f.tag)
            ).length;
            const on = filterKey === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() =>
                  setFilterKey((cur) => (cur === f.key ? "all" : f.key))
                }
                className={
                  "rounded-full border px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap tabular-nums " +
                  (on
                    ? "bg-afa-navy text-white border-afa-navy"
                    : "border-afa-navy/20 bg-white text-afa-muted hover:border-afa-navy/40")
                }
              >
                {f.label}
                <span className="ml-1 opacity-80">{count}</span>
              </button>
            );
          })
        )}

        {filterStyle !== "segmented" && (
          <button
            type="button"
            onClick={() => setFilterKey("all")}
            className={
              "rounded-full border px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap tabular-nums " +
              (filterKey === "all"
                ? "bg-afa-navy text-white border-afa-navy"
                : "border-afa-navy/20 bg-white text-afa-muted hover:border-afa-navy/40")
            }
          >
            All
            <span className="ml-1 opacity-80">{rows.length}</span>
          </button>
        )}

        {filterStyle !== "segmented" && (
          <span className="t-meta ml-auto whitespace-nowrap text-[12px]">
            {visible.length} shown
          </span>
        )}
      </div>
      )}

      {visible.length === 0 ? (
        <div className="card p-4 space-y-4">
          {before}
          <p className="t-meta text-center">{empty}</p>
        </div>
      ) : (
        // Scrolls inside itself rather than pushing the page sideways. On a
        // laptop nothing scrolls; on a phone the table survives.
        <div className="card dense-controls">
          {before && <div className="p-4">{before}</div>}
          <div className="overflow-x-auto">
          {/* 14px, not 15 — the Team and Tournament columns had to fit on one
              line and a name may never be cut off (JD, 2026-07-27: "the names
              cant be ellipsis... shrink the fonts as needed"). */}
          <table className="w-full text-[14px] leading-snug">
            <thead>
              {columns.some((c) => c.group) && (
                <tr>
                  {groupSpans(columns).map((g, i) => (
                    <th
                      key={i}
                      colSpan={g.span}
                      className="px-3 pt-2 pb-0 t-label font-normal text-center"
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
              )}
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
                const expandable = Boolean(r.detailRows?.length || r.detail);
                const isOpen = expandable && openKey === r.key;
                // One row open means you are working on that row. The others
                // step back so the wrong one cannot be edited by mistake, and
                // they come back the moment it closes. JD, 2026-07-28: "the
                // rest should fade to the background so we dont get confused."
                const faded = openKey !== null && !isOpen;
                return (
                  <Fragment key={r.key}>
                    <tr
                      className={
                        "border-b border-black/5 transition-opacity " +
                        (expandable ? "cursor-pointer " : "") +
                        (faded ? "opacity-30 hover:opacity-100 " : "") +
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
                    {(r.panel || (isOpen && r.detail)) && (
                      <tr
                        className={
                          "border-b border-black/5 bg-afa-navy/[0.03] transition-opacity " +
                          (faded ? "opacity-30 hover:opacity-100" : "")
                        }
                      >
                        <td
                          colSpan={columns.length}
                          className="px-3 sm:px-4 py-2.5 sm:py-3 align-top"
                        >
                          {r.panel ?? r.detail}
                        </td>
                      </tr>
                    )}
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
        </div>
      )}
    </div>
  );
}
