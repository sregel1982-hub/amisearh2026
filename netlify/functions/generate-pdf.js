// utils/generatePDF.js

export function formatForExport(text) {
  if (!text) return "";
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(\S)\s+(• |\- |\d+\.\s)/g, "$1\n$2")
    .replace(/(\S)\s*(#{1,6}\s)/g, "$1\n\n$2")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export default async function generatePDF(content, title = "AMISEARCH válasz") {
  const szep = formatForExport(content);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.8;
      padding: 30px;
      color: #1a1a1a;
    }
    h2 {
      margin-bottom: 24px;
      color: #111;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 11pt;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <pre>${szep}</pre>
</body>
</html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}
