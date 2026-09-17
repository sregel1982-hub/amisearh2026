// generate-pdf.js - PDF generálás javított formázással
export default async function generatePDF(content, title = "AMISEARCH válasz") {

  // ✅ BELSŐ FORMÁZÓ FÜGGVÉNY — itt van a megoldás!
  function formatForPDF(text) {
    if (!text || typeof text !== "string") return "";
    
    return text
      .normalize("NFC")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      
      // Fejezetcímek — új sor + üres sor
      .replace(/([^\n])(#{1,6} .+)/g, "$1\n\n$2")
      .replace(/(#{1,6} .+)([^\n])/g, "$1\n$2")
      
      // Felsorolások — minden elem ÚJ SORON
      .replace(/([^\n])(• |\- |\* |\d+\.\s)/g, "$1\n$2")
      
      // Mondat végén új sor, ha lista jön
      .replace(/([.!?])\s+(• |\d+\.)/g, "$1\n$2")
      
      // Túl hosszú sorok tördelése
      .replace(/(.{90,}?)\s+/g, "$1\n")
      
      // Túl sok üres sor csökkentése
      .replace(/\n{5,}/g, "\n\n\n")
      .trim();
  }

  // ✅ Formázás — ez a kulcs!
  const formattedContent = formatForPDF(content);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { 
      font-family: "Segoe UI", Arial, sans-serif; 
      line-height: 1.6; 
      padding: 40px;
      white-space: pre-wrap; /* ✅ Ez őrzi meg a sortöréseket! */
      word-wrap: break-word;
    }
    h2, h3 { margin-top: 2em; margin-bottom: 0.5em; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    p { margin: 1em 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p><em>Készült: ${new Date().toLocaleString("hu-HU")}</em></p>
  <hr>
  <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; padding: 0;">${formattedContent}</pre>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  return blob;
}
