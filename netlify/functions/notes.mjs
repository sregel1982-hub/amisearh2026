import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

function mapNote(row) {
  return {
    id: row.id,
    title: row.title || row.cim || row.original_name || row.originalName || "Névtelen jegyzet",
    subject: row.subject || row.tantargy || "",
    language: row.language || row.lang || "hu",
    fileName: row.file_path || row.fileName || row.file_name || "",
    filePath: row.file_path || row.fileName || row.file_name || "",
    originalName: row.original_name || row.originalName || row.title || "jegyzet",
    publicUrl: row.public_url || row.publicUrl || "",
    fileSize: row.file_size || row.fileSize || 0,
    textContent: row.text_content || row.textContent || row.content || "",
    createdAt: row.created_at || row.createdAt || null
  };
}

export default async function handler(req) {
  try {
    const user = await getSupabaseUser(req);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("jegyzetek")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        return json({ error: error.message }, 500);
      }

      return json((data || []).map(mapNote));
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      const filePath = body.fileName || body.filePath || body.file_path || "";
      const originalName = body.originalName || body.original_name || filePath.split("/").pop() || "jegyzet";
      const title = body.title || body.cim || originalName.replace(/\.[^.]+$/, "");
      const subject = body.subject || body.tantargy || "";
      const language = body.language || body.lang || "hu";
      const publicUrl = body.publicUrl || body.public_url || "";
      const fileSize = Number(body.fileSize || body.file_size || 0) || 0;

      if (!filePath) {
        return json({ error: "Missing fileName/filePath" }, 400);
      }

      /*
        Fontos: szándékosan NEM használunk file_hash mezőt.
        A production adatbázisban a hiba alapján nincs ilyen oszlop a jegyzetek táblában.
        Duplikációt ezért csak ugyanazon user + ugyanazon storage path alapján ellenőrzünk.
      */
      const { data: existing, error: existingError } = await supabase
        .from("jegyzetek")
        .select("id,title")
        .eq("user_id", user.id)
        .eq("file_path", filePath)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") {
        return json({ error: existingError.message }, 500);
      }

      if (existing) {
        return json({
          error: "duplicate",
          message: "Ez a fájl már szerepel a jegyzeteid között.",
          id: existing.id
        }, 409);
      }

      const insertRow = {
        user_id: user.id,
        title,
        subject,
        language,
        file_path: filePath,
        original_name: originalName,
        public_url: publicUrl,
        file_size: fileSize
      };

      const { data, error } = await supabase
        .from("jegyzetek")
        .insert(insertRow)
        .select("*")
        .single();

      if (error) {
        return json({ error: error.message }, 500);
      }

      return json(mapNote(data), 201);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
}

export const config = {};
