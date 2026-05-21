import { getSupabaseUser } from "./auth-helper.js";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(req.url);
  const fileName = url.searchParams.get("file");

  if (!fileName) {
    return new Response(JSON.stringify({ error: "file parameter is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_URL")) ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.storage
    .from("jegyzetek")
    .download(fileName);

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to download file" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const originalName = fileName.replace(/^\d+_/, "");

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`
    }
  });
}

export const config = {};

