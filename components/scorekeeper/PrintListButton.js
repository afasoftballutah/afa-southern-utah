"use client";

/**
 * Print a clean table (headers + current filtered rows) — not the whole page.
 * Uses the browser print dialog so “Save as PDF” still works.
 */

function pageTitle() {
  const h1 = document.querySelector(".director-desk .t-title");
  const count = document.querySelector(".director-desk .t-meta");
  const t = (h1?.textContent || document.title || "List").trim();
  const c = count?.textContent?.trim();
  return c ? `${t} — ${c}` : t;
}

/** Plain text from a cell; drop control chrome. */
function cellText(node) {
  if (!node) return "";
  const clone = node.cloneNode(true);
  clone
    .querySelectorAll(
      "button, select, input, .pill, .tick, [aria-hidden], svg"
    )
    .forEach((el) => el.remove());
  // Prefer visible link text, not full URL
  return (clone.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/[▾▸]/g, "")
    .trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build print HTML from the first real data table in the desk body.
 * Skips empty / decorative headers; uses last header row as column labels.
 */
function tableFromDirectorTable(root) {
  const table = root.querySelector("table");
  if (!table) return null;

  const headerRows = [...table.querySelectorAll("thead tr")];
  if (!headerRows.length) return null;

  // Last header row has the real column labels (group row may be above).
  const labelRow = headerRows[headerRows.length - 1];
  const headers = [...labelRow.querySelectorAll("th")].map((th) =>
    cellText(th)
  );
  // Drop empty action columns at end
  while (headers.length && !headers[headers.length - 1]) {
    headers.pop();
  }
  if (!headers.length) return null;

  const bodyRows = [...table.querySelectorAll("tbody tr")].filter((tr) => {
    // Skip expanded detail chrome rows if any
    if (tr.querySelector("table")) return false;
    const cells = tr.querySelectorAll("td");
    return cells.length > 0;
  });

  if (!bodyRows.length) return null;

  const thead = `<thead><tr>${headers
    .map((h) => `<th>${escapeHtml(h || "—")}</th>`)
    .join("")}</tr></thead>`;

  const tbody = `<tbody>${bodyRows
    .map((tr) => {
      const tds = [...tr.querySelectorAll("td")].slice(0, headers.length);
      while (tds.length < headers.length) {
        tds.push(null);
      }
      return `<tr>${tds
        .map((td) => `<td>${escapeHtml(cellText(td))}</td>`)
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
}

/** Fallback: card list / umpire list → simple 2-col table */
function tableFromList(root) {
  const items = [
    ...root.querySelectorAll(
      "ul.card > li, ul.divide-y > li, .card ul > li"
    ),
  ].filter((li) => {
    // Skip empty states
    if (li.querySelector("button.btn-action, button.btn-add")) return false;
    const text = cellText(li);
    return text.length > 2 && !/^no (documents|posts|umpires)/i.test(text);
  });

  if (!items.length) return null;

  const rows = items.map((li) => {
    const title =
      li.querySelector(".t-body, .t-strong, .font-semibold")?.textContent?.trim() ||
      cellText(li).split("·")[0].trim();
    const meta = li.querySelector(".t-meta")?.textContent?.trim() || "";
    // Strip action labels that leaked into meta
    const metaClean = meta
      .replace(/\b(Edit|Open|Delete|Unpublish|Publish|Suspend)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return { title, meta: metaClean };
  });

  return `<table>
    <thead><tr><th>Name</th><th>Details</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.meta)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function buildPrintHtml() {
  const root =
    document.querySelector(".director-print-body") ||
    document.querySelector(".director-desk") ||
    document.querySelector(".scorekeeper-scope");
  if (!root) return null;

  const title = pageTitle();
  const when = new Date().toLocaleString();
  const tableHtml =
    tableFromDirectorTable(root) || tableFromList(root);

  if (!tableHtml) return null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0.6in; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 10pt;
      color: #111;
      margin: 0;
    }
    h1 {
      font-size: 14pt;
      font-weight: 700;
      margin: 0 0 4px;
      color: #0f172a;
    }
    .meta {
      font-size: 9pt;
      color: #555;
      margin: 0 0 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    th, td {
      border: 1px solid #333;
      padding: 5px 8px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #e8e8e8;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td { font-size: 10pt; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Printed ${escapeHtml(when)} · filtered view as shown on screen</p>
  ${tableHtml}
</body>
</html>`;
}

function printTable() {
  const html = buildPrintHtml();
  if (!html) {
    window.alert(
      "Nothing to print yet — open a list with rows (and a table or card list)."
    );
    return;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);

  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    window.alert("Could not open the print view.");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = frame.contentWindow;
  const cleanup = () => {
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 500);
  };

  // Wait for layout, then print
  setTimeout(() => {
    try {
      win?.focus();
      win?.print();
    } finally {
      cleanup();
    }
  }, 100);
}

export default function PrintListButton({ label = "Print PDF" }) {
  return (
    <button
      type="button"
      className="btn-transient shrink-0 print:hidden"
      onClick={printTable}
    >
      {label}
    </button>
  );
}
