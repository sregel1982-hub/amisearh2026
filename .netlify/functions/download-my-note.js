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

  const id = (event.queryStringParameters && event.queryStringParameters.id) || null;
  if (!id) return json({ error: 'Missing id' }, 400);

  try {
    const base = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/notes`;
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'GET', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: 'application/json' }
    });
    if (!res.ok) return json({ error: 'Note not found' }, 404);
    const rows = await res.json();
    if (!rows || !rows.length) return json({ error: 'Note not found' }, 404);
    const note = rows[0];
    if (note.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // Try common fields for a downloadable URL
    const url = note.url || note.public_url || note.storage_path || note.s3_url || null;
    const originalName = note.original_name || note.file_name || note.originalName || null;
    if (!url) return json({ error: 'No downloadable URL available' }, 404);

    return json({ url, originalName });
  } catch (e) {
    console.error('download-my-note error', e);
    return json({ error: 'Server error' }, 500);
  }
};
