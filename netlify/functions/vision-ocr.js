import { createClient } from "@supabase/supabase-js";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  const { filePath } = await req.json();

  if (!filePath) {
    return new Response(JSON.stringify({ error: "Missing filePath" }), {
      status: 400,
    });
  }

  // --- Supabase client ---
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // --- 1) Fájl letöltése a jegyzetek bucketből ---
  const { data, error } = await supabase.storage
    .from("jegyzetek")
    .download(filePath);

  if (error) {
    return new Response(JSON.stringify({ error: "File download failed" }), {
      status: 500,
    });
  }

  const fileBuffer = await data.arrayBuffer();
  const base64File = Buffer.from(fileBuffer).toString("base64");

  // --- 2) Vision OCR API hívás ---
  const visionResponse = await fetch(
    "https://vision.googleapis.com/v1/images:annotate?key=" +
      process.env.GOOGLE_VISION_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64File },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    }
  );

  const visionData = await visionResponse.json();

  if (!visionData.responses || !visionData.responses[0].fullTextAnnotation) {
    return new Response(
      JSON.stringify({ error: "OCR failed or no text found" }),
      { status: 500 }
    );
  }

  const text = visionData.responses[0].fullTextAnnotation.text;

  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
