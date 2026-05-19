import type { Config, Context } from "@netlify/functions";
import { getSupabaseUser } from "./auth-helper.js";
import { createClient } from "@supabase/supabase-js";

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileName = url.searchParams.get("file");

  if (!fileName) {
    return Response.json({ error: "file parameter is required" }, { status: 400 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceRoleKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase configuration missing" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.storage
    .from("jegyzetek")
    .download(fileName);

  if (error || !data) {
    return Response.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }

  const originalName = fileName.replace(/^\d+_/, "");

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`,
    },
  });
};

export const config: Config = {};
