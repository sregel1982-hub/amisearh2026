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

function cleanStorageRef(input) {
  let value = String(input || "").trim();
  if (!value) return { bucket: "", path: "" };

  try {
    value = decodeURIComponent(value);
  } catch (_) {}

  /* Supabase public/sign URL felismerése:
     .../storage/v1/object/public/{bucket}/{path}
     .../storage/v1/object/sign/{bucket}/{path}
  */
  try {
    if (/^https?:\/\//i.test(value)) {
      const u = new URL(value);
      const marker = "/storage/v1/object/";
      const idx = u.pathname.indexOf(marker);
      if (idx >= 0) {
        const rest = u.pathname.slice(idx + marker.length);
        const parts = rest.split("/").filter(Boolean);
        if (parts[0] === "public" || parts[0] === "sign") parts.shift();
        const bucket = parts.shift() || "";
        const path = parts.join("/");
        return { bucket, path };
      }
    }
  } catch (_) {}

  value = value.replace(/^\/+/, "");

  const knownBuckets = ["jegyzetek", "uploaded-notes", "uploaded_notes", "notes", "documents"];
  const first = value.split("/")[0];
  if (knownBuckets.includes(first)) {
    return {
      bucket: first,
      path: value.split("/").slice(1).join("/")
    };
  }

  return { bucket: "", path: value };
}

async function tryDownload(supabase, bucket, path) {
  if (!bucket || !path) return { data: null, error: new Error("Missing bucket or path") };
  return await supabase.storage.from(bucket).download(path);
}

export default async function handler(req) {
  try {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const user = await getSupabaseUser(req);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const fileParam = url.searchParams.get("file");

    if (!fileParam) {
      return json({ error: "file parameter is required" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const ref = cleanStorageRef(fileParam);

    const bucketsToTry = [];
    if (ref.bucket) bucketsToTry.push(ref.bucket);
    for (const b of ["jegyzetek", "uploaded-notes", "uploaded_notes", "notes", "documents"]) {
      if (!bucketsToTry.includes(b)) bucketsToTry.push(b);
    }

    let lastError = null;
    let blob = null;
    let usedBucket = "";

    for (const bucket of bucketsToTry) {
      const { data, error } = await tryDownload(supabase, bucket, ref.path);
      if (data && !error) {
        blob = data;
        usedBucket = bucket;
        break;
      }
      lastError = error;
    }

    if (!blob) {
      return json({
        error: "Failed to download file",
        message: lastError?.message || "A fájl nem található egyik ismert bucketben sem.",
        triedPath: ref.path,
        triedBuckets: bucketsToTry
      }, 404);
    }

    const originalName = (ref.path || "jegyzet").split("/").pop().replace(/^\d+_/, "") || "jegyzet";

    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
        "X-Storage-Bucket": usedBucket
      }
    });
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
}

export const config = {};
