import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RELEASE_TEXT, FORM_TITLE, FORM_SUBTITLE } from "@/lib/waiver";

const PAGE_WIDTH = 792; // US Letter, landscape (matches the wide official form)
const PAGE_HEIGHT = 612;
const MARGIN = 36;

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
 * Builds a PDF snapshot of the registration that replicates the official AFA
 * roster/release form (assets/waiver.pdf) field-for-field. Every player and
 * coach signs their own personal remote link (JD ruling 2026-07-21); this
 * function is called once at submission and again every time a roster
 * member signs, so the stored PDF always reflects current signing status —
 * rows that haven't signed yet print "awaiting signature" rather than
 * anything implying they have.
 */
export async function buildWaiverPdf({ registration, rosterMembers }) {
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

  const teamLine = `Team Name: ${registration.teamName}    Class: ${registration.class || ""}    Div: ${registration.divisionName || ""}    AFA Membership #: ${registration.afaMembershipNumber || ""}`;
  page.drawText(teamLine, { x: left, y, size: 9, font, color: black });
  y -= 20;

  const releaseLines = wrapText(RELEASE_TEXT, font, 9, PAGE_WIDTH - MARGIN * 2);
  for (const line of releaseLines) {
    page.drawText(line, { x: left, y, size: 9, font, color: black });
    y -= 12;
  }
  y -= 6;

  const m = registration.manager;
  page.drawText(
    `Manager's Name: ${m.name}    Email: ${m.email}    Phone #: ${m.phone || ""}    Cell #: ${m.cell || ""}`,
    { x: left, y, size: 9, font, color: black }
  );
  y -= 14;
  page.drawText(
    `Address: ${m.address || ""}    City: ${m.city || ""}    State: ${m.state || ""}    Zip: ${m.zip || ""}`,
    { x: left, y, size: 9, font, color: black }
  );
  y -= 6;

  // Manager signature — captured live at submission (the manager is present and submitting).
  const sigHeight = 60;
  page.drawText("Signature:", { x: left, y: y - sigHeight / 2 - 3, size: 9, font, color: black });
  await drawSignatureOrPlaceholder(doc, page, {
    x: left + 60,
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

  // Player table
  const colX = { name: left, birth: left + 200, address: left + 290, sig: left + 480 };
  const rowHeight = 20;
  page.drawText("Player Name", { x: colX.name, y, size: 9, font: bold, color: black });
  page.drawText("Birth Date", { x: colX.birth, y, size: 9, font: bold, color: black });
  page.drawText("Address", { x: colX.address, y, size: 9, font: bold, color: black });
  page.drawText("Signature", { x: colX.sig, y, size: 9, font: bold, color: black });
  y -= rowHeight;

  for (const p of players) {
    if (y < MARGIN + 60) break; // guard against overflow on a very long roster
    page.drawText(p.name || "", { x: colX.name, y: y + 6, size: 8, font, color: black });
    page.drawText(p.birthDate || "", { x: colX.birth, y: y + 6, size: 8, font, color: black });
    page.drawText((p.address || "").slice(0, 40), { x: colX.address, y: y + 6, size: 8, font, color: black });
    await drawSignatureOrPlaceholder(doc, page, {
      x: colX.sig,
      y: y - 2,
      maxWidth: 100,
      maxHeight: rowHeight,
      signaturePng: p.signaturePng,
      font,
      black,
    });
    y -= rowHeight;
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
