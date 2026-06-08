import { jsPDF } from "jspdf";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  const { title, content, lang = "hu" } = body;
  
  // Tisztítás: eltávolítjuk a bevezető szövegeket
  const cleanContent = content.replace(/^(Rendben|Íme|Tessék|Oké).+?\n/i, "").trim();

  const doc = new jsPDF();
  
  // Színes fejléc (Amisearch lila)
  doc.setFillColor(108, 92, 231);
  doc.rect(0, 0, 210, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Amisearch - " + (lang === 'hu' ? 'Tanulási Segéd' : 'Study Assistant'), 15, 13);

  // Tartalom
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(18);
  doc.text(title || (lang === 'hu' ? 'Feladatsor' : 'Exercise Set'), 15, 35);
  
  doc.setFontSize(12);
  const splitText = doc.splitTextToSize(cleanContent, 180);
  doc.text(splitText, 15, 45);

  const pdfOutput = doc.output("arraybuffer");

  return new Response(pdfOutput, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="amisearch-${Date.now()}.pdf"`
    }
  });
}
