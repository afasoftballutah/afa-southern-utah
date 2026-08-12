import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RELEASE_TEXT, FORM_TITLE, FORM_SUBTITLE } from "@/lib/waiver";
import { formatSignRecord } from "@/lib/sign-audit";

const PAGE_WIDTH = 792; // US Letter, landscape (matches the wide official form)
const PAGE_HEIGHT = 612;
const MARGIN = 36;

/**
 * Normalize Google-style addresses for the form:
 * - drop country suffix ("USA", "United States")
 * - drop trailing commas/spaces
 * - collapse ", ," gaps
 * Optional maxLen: trim without leaving a dangling comma
 */
function cleanAddress(s, maxLen = null) {
  let t = String(s ?? "")
    .replace(/,?\s*(United States of America|United States|USA|US)\s*$/i, "")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/[,\s]+$/g, "")
    .trim();
  if (maxLen != null && t.length > maxLen) {
    t = t.slice(0, maxLen).replace(/[,\s]+$/g, "").trim();
  }
  return t;
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawSignatureOrPlaceholder(doc, page, { x, y, maxWidth, maxHeight, signaturePng, font, black }) {
  if (!signaturePng) {
    page.drawText("awaiting signature", { x, y: y + maxHeight / 2 - 3, size: 7, font, color: rgb(0.55, 0.15, 0.15) });
    return;
  }
  try {
    const base64 = signaturePng.split(",")[1] ?? signaturePng;
    const pngBytes = Buffer.from(base64, "base64");
    const pngImage = await doc.embedPng(pngBytes);
    const scale = Math.min(maxWidth / pngImage.width, maxHeight / pngImage.height);
    const w = pngImage.width * scale;
    const h = pngImage.height * scale;
    page.drawImage(pngImage, { x, y: y + (maxHeight - h) / 2, width: w, height: h });
  } catch {
    page.drawText("(signature on file, render error)", { x, y: y + maxHeight / 2 - 3, size: 6, font, color: black });
  }
}

/**
 * Draw "Label: value    Label2: value2" with bold labels and regular values
 * so filled-in data is easy to tell from field names.
 * pairs: Array<[label, value]>
 */
function drawLabeledLine(page, { x, y, size, bold, font, black, pairs, gap = 14 }) {
  let cursor = x;
  for (const [label, value] of pairs) {
    const lab = `${label}: `;
    const val = String(value ?? "");
    page.drawText(lab, { x: cursor, y, size, font: bold, color: black });
    cursor += bold.widthOfTextAtSize(lab, size);
    if (val) {
      page.drawText(val, { x: cursor, y, size, font, color: black });
      cursor += font.widthOfTextAtSize(val, size);
    }
    cursor += gap;
  }
  return cursor;
}

/**
 * Builds a PDF snapshot of the registration that replicates the official AFA
 * roster/release form (assets/waiver.pdf) field-for-field. Every player and
 * coach signs their own personal remote link (JD ruling 2026-07-21); this
 * function is called once at submission and again every time a roster
 * member signs, so the stored PDF always reflects current signing status —
 * rows that haven't signed yet print "awaiting signature" rather than
 * anything implying they have.
 */
export async function buildWaiverPdf({
  registration,
  rosterMembers,
  releaseText = RELEASE_TEXT,
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;
  const left = MARGIN;
  const black = rgb(0.09, 0.14, 0.24);

  page.drawText(FORM_TITLE, { x: left, y, size: 13, font: bold, color: black });
  page.drawText(FORM_SUBTITLE, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(FORM_SUBTITLE, 12),
    y,
    size: 12,
    font: bold,
    color: black,
  });
  y -= 22;

  drawLabeledLine(page, {
    x: left,
    y,
    size: 9,
    bold,
    font,
    black,
    pairs: [
      ["Team Name", registration.teamName || ""],
      ["Class", registration.class || ""],
      ["Div", registration.divisionName || ""],
      ["AFA Membership #", registration.afaMembershipNumber || ""],
    ],
  });
  y -= 20;

  const releaseLines = wrapText(
    releaseText || RELEASE_TEXT,
    font,
    9,
    PAGE_WIDTH - MARGIN * 2
  );
  for (const line of releaseLines) {
    page.drawText(line, { x: left, y, size: 9, font, color: black });
    y -= 12;
  }
  y -= 6;

  const m = registration.manager;
  drawLabeledLine(page, {
    x: left,
    y,
    size: 9,
    bold,
    font,
    black,
    pairs: [
      ["Manager's Name", m.name || ""],
      ["Email", m.email || ""],
      ["Phone #", m.phone || ""],
      ["Cell #", m.cell || ""],
    ],
  });
  y -= 14;
  drawLabeledLine(page, {
    x: left,
    y,
    size: 9,
    bold,
    font,
    black,
    pairs: [
      ["Address", cleanAddress(m.address)],
      ["City", m.city || ""],
      ["State", m.state || ""],
      ["Zip", m.zip || ""],
    ],
  });
  y -= 6;

  // Manager signature — captured live at submission (the manager is present and submitting).
  const sigHeight = 60;
  page.drawText("Signature:", {
    x: left,
    y: y - sigHeight / 2 - 3,
    size: 9,
    font: bold,
    color: black,
  });
  await drawSignatureOrPlaceholder(doc, page, {
    x: left + 70,
    y: y - sigHeight,
    maxWidth: 140,
    maxHeight: sigHeight,
    signaturePng: registration.managerSignaturePng,
    font,
    black,
  });
  y -= sigHeight + 14;

  const players = rosterMembers.filter((r) => r.role === "player");
  const coaches = rosterMembers.filter((r) => r.role === "coach");

  // Player table — landscape: Name | Birth | Email | Address | Signature
  // Address column is wide enough to wrap the full street/city/state/zip (no hard truncate).
  const colX = {
    name: left,
    birth: left + 118,
    email: left + 188,
    address: left + 320,
    sig: left + 545,
  };
  const nameW = colX.birth - colX.name - 6;
  const emailW = colX.address - colX.email - 6;
  const addressW = colX.sig - colX.address - 8;
  const lineH = 9;

  page.drawText("Player Name", { x: colX.name, y, size: 9, font: bold, color: black });
  page.drawText("Birth Date", { x: colX.birth, y, size: 9, font: bold, color: black });
  page.drawText("Email", { x: colX.email, y, size: 9, font: bold, color: black });
  page.drawText("Address", { x: colX.address, y, size: 9, font: bold, color: black });
  page.drawText("Signature", { x: colX.sig, y, size: 9, font: bold, color: black });
  y -= 16;

  for (const p of players) {
    if (y < MARGIN + 40) break; // guard against overflow on a very long roster
    const nameLines = wrapText(p.name || "", font, 8, nameW);
    const emailLines = wrapText(p.email || "", font, 7, emailW);
    const addrLines = wrapText(cleanAddress(p.address), font, 7, addressW);
    const lineCount = Math.max(
      1,
      nameLines.length,
      emailLines.length,
      addrLines.length
    );
    const rowH = Math.max(20, lineCount * lineH + 6);
    const topY = y;

    for (let i = 0; i < nameLines.length; i++) {
      page.drawText(nameLines[i], {
        x: colX.name,
        y: topY - i * lineH,
        size: 8,
        font,
        color: black,
      });
    }
    page.drawText(p.birthDate || "", {
      x: colX.birth,
      y: topY,
      size: 8,
      font,
      color: black,
    });
    for (let i = 0; i < emailLines.length; i++) {
      page.drawText(emailLines[i], {
        x: colX.email,
        y: topY - i * lineH,
        size: 7,
        font,
        color: black,
      });
    }
    for (let i = 0; i < addrLines.length; i++) {
      page.drawText(addrLines[i], {
        x: colX.address,
        y: topY - i * lineH,
        size: 7,
        font,
        color: black,
      });
    }
    await drawSignatureOrPlaceholder(doc, page, {
      x: colX.sig,
      y: topY - rowH + 4,
      maxWidth: 100,
      maxHeight: Math.min(rowH, 22),
      signaturePng: p.signaturePng,
      font,
      black,
    });
    if (p.signedAt) {
      const stamp = formatSignRecord({
        signedAt: p.signedAt,
        signedPlace: p.signedPlace,
      });
      if (stamp) {
        page.drawText(stamp, {
          x: colX.sig,
          y: Math.max(MARGIN, topY - rowH + 2),
          size: 5.5,
          font,
          color: black,
        });
      }
    }
    y -= rowH;
  }
  y -= 10;

  // Coach table
  if (coaches.length) {
    page.drawText("Coach Name", { x: colX.name, y, size: 9, font: bold, color: black });
    page.drawText("Signature", { x: colX.birth, y, size: 9, font: bold, color: black });
    page.drawText("Email", { x: colX.address, y, size: 9, font: bold, color: black });
    page.drawText("Phone", { x: colX.sig, y, size: 9, font: bold, color: black });
    y -= rowHeight;
    for (const c of coaches) {
      if (y < MARGIN) break;
      page.drawText(c.name || "", { x: colX.name, y: y + 6, size: 8, font, color: black });
      await drawSignatureOrPlaceholder(doc, page, {
        x: colX.birth,
        y: y - 2,
        maxWidth: 80,
        maxHeight: rowHeight,
        signaturePng: c.signaturePng,
        font,
        black,
      });
      page.drawText(c.email || "", { x: colX.address, y: y + 6, size: 8, font, color: black });
      page.drawText(c.phone || "", { x: colX.sig, y: y + 6, size: 8, font, color: black });
      y -= rowHeight;
    }
  }

  const allSigned = rosterMembers.every((r) => r.signedAt);
  page.drawText(
    allSigned
      ? `All signatures on file as of ${new Date().toLocaleString("en-US")}`
      : `Awaiting signatures — snapshot generated ${new Date().toLocaleString("en-US")}`,
    { x: left, y: MARGIN / 2, size: 7, font, color: black }
  );

  return doc.save();
}
