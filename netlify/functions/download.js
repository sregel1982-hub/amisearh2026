// download.js - VÉGSŐ JAVÍTÁS — sortörések garantáltak
export function formatForExport(text) {
  if (!text) return "";

  let t = text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // 1. Minden felsorolás új sorra kerül
  t = t.replace(/(\S)\s+(• |\- |\d+\.\s)/g, "$1\n$2");

  // 2. Fejezetcímek elé és után üres sor
  t = t.replace(/(\S)\s*(#{1,6}\s)/g, "$1\n\n$2");
  t = t.replace(/(#{1,6}\s.+?)(\S)/g, "$1\n\n$2");

  // 3. Mondat végénél új sor, ha új szakasz jön
  t = t.replace(/([.!?])\s+(A-zÁÉÍÓÚÖÜŐŰ]\w+:)/g, "$1\n\n$2");

  // 4. "• Szó" minták elé mindig új sor
  t = t.replace(/([^\n])\s+(•\s+)/g, "$1\n$2");

  // 5. Tisztítás: maximum 3 üres sor
  t = t.replace(/\n{4,}/g, "\n\n\n");

  return t.trim();
}

// Fájl letöltése
export async function downloadAsFile(content, fileName, fileType = "txt") {
  const szep = formatForExport(content); // ✅ Itt lép érvénybe a formázás

  let blob, mimeType;
  if (fileType === "txt") {
    blob = new Blob([szep], { type: "text/plain;charset=utf-8" });
    fileName = fileName.endsWith(".txt") ? fileName : fileName + ".txt";
  } else {
    blob = new Blob([szep], { type: "text/plain;charset=utf-8" });
    fileName = fileName.endsWith(".docx") ? fileName : fileName + ".txt";
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
