/**
 * netlify/functions/classes.js
 *
 * CRUD endpoint for a teacher's classes.
 * Mirrors the conventions your other functions (notes.js, user-profile.js)
 * appear to use from the frontend: Bearer token in Authorization header,
 * verified against Supabase, service-role client for the actual DB write.
 *
 * ⚠️ Double-check the two env var names below against whatever your
 * existing functions already use (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * is the common Netlify+Supabase convention, but yours may differ).
 *
 * Expected routes (single function, dispatched by HTTP method):
 *   GET    /.netlify/functions/classes            -> list teacher's classes
 *   POST   /.netlify/functions/classes             body: { name, subject, students }
 *   PATCH  /.netlify/functions/classes?id=...       body: { name?, subject?, students?, active? }
 *   DELETE /.netlify/functions/classes?id=...
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function getUserFromAuthHeader(event, supabaseAdmin) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

exports.handler = async function (event) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Server misconfigured: missing Supabase env vars.' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const user = await getUserFromAuthHeader(event, supabaseAdmin);
  if (!user) {
    return json(401, { error: 'Bejelentkezés szükséges.' });
  }

  // Csak tanár érheti el ezt a végpontot.
  const { data: profileRow, error: profileErr } = await supabaseAdmin
    .from('profiles') // ⚠️ igazítsd a saját profil-táblád nevéhez, ha más
    .select('status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    return json(500, { error: 'Profil ellenőrzési hiba: ' + profileErr.message });
  }
  if (!profileRow || profileRow.status !== 'teacher') {
    return json(403, { error: 'Csak tanárok érhetik el ezt a funkciót.' });
  }

  const params = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('classes')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json(200, data);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const name = (body.name || '').trim();
      const subject = (body.subject || '').trim();
      const students = Number.isFinite(Number(body.students)) ? Number(body.students) : 0;

      if (!name || !subject) {
        return json(400, { error: 'Az osztály neve és a tantárgy megadása kötelező.' });
      }

      const { data, error } = await supabaseAdmin
        .from('classes')
        .insert({ teacher_id: user.id, name, subject, students, active: true })
        .select()
        .single();
      if (error) throw error;
      return json(201, data);
    }

    if (event.httpMethod === 'PATCH') {
      const id = params.id;
      if (!id) return json(400, { error: 'Hiányzó osztály azonosító.' });
      const body = JSON.parse(event.body || '{}');
      const patch = {};
      if (typeof body.name === 'string') patch.name = body.name.trim();
      if (typeof body.subject === 'string') patch.subject = body.subject.trim();
      if (body.students !== undefined) patch.students = Number(body.students) || 0;
      if (typeof body.active === 'boolean') patch.active = body.active;

      const { data, error } = await supabaseAdmin
        .from('classes')
        .update(patch)
        .eq('id', id)
        .eq('teacher_id', user.id) // biztosítja, hogy csak saját osztályt módosíthat
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: 'Osztály nem található.' });
      return json(200, data);
    }

    if (event.httpMethod === 'DELETE') {
      const id = params.id;
      if (!id) return json(400, { error: 'Hiányzó osztály azonosító.' });

      const { error } = await supabaseAdmin
        .from('classes')
        .delete()
        .eq('id', id)
        .eq('teacher_id', user.id);
      if (error) throw error;
      return json(200, { deleted: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('classes.js error:', e);
    return json(500, { error: e.message || 'Ismeretlen szerverhiba.' });
  }
};
