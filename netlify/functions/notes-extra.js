export default async function handler() {
  return new Response(JSON.stringify({
    message: "notes-extra is deprecated. Use /notes, /download-my-note, /summarize and /delete-note instead."
  }), {
    status: 410,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
