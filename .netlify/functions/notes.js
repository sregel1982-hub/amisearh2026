const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user || null;
  } catch (e) {
    console.error('getUserFromToken error', e);
    return null;
  }
}

function json(body, status = 200) {
  return { statusCode: status, headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || null;
  const token = auth ? String(auth).replace(/^Bearer\s+/i, '') : null;
  const user = await getUserFromToken(token);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const base = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/notes`;

  try {
    // only GET supported here (list user's notes)
    if (event.httpMethod === 'GET') {
      const res = await fetch(`${base}?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`, {
        method: 'GET',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: 'application/json' },
      });
      if (!res.ok) return json({ error: 'Failed to load notes' }, 500);
      const rows = await res.json();
      // normalize minimal shape expected by frontend
      const out = rows.map(r => ({ id: r.id, title: r.title || r.original_name || r.file_name || null, subject: r.subject || null, originalName: r.original_name || r.file_name || null }));
      return json(out);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('notes error', e);
    return json({ error: 'Server error' }, 500);
  }
};
