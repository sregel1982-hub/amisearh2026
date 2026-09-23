/**
 * Netlify Function – Biológia PDF generátor
 * 
 * Telepítés:
 *   npm install pdf-lib
 * 
 * Hívás:
 *   GET /.netlify/functions/generate-biologia-pdf
 * 
 * Válasz: PDF fájl letöltése
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Magyar ékezetes karakterekhez saját font (opcionális)
// Ha nincs font fájl, StandardFonts.Helvetica-et használ
function loadFontBytes(fontName) {
  try {
    const fontPath = path.join(__dirname, '..', 'fonts', fontName);
    if (fs.existsSync(fontPath)) {
      return fs.readFileSync(fontPath);
    }
  } catch (e) {}
  return null;
}

exports.handler = async (event) => {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Fontok
    const boldBytes = loadFontBytes('DejaVuSans-Bold.ttf');
    const regularBytes = loadFontBytes('DejaVuSans.ttf');

    let boldFont, regularFont;
    if (boldBytes && regularBytes) {
      boldFont = await pdfDoc.embedFont(boldBytes);
      regularFont = await pdfDoc.embedFont(regularBytes);
    } else {
      // Fallback – Standard font (ékezetek lehetnek problémásak)
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    const blue = rgb(0.102, 0.337, 0.859);      // #1a56db
    const green = rgb(0.051, 0.478, 0.247);     // #0d7a3f
    const dark = rgb(0.2, 0.2, 0.2);
    const gray = rgb(0.4, 0.4, 0.4);
    const white = rgb(1, 1, 1);
    const lightGray = rgb(0.96, 0.96, 0.96);

    const margin = 50;
    let y = height - 50;

    // === FEJLÉC ===
    page.drawRectangle({
      x: margin,
      y: y - 35,
      width: width - 2 * margin,
      height: 40,
      color: blue,
      borderColor: blue,
      borderWidth: 0,
    });

    page.drawText('AMISEARCH', {
      x: margin + 12,
      y: y - 18,
      size: 14,
      font: boldFont,
      color: white,
    });
    page.drawText('Feladatok, megoldások és magyarázatok', {
      x: margin + 12,
      y: y - 32,
      size: 8,
      font: regularFont,
      color: white,
    });

    y -= 60;

    // Cím
    page.drawText('Biológia — Feladatok', {
      x: margin,
      y,
      size: 16,
      font: boldFont,
      color: dark,
    });
    y -= 18;

    page.drawText('2026. 09. 23.', {
      x: margin,
      y,
      size: 9,
      font: regularFont,
      color: gray,
    });
    y -= 28;

    // === FELADAT BLOKK ===
    page.drawRectangle({
      x: margin,
      y: y - 12,
      width: width - 2 * margin,
      height: 18,
      color: blue,
    });
    page.drawText('1. Feladat', {
      x: margin + 8,
      y: y - 8,
      size: 10,
      font: boldFont,
      color: white,
    });
    y -= 28;

    const taskText = [
      'Egy borsó növény (Pisum sativum) esetében a kerek mag (R) domináns a ráncos',
      'mag (r) felett, és a sárga mag (Y) domináns a zöld mag (y) felett. Két, mindkét',
      'tulajdonságra nézve heterozigóta növényt keresztezünk egymással.',
    ];
    for (const line of taskText) {
      page.drawText(line, { x: margin, y, size: 9.5, font: regularFont, color: dark });
      y -= 13;
    }
    y -= 8;

    const questions = [
      'a) Írd fel a szülői genotípusokat.',
      'b) Hányféle gamétát termelhet egy RrYy genotípusú növény, és milyen arányban?',
      'c) Milyen arányban várható a fenotípusok megjelenése az utódokban?',
      'd) Milyen valószínűséggel lesz az utódok között ráncos és zöld magvú növény?',
    ];
    for (const q of questions) {
      page.drawText(q, { x: margin, y, size: 9.5, font: boldFont, color: dark });
      y -= 15;
    }
    y -= 12;

    // === MEGOLDÁS BLOKK ===
    page.drawRectangle({
      x: margin,
      y: y - 12,
      width: width - 2 * margin,
      height: 18,
      color: green,
    });
    page.drawText('Megoldás', {
      x: margin + 8,
      y: y - 8,
      size: 10,
      font: boldFont,
      color: white,
    });
    y -= 28;

    // a)
    page.drawText('a) Szülői genotípusok', { x: margin, y, size: 9.5, font: boldFont, color: dark });
    y -= 14;
    page.drawText('Mivel mindkét szülő heterozigóta mindkét tulajdonságra nézve:', { x: margin, y, size: 9, font: regularFont, color: dark });
    y -= 13;
    page.drawText('Szülő 1: RrYy', { x: margin + 15, y, size: 9, font: boldFont, color: dark });
    y -= 12;
    page.drawText('Szülő 2: RrYy', { x: margin + 15, y, size: 9, font: boldFont, color: dark });
    y -= 18;

    // b)
    page.drawText('b) Gaméták képződése', { x: margin, y, size: 9.5, font: boldFont, color: dark });
    y -= 14;
    const bText = [
      'Egy RrYy genotípusú növény a mendeli független öröklődés elve alapján',
      'négyféle gamétát termelhet, egyenlő arányban:',
    ];
    for (const line of bText) {
      page.drawText(line, { x: margin, y, size: 9, font: regularFont, color: dark });
      y -= 12;
    }
    page.drawText('• RY   • Ry   • rY   • ry', { x: margin + 15, y, size: 9, font: boldFont, color: dark });
    y -= 13;
    page.drawText('Mindegyik gaméta valószínűsége 1/4 (25%). Arány: 1 : 1 : 1 : 1', { x: margin, y, size: 9, font: regularFont, color: dark });
    y -= 18;

    // c)
    page.drawText('c) Fenotípusok aránya az utódokban', { x: margin, y, size: 9.5, font: boldFont, color: dark });
    y -= 14;
    const cText = [
      'Két heterozigóta egyed (RrYy × RrYy) keresztezésekor a dihibrid',
      'keresztezés klasszikus fenotípusos arányát kapjuk: 9 : 3 : 3 : 1',
    ];
    for (const line of cText) {
      page.drawText(line, { x: margin, y, size: 9, font: regularFont, color: dark });
      y -= 12;
    }
    y -= 4;
    const phenotypes = [
      '• Kerek, sárga:  9 rész',
      '• Kerek, zöld:   3 rész',
      '• Ráncos, sárga: 3 rész',
      '• Ráncos, zöld:  1 rész',
    ];
    for (const p of phenotypes) {
      page.drawText(p, { x: margin + 15, y, size: 9, font: boldFont, color: dark });
      y -= 12;
    }
    y -= 10;

    // d)
    page.drawText('d) Ráncos és zöld magvú növény valószínűsége', { x: margin, y, size: 9.5, font: boldFont, color: dark });
    y -= 14;
    page.drawText('A ráncos és zöld magvú növény genotípusa: rryy', { x: margin, y, size: 9, font: regularFont, color: dark });
    y -= 13;
    page.drawText('P(rr) = 1/4    P(yy) = 1/4', { x: margin, y, size: 9, font: regularFont, color: dark });
    y -= 13;
    page.drawText('P(rryy) = P(rr) × P(yy) = (1/4) × (1/4) = 1/16', { x: margin + 15, y, size: 10, font: boldFont, color: green });
    y -= 16;
    page.drawText('Tehát a valószínűség: 1/16.', { x: margin, y, size: 9, font: regularFont, color: dark });

    // Lábléc
    page.drawText('amisearch.org', {
      x: margin,
      y: 30,
      size: 8,
      font: regularFont,
      color: gray,
    });
    page.drawText('1 / 1', {
      x: width - margin - 30,
      y: 30,
      size: 8,
      font: regularFont,
      color: gray,
    });

    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Biologia-feladatok.pdf"',
        'Access-Control-Allow-Origin': '*',
      },
      body: Buffer.from(pdfBytes).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

