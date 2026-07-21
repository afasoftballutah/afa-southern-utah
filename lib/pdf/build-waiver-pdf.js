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

/**
 * Builds a signed PDF that replicates the official AFA roster/release form
 * (assets/waiver.pdf) field-for-field, with the submitted data filled in and
 * the manager's drawn signature embedded. Player/coach signature columns
 * print "on file — e-signed by the manager" per the interpretation logged
 * in the handoff doc (one manager signature authorizes the full roster).
 */
export async function buildWaiverPdf(registration) {
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

  // Manager signature image, right where the paper form's Signature field is
  if (registration.signaturePng) {
    try {
      const base64 = registration.signaturePng.split(",")[1] ?? registration.signaturePng;
      const pngBytes = Buffer.from(base64, "base64");
      const pngImage = await doc.embedPng(pngBytes);
      const sigWidth = 140;
      const sigHeight = (pngImage.height / pngImage.width) * sigWidth;
      page.drawText("Signature:", { x: left, y: y - sigHeight + 8, size: 9, font, color: black });
      page.drawImage(pngImage, {
        x: left + 60,
        y: y - sigHeight,
        width: sigWidth,
        height: sigHeight,
      });
      y -= sigHeight + 8;
    } catch {
      page.drawText("Signature: (on file, could not render image)", {
        x: left,
        y,
        size: 9,
        font,
        color: black,
      });
      y -= 14;
    }
  }
  y -= 10;

  // Player table
  const colX = { name: left, birth: left + 200, address: left + 290, sig: left + 480 };
  const rowHeight = 14;
  page.drawText("Player Name", { x: colX.name, y, size: 9, font: bold, color: black });
  page.drawText("Birth Date", { x: colX.birth, y, size: 9, font: bold, color: black });
  page.drawText("Address", { x: colX.address, y, size: 9, font: bold, color: black });
  page.drawText("Signature", { x: colX.sig, y, size: 9, font: bold, color: black });
  y -= rowHeight;

  for (const p of registration.players) {
    if (y < MARGIN + 60) break; // guard against overflow on a very long roster
    page.drawText(p.name || "", { x: colX.name, y, size: 8, font, color: black });
    page.drawText(p.birthDate || "", { x: colX.birth, y, size: 8, font, color: black });
    page.drawText((p.address || "").slice(0, 40), { x: colX.address, y, size: 8, font, color: black });
    page.drawText("on file (mgr signed)", { x: colX.sig, y, size: 7, font, color: black });
    y -= rowHeight;
  }
  y -= 10;

  // Coach table
  if (registration.coaches?.length) {
    page.drawText("Coach Name", { x: colX.name, y, size: 9, font: bold, color: black });
    page.drawText("Signature", { x: colX.birth, y, size: 9, font: bold, color: black });
    page.drawText("Email", { x: colX.address, y, size: 9, font: bold, color: black });
    page.drawText("Phone", { x: colX.sig, y, size: 9, font: bold, color: black });
    y -= rowHeight;
    for (const c of registration.coaches) {
      if (y < MARGIN) break;
      page.drawText(c.name || "", { x: colX.name, y, size: 8, font, color: black });
      page.drawText("mgr signed", { x: colX.birth, y, size: 7, font, color: black });
      page.drawText(c.email || "", { x: colX.address, y, size: 8, font, color: black });
      page.drawText(c.phone || "", { x: colX.sig, y, size: 8, font, color: black });
      y -= rowHeight;
    }
  }

  page.drawText(
    `Submitted electronically ${new Date(registration.submittedAt).toLocaleString("en-US")}`,
    { x: left, y: MARGIN / 2, size: 7, font, color: black }
  );

  return doc.save();
}
