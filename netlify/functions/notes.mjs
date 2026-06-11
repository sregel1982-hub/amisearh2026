import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Supabase környezeti változó hiányzik.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return "";
}

function normalizeFileSize(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function mapNote(row = {}) {
  const originalName = firstNonEmpty(row.original_name, row.file_path, "jegyzet");
  const title = firstNonEmpty(row.cim, originalName, "Névtelen jegyzet");
  const filePath = firstNonEmpty(row.file_path);

  return {
    id: row.id,
    title,
    cim: title,
    subject: firstNonEmpty(row.tantargy),
    tantargy: firstNonEmpty(row.tantargy),
    language: firstNonEmpty(row.nyelv, "hu"),
    nyelv: firstNonEmpty(row.nyelv, "hu"),
    originalName,
    original_name: originalName,
    fileName: filePath,
    filePath,
    file_path: filePath,
    publicUrl: firstNonEmpty(row.public_url),
    public_url: firstNonEmpty(row.public_url),
    fileSize: normalizeFileSize(row.file_size) || 0,
    file_size: normalizeFileSize(row.file_size) || 0,
    textContent: firstNonEmpty(row.text_content),
    text_content: firstNonEmpty(row.text_content),
    uploaderIdentityId: firstNonEmpty(row.user_id),
    user_id: firstNonEmpty(row.user_id),
    createdAt: row.created_at || null,
    created_at: row.created_at || null,
    processed: row.processed === true
  };
}

export default async function handler(req) {
  try {
    const user = await getSupabaseUser(req);
    if (!user) {
      return json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("jegyzetek")
        .select("id,user_id,file_path,original_name,public_url,file_size,cim,tantargy,nyelv,processed,text_content,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("notes.mjs GET error:", error);
        return json({ error: error.message }, 500);
      }

      return json((data || []).map(mapNote));
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      const filePath = firstNonEmpty(
        body.filePath,
        body.file_path,
        body.fileName,
        body.file_name
      );

      const originalName = firstNonEmpty(
        body.originalName,
        body.original_name,
        body.name,
        filePath,
        "jegyzet"
      );

      if (!filePath) {
        return json({ error: "Hiányzik a filePath/fileName mező." }, 400);
      }

      const { data: duplicate, error: duplicateError } = await supabase
        .from("jegyzetek")
        .select("id,user_id,file_path,original_name,public_url,file_size,cim,tantargy,nyelv,processed,text_content,created_at")
        .eq("user_id", user.id)
        .eq("file_path", filePath)
        .maybeSingle();

      if (duplicateError) {
        console.error("notes.mjs duplicate check error:", duplicateError);
        return json({ error: duplicateError.message }, 500);
      }

      if (duplicate) {
        return json(
          {
            message: "Ezt a fájlt már feltöltötted egyszer.",
            note: mapNote(duplicate)
          },
          409
        );
      }

      const insertRow = {
        user_id: user.id,
        file_path: filePath,
        original_name: originalName,
        public_url: firstNonEmpty(body.publicUrl, body.public_url) || null,
        file_size: normalizeFileSize(body.fileSize ?? body.file_size),
        cim: firstNonEmpty(body.title, body.cim, originalName, "Névtelen jegyzet"),
        tantargy: firstNonEmpty(body.subject, body.tantargy),
        nyelv: firstNonEmpty(body.language, body.nyelv, "hu"),
        processed: false
      };

      if (typeof body.textContent === "string" && body.textContent.trim()) {
        insertRow.text_content = body.textContent.trim();
      } else if (typeof body.text_content === "string" && body.text_content.trim()) {
        insertRow.text_content = body.text_content.trim();
      }

      const { data, error } = await supabase
        .from("jegyzetek")
        .insert(insertRow)
        .select("id,user_id,file_path,original_name,public_url,file_size,cim,tantargy,nyelv,processed,text_content,created_at")
        .single();

      if (error) {
        console.error("notes.mjs POST insert error:", error);
        return json({ error: error.message }, 500);
      }

      return json(mapNote(data), 201);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("notes.mjs error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}
Miért nem működik a weboldalam frontendje? - Manus
