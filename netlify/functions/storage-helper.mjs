const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export function unique(values) {
  return [...new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
}

export function parseStorageReference(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { bucket: "", path: "" };

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const parts = decodeURIComponent(u.pathname).split("/").filter(Boolean);
      const objectIndex = parts.indexOf("object");
      if (objectIndex >= 0 && parts.length > objectIndex + 3) {
        const visibility = parts[objectIndex + 1];
        if ((visibility === "public" || visibility === "sign") && parts.length > objectIndex + 3) {
          const bucket = parts[objectIndex + 2];
          const path = parts.slice(objectIndex + 3).join("/");
          return { bucket, path };
        }
        const bucket = parts[objectIndex + 1];
        const path = parts.slice(objectIndex + 2).join("/");
        return { bucket, path };
      }
      return { bucket: "", path: raw };
    }
  } catch (_) {}

  let path = raw;
  const knownMarkers = [
    "/storage/v1/object/public/jegyzetek/",
    "/storage/v1/object/sign/jegyzetek/",
    "/jegyzetek/",
    "/uploaded-notes/"
  ];
  for (const marker of knownMarkers) {
    if (path.includes(marker)) path = path.split(marker).pop();
  }
  return { bucket: "", path: decodeURIComponent(path.replace(/^\/+/, "")) };
}

export function candidateBuckets(...refs) {
  const parsedBuckets = refs.map(ref => parseStorageReference(ref).bucket);
  return unique([
    getEnv("SUPABASE_NOTES_BUCKET"),
    getEnv("NOTES_BUCKET"),
    ...parsedBuckets,
    "jegyzetek",
    "uploaded-notes",
    "notes"
  ]);
}

export function candidatePaths(...refs) {
  const paths = refs.map(ref => parseStorageReference(ref).path);
  const expanded = [];
  for (const p of paths) {
    if (!p) continue;
    expanded.push(p);
    for (const b of ["jegyzetek", "uploaded-notes", "notes"]) {
      if (p.startsWith(b + "/")) expanded.push(p.slice(b.length + 1));
    }
  }
  return unique(expanded);
}

export async function createSignedUrlFromRefs(supabase, refs = [], expiresIn = 300) {
  const buckets = candidateBuckets(...refs);
  const paths = candidatePaths(...refs);
  let lastError = null;

  for (const bucket of buckets) {
    for (const path of paths) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
      if (!error && data?.signedUrl) return { signedUrl: data.signedUrl, bucket, path };
      lastError = error;
    }
  }

  return { signedUrl: "", bucket: "", path: "", error: lastError || new Error("Storage object not found") };
}

export async function downloadFromRefs(supabase, refs = []) {
  const buckets = candidateBuckets(...refs);
  const paths = candidatePaths(...refs);
  let lastError = null;

  for (const bucket of buckets) {
    for (const path of paths) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (!error && data) return { data, bucket, path };
      lastError = error;
    }
  }

  return { data: null, bucket: "", path: "", error: lastError || new Error("Storage object not found") };
}
