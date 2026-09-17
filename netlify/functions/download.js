// download.js - Letöltés kezelése
import generatePDF from "./generate-pdf.js";

export async function downloadAsFile(content, fileName, fileType = "txt") {
  let blob, mimeType;

  if (fileType === "pdf" || fileType === "html") {
    blob = await generatePDF(content, fileName.replace(/\.(pdf|html)$/, ""));
    mimeType = "text/html";
    fileName = fileName.endsWith(".html") ? fileName : fileName + ".html";
  } else if (fileType === "txt") {
    // ✅ Szöveges fájlhoz is formázunk!
    const formatted = formatForExport(content);
    blob = new Blob([formatted], { type: "text/plain;charset=utf-8" });
    fileName = fileName.endsWith(".txt") ? fileName : fileName + ".txt";
  } else {
    blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ✅ Külső használatra is elérhető formázó függvény
export function formatForExport(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([^\n])(#{1,6} .+)/g, "$1\n\n$2")
    .replace(/([^\n])(• |\- |\* |\d+\.\s)/g, "$1\n$2")
    .replace(/([.!?])\s+(• |\d+\.)/g, "$1\n$2")
    .replace(/\n{5,}/g, "\n\n\n")
    .trim();
}
