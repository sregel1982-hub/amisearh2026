} else if (fileType === "docx") {
  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = szep.split(/\n{1,}/).filter(Boolean)
    .map((line) => {
      const t = esc(line);
      if (/^#{1,6}\s/.test(line)) return "<h2>" + esc(line.replace(/^#{1,6}\s*/, "")) + "</h2>";
      if (/^[•\-*]\s+/.test(line)) return "<li>" + esc(line.replace(/^[•\-*]\s+/, "")) + "</li>";
      if (/^\d+\.\s+/.test(line))  return "<li>" + t + "</li>";
      return "<p>" + t + "</p>";
    })
    .join("")
    .replace(/(<li>[\s\S]*?<\/li>)+/g, (m) => "<ul>" + m + "</ul>");
  const htmlDoc =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>AMISEARCH</title><style>' +
    'body{font-family:Calibri,Arial,sans-serif;line-height:1.5;color:#111827;padding:20px;}' +
    'h1,h2,h3{color:#C8102E;} p{margin:0 0 10px 0;} li{margin:4px 0 4px 22px;}' +
    '</style></head><body><h1>AMISEARCH</h1>' + paras + '</body></html>';
  blob = new Blob(["\ufeff" + htmlDoc], { type: "application/msword;charset=utf-8" });
  fileName = fileName.replace(/\.docx$/, "") + ".doc";
}
