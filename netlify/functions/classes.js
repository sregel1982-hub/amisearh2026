import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function getAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase admin env vars missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getTeacherProfile(supabase, identityId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, identity_id, status, email")
    .eq("identity_id", identityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) return json({ error: "Bejelentkezés szükséges." }, 401);

  let supabase;
  try {
    supabase = getAdmin();
    const profile = await getTeacherProfile(supabase, user.id);
    if (!profile || profile.status !== "teacher") {
      return json({ error: "Csak tanárok érhetik el ezt a funkciót." }, 403);
    }
  } catch (error) {
    console.error("[classes] auth/profile failed:", error?.message || error);
    return json({ error: "A tanári profil ellenőrzése nem sikerült." }, 500);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("teacher_classes")
        .select("id, name, subject, students, active, created_at, updated_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(data || []);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || "").trim();
      const subject = String(body.subject || "").trim();
      const students = Math.max(0, Number.parseInt(body.students, 10) || 0);
      if (!name || !subject) return json({ error: "Az osztály neve és a tantárgy megadása kötelező." }, 400);

      const { data, error } = await supabase
        .from("teacher_classes")
        .insert({ teacher_id: user.id, name, subject, students, active: true })
        .select("id, name, subject, students, active, created_at, updated_at")
        .single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "Hiányzó osztályazonosító." }, 400);
      const body = await req.json().catch(() => ({}));
      const patch = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.subject === "string" && body.subject.trim()) patch.subject = body.subject.trim();
      if (body.students !== undefined) patch.students = Math.max(0, Number.parseInt(body.students, 10) || 0);
      if (typeof body.active === "boolean") patch.active = body.active;
      if (!Object.keys(patch).length) return json({ error: "Nincs módosítandó adat." }, 400);

      const { data, error } = await supabase
        .from("teacher_classes")
        .update(patch)
        .eq("id", id)
        .eq("teacher_id", user.id)
        .select("id, name, subject, students, active, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Osztály nem található." }, 404);
      return json(data);
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "Hiányzó osztályazonosító." }, 400);
      const { error } = await supabase
        .from("teacher_classes")
        .delete()
        .eq("id", id)
        .eq("teacher_id", user.id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("[classes] request failed:", error?.message || error);
    return json({ error: "Az osztályadatok feldolgozása nem sikerült." }, 500);
  }
}

export const config = {};
