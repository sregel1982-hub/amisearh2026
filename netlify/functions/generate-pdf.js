import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { text } = await req.json();
  if (!text) {
    return new Response("Missing text", { status: 400 });
  }

  const clean = text
    .replace(/^Rendben.*?\n/i, "")
    .replace(/^Természetesen.*?\n/i, "")
    .replace(/^Íme.*?\n/i, "")
    .replace(/^Oké.*?\n/i, "")
    .trim();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = 12;
  const maxWidth = 500;
  const lineHeight = 16;

  let y = 800;

  clean.split("\n").forEach((line) => {
    const wrapped = font.splitTextIntoLines(line, maxWidth);
    wrapped.forEach((l) => {
      page.drawText(l, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    });
    y -= 8;
  });

  const pdfBytes = await pdfDoc.save();

  return new Response(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=feladat.pdf"
    }
  });
}
