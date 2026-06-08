// Háttérben elindítja a szöveg kinyerését
async function triggerIndexDocument(noteId, filePath, baseUrl) {
 try {
  await new Promise(r => setTimeout(r, 2000));

  const url = baseUrl + "/.netlify/functions/index-document";

  const resp = await fetch(url, {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ noteId, filePath })
  });

  if (!resp.ok) {
   console.warn("Index document trigger failed:", resp.status);
  } else {
   const result = await resp.json();
   console.log("Index document result:", result);
  }
 } catch (e) {
  console.error("Index document trigger error:", e);
 }
}
