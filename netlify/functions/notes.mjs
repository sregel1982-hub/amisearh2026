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

function extractMissingColumn(message = "") {
  const text = String(message || "");
  const match = text.match(/column\s+(?:[\w]+\.)?([\w]+)\s+does not exist/i);
  return match ? match[1] : "";
}

function mapNote(row = {}) {
  const originalName = firstNonEmpty(row.original_name, row.originalName, row.file_path, row.fileName, "jegyzet");
  const title = firstNonEmpty(row.cim, row.title, originalName, "Névtelen jegyzet");
  const filePath = firstNonEmpty(row.file_path, row.filePath, row.fileName, row.file_name);
  const subject = firstNonEmpty(row.subject, row.tantargy, row.targy);
  const language = firstNonEmpty(row.nyelv, row.language, "hu");
  const fileSize = normalizeFileSize(row.file_size ?? row.fileSize) || 0;
  const textContent = firstNonEmpty(row.text_content, row.textContent);
  const publicUrl = firstNonEmpty(row.public_url, row.publicUrl);
  const userId = firstNonEmpty(row.user_id, row.uploaderIdentityId);

  return {
    id: row.id,
    title,
    cim: title,
    subject,
    tantargy: subject,
    language,
    nyelv: language,
    originalName,
    original_name: originalName,
    fileName: filePath,
    filePath,
    file_path: filePath,
    publicUrl,
    public_url: publicUrl,
    fileSize,
    file_size: fileSize,
    textContent,
    text_content: textContent,
    uploaderIdentityId: userId,
    user_id: userId,
    createdAt: row.created_at || row.createdAt || null,
    created_at: row.created_at || row.createdAt || null,
    processed: row.processed === true
  };
}

async function insertWithSchemaFallback(supabase, row) {
  const safeRow = { ...row };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from("jegyzetek")
      .insert(safeRow)
      .select("*")
      .single();

    if (!error) return { data, error: null };

    const missingColumn = extractMissingColumn(error.message);
    if (!missingColumn || !(missingColumn in safeRow)) {
      return { data: null, error };
    }

    console.warn(
      "notes.mjs insert fallback: hiányzó oszlop kihagyva:",
      missingColumn
    );
    delete safeRow[missingColumn];
  }

  return {
    data: null,
    error: new Error("A jegyzet mentése nem sikerült a táblaoszlopok eltérése miatt.")
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
        .select("*")
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
        .select("*")
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
        nyelv: firstNonEmpty(body.language, body.nyelv, "hu"),
        processed: false
      };

      if (typeof body.textContent === "string" && body.textContent.trim()) {
        insertRow.text_content = body.textContent.trim();
      } else if (typeof body.text_content === "string" && body.text_content.trim()) {
        insertRow.text_content = body.text_content.trim();
      }

      const { data, error } = await insertWithSchemaFallback(supabase, insertRow);

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
