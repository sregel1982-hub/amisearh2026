/**
 * Netlify Function – Első világháború vizsgafeladatlap PDF
 *
 * Telepítés: npm install pdf-lib
 * Hívás: GET /.netlify/functions/generate-vilaghaboru-pdf
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

function loadFontBytes(fontName) {
  try {
    const fontPath = path.join(__dirname, '..', 'fonts', fontName);
    if (fs.existsSync(fontPath)) return fs.readFileSync(fontPath);
  } catch (e) {}
  return null;
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

exports.handler = async () => {
  try {
    const pdfDoc = await PDFDocument.create();
    const boldBytes = loadFontBytes('DejaVuSans-Bold.ttf');
    const regularBytes = loadFontBytes('DejaVuSans.ttf');

    let boldFont, regularFont;
    if (boldBytes && regularBytes) {
      boldFont = await pdfDoc.embedFont(boldBytes);
      regularFont = await pdfDoc.embedFont(regularBytes);
    } else {
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    const blue = rgb(0.102, 0.337, 0.859);
    const dark = rgb(0.2, 0.2, 0.2);
    const gray = rgb(0.4, 0.4, 0.4);
    const white = rgb(1, 1, 1);
    const lightGray = rgb(0.96, 0.96, 0.96);
    const lineGray = rgb(0.8, 0.8, 0.8);

    const margin = 45;
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const usable = pageWidth - 2 * margin;

    // ========== OLDAL 1 ==========
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 45;

    // Fejléc
    page.drawRectangle({ x: margin, y: y - 32, width: usable, height: 36, color: blue });
    page.drawText('AMISEARCH', { x: margin + 10, y: y - 15, size: 13, font: boldFont, color: white });
    page.drawText('Vizsgaszimulátor feladatsor', { x: margin + 10, y: y - 28, size: 8, font: regularFont, color: white });
    y -= 55;

    page.drawText('Első világháború', { x: margin, y, size: 17, font: boldFont, color: dark });
    y -= 16;
    page.drawText('2026. 09. 23.', { x: margin, y, size: 9, font: regularFont, color: gray });
    y -= 22;

    // Név mező
    page.drawRectangle({ x: margin, y: y - 55, width: usable, height: 58, color: lightGray });
    page.drawText('Első Világháború – Vizsgafeladatlap', { x: margin + 10, y: y - 14, size: 11, font: boldFont, color: dark });
    page.drawText('Név: ________________________________     Osztály/Csoport: ________________', { x: margin + 10, y: y - 30, size: 9, font: regularFont, color: dark });
    page.drawText('Dátum: ________________               Elérhető pontszám: 50 pont', { x: margin + 10, y: y - 46, size: 9, font: regularFont, color: dark });
    y -= 72;

    page.drawText('Időtartam: 45 perc', { x: margin, y, size: 10, font: boldFont, color: dark });
    y -= 14;
    page.drawText('Utasítások:', { x: margin, y, size: 9, font: boldFont, color: dark });
    y -= 12;
    const instr = [
      '• Olvasd el figyelmesen az összes kérdést!',
      '• Válaszaidat a megadott helyre írd!',
      '• A kifejtős feladatnál törekedj a lényegre törő, de részletes válaszra!',
      '• A rendelkezésre álló idő 45 perc.',
    ];
    for (const line of instr) {
      page.drawText(line, { x: margin + 4, y, size: 8.5, font: regularFont, color: dark });
      y -= 11;
    }
    y -= 10;

    // I. Rövid válaszok
    page.drawRectangle({ x: margin, y: y - 12, width: usable, height: 16, color: blue });
    page.drawText('I. Rövid válaszok (15 pont)', { x: margin + 8, y: y - 8, size: 9.5, font: boldFont, color: white });
    y -= 24;

    const shortQs = [
      ['1.', 'Nevezze meg az első világháború kitörésének közvetlen okát és dátumát!', '2 p'],
      ['2.', 'Sorolja fel az Antant hatalmak három legfontosabb tagját a háború elején!', '3 p'],
      ['3.', 'Sorolja fel a Központi hatalmak három legfontosabb tagját a háború elején!', '3 p'],
      ['4.', 'Mi volt a Schlieffen-terv lényege?', '2 p'],
      ['5.', 'Nevezzen meg két új fegyvertípust, amely az első világháborúban jelent meg!', '2 p'],
      ['6.', 'Melyik évben lépett be az Amerikai Egyesült Államok a háborúba?', '1 p'],
      ['7.', 'Melyik évben lépett ki Oroszország a háborúból?', '1 p'],
      ['8.', 'Nevezze meg azt a békeszerződést, amely Németországgal zárta le a háborút!', '1 p'],
    ];

    for (const [num, q, pts] of shortQs) {
      page.drawText(num, { x: margin, y, size: 9, font: boldFont, color: dark });
      const lines = wrapText(q, regularFont, 8.5, usable - 70);
      lines.forEach((line, i) => {
        page.drawText(line, { x: margin + 16, y: y - i * 11, size: 8.5, font: regularFont, color: dark });
      });
      page.drawText(`(${pts})`, { x: pageWidth - margin - 35, y, size: 8, font: regularFont, color: gray });
      y -= lines.length * 11 + 2;
      // válaszvonal
      page.drawLine({ start: { x: margin + 16, y }, end: { x: pageWidth - margin, y }, thickness: 0.6, color: lineGray });
      y -= 14;
    }

    y -= 6;
    // II. Igaz/Hamis
    page.drawRectangle({ x: margin, y: y - 12, width: usable, height: 16, color: blue });
    page.drawText('II. Igaz/Hamis állítások (10 pont)', { x: margin + 8, y: y - 8, size: 9.5, font: boldFont, color: white });
    y -= 22;

    page.drawText('Döntse el, hogy az alábbi állítások igazak (I) vagy hamisak (H)!', {
      x: margin, y, size: 8.5, font: regularFont, color: dark
    });
    y -= 14;

    const tfQs = [
      'A szarajevói merénylet Ferenc Ferdinánd ellen történt.',
      'Olaszország a háború kezdetétől a Központi hatalmak oldalán harcolt.',
      'A lövészárok-hadviselés elsősorban a keleti frontra volt jellemző.',
      'Az Amerikai Egyesült Államok a háború elején azonnal hadat üzent Németországnak.',
      'A verduni csata az első világháború egyik leghosszabb és legvéresebb ütközete volt.',
      'A Zimmermann-távirat az Osztrák-Magyar Monarchia és Mexikó közötti titkos üzenet volt.',
      'Az 1918-as spanyolnátha-járvány több áldozatot szedett, mint maga a háború.',
      'A Négyes Szövetség tagjai voltak Németország, OMM, Olaszország és Törökország.',
      'A háború végén a wilsoni pontok jelentős szerepet játszottak a béketárgyalásokon.',
      'A tengeralattjáró-háború az Antant hatalmak egyik fő stratégiája volt.',
    ];

    tfQs.forEach((q, i) => {
      page.drawText(`${i + 1}.`, { x: margin, y, size: 8.5, font: regularFont, color: dark });
      const lines = wrapText(q, regularFont, 8.5, usable - 80);
      lines.forEach((line, j) => {
        page.drawText(line, { x: margin + 16, y: y - j * 11, size: 8.5, font: regularFont, color: dark });
      });
      // válasz négyzet
      page.drawLine({
        start: { x: pageWidth - margin - 28, y: y - 1 },
        end: { x: pageWidth - margin - 8, y: y - 1 },
        thickness: 0.8,
        color: lineGray,
      });
      page.drawText('(1p)', { x: pageWidth - margin - 50, y: y + 2, size: 7, font: regularFont, color: gray });
      y -= Math.max(lines.length * 11, 12) + 4;
    });

    // Lábléc 1
    page.drawText('amisearch.org', { x: margin, y: 25, size: 8, font: regularFont, color: gray });
    page.drawText('1 / 2', { x: pageWidth - margin - 25, y: 25, size: 8, font: regularFont, color: gray });

    // ========== OLDAL 2 ==========
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - 45;

    page.drawRectangle({ x: margin, y: y - 32, width: usable, height: 36, color: blue });
    page.drawText('AMISEARCH', { x: margin + 10, y: y - 15, size: 13, font: boldFont, color: white });
    page.drawText('Vizsgaszimulátor feladatsor', { x: margin + 10, y: y - 28, size: 8, font: regularFont, color: white });
    y -= 55;

    // III. Feleletválasztós
    page.drawRectangle({ x: margin, y: y - 12, width: usable, height: 16, color: blue });
    page.drawText('III. Feleletválasztós kérdések (10 pont)', { x: margin + 8, y: y - 8, size: 9.5, font: boldFont, color: white });
    y -= 22;

    page.drawText('Karikázza be a helyes válasz betűjelét!', { x: margin, y, size: 8.5, font: regularFont, color: dark });
    y -= 16;

    const mcQs = [
      {
        q: 'Melyik ország hadüzenete indította el a háborúk sorozatát 1914 júliusában?',
        opts: ['a) Németország Szerbiának', 'b) Osztrák-Magyar Monarchia Szerbiának', 'c) Oroszország Osztrák-Magyar Monarchiának', 'd) Franciaország Németországnak'],
        pts: '2 p',
      },
      {
        q: 'Melyik csata volt az első világháború egyik legfontosabb ütközete a nyugati fronton, amely megállította a német előrenyomulást Párizs felé 1914-ben?',
        opts: ['a) Somme-i csata', 'b) Verduni csata', 'c) Marne-i csata', 'd) Gallipoli csata'],
        pts: '2 p',
      },
      {
        q: 'Ki volt az Amerikai Egyesült Államok elnöke az első világháború idején?',
        opts: ['a) Theodore Roosevelt', 'b) Woodrow Wilson', 'c) Franklin D. Roosevelt', 'd) Abraham Lincoln'],
        pts: '2 p',
      },
      {
        q: 'Melyik békeszerződés zárta le a háborút Ausztriával?',
        opts: ['a) Versailles-i béke', 'b) Saint-Germaini béke', 'c) Trianoni béke', 'd) Neuilly-i béke'],
        pts: '2 p',
      },
      {
        q: 'Melyik évben történt az oroszországi bolsevik forradalom, amelynek következtében Oroszország kilépett a háborúból?',
        opts: ['a) 1915', 'b) 1916', 'c) 1917', 'd) 1918'],
        pts: '2 p',
      },
    ];

    mcQs.forEach((item, idx) => {
      page.drawText(`${idx + 1}.`, { x: margin, y, size: 9, font: boldFont, color: dark });
      const lines = wrapText(item.q, regularFont, 8.5, usable - 50);
      lines.forEach((line, i) => {
        page.drawText(line, { x: margin + 16, y: y - i * 11, size: 8.5, font: regularFont, color: dark });
      });
      page.drawText(`(${item.pts})`, { x: pageWidth - margin - 35, y, size: 8, font: regularFont, color: gray });
      y -= lines.length * 11 + 4;

      item.opts.forEach(opt => {
        page.drawText(opt, { x: margin + 22, y, size: 8.5, font: regularFont, color: dark });
        y -= 12;
      });
      y -= 8;
    });

    // IV. Kifejtős
    page.drawRectangle({ x: margin, y: y - 12, width: usable, height: 16, color: blue });
    page.drawText('IV. Kifejtős feladat (15 pont)', { x: margin + 8, y: y - 8, size: 9.5, font: boldFont, color: white });
    y -= 24;

    const essay = 'Mutassa be az első világháború főbb okait, a háború menetének legfontosabb fordulópontjait, valamint a háborút lezáró békeszerződések legfontosabb következményeit! (Válaszát kb. 15–20 mondatban fejtse ki.)';
    const essayLines = wrapText(essay, regularFont, 9, usable);
    essayLines.forEach(line => {
      page.drawText(line, { x: margin, y, size: 9, font: regularFont, color: dark });
      y -= 12;
    });
    y -= 8;

    // Vonalak
    while (y > 40) {
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: lineGray,
      });
      y -= 16;
    }

    // Lábléc 2
    page.drawText('amisearch.org', { x: margin, y: 25, size: 8, font: regularFont, color: gray });
    page.drawText('2 / 2', { x: pageWidth - margin - 25, y: 25, size: 8, font: regularFont, color: gray });

    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Elso-vilaghaboru-vizsga.pdf"',
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

