const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  const base = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/classes`;

  try {
    if (event.httpMethod === 'GET') {
      // list classes for this user
      const res = await fetch(`${base}?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`, {
        method: 'GET',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: 'application/json' },
      });
      if (!res.ok) return json({ error: 'Failed to load classes' }, 500);
      const rows = await res.json();
      return json(rows.map(r => ({ id: r.id, name: r.name, subject: r.subject, students: r.students, active: r.active })));
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const name = (payload.name || '').trim();
      const subject = (payload.subject || '').trim();
      const students = Number(payload.students) || 0;
      if (!name || !subject) return json({ error: 'Missing fields' }, 400);
      const body = { user_id: user.id, name, subject, students, active: true, created_at: new Date().toISOString() };
      const res = await fetch(base, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('insert failed', txt);
        return json({ error: 'Insert failed' }, 500);
      }
      const created = await res.json();
      return json(created[0] || {}, 201);
    }

    if (event.httpMethod === 'PATCH') {
      const id = (event.queryStringParameters && event.queryStringParameters.id) || null;
      if (!id) return json({ error: 'Missing id' }, 400);
      // verify owner
      const resOwner = await fetch(`${base}?id=eq.${encodeURIComponent(id)}&select=user_id`, {
        method: 'GET', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: 'application/json' }
      });
      if (!resOwner.ok) return json({ error: 'Not found' }, 404);
      const rows = await resOwner.json();
      if (!rows || !rows.length || rows[0].user_id !== user.id) return json({ error: 'Forbidden' }, 403);

      const payload = JSON.parse(event.body || '{}');
      const update = {};
      if (payload.name !== undefined) update.name = payload.name;
      if (payload.subject !== undefined) update.subject = payload.subject;
      if (payload.students !== undefined) update.students = Number(payload.students) || 0;
      if (payload.active !== undefined) update.active = payload.active;
      update.updated_at = new Date().toISOString();

      const res = await fetch(`${base}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const txt = await res.text(); console.error('patch failed', txt);
        return json({ error: 'Update failed' }, 500);
      }
      const updated = await res.json();
      return json(updated[0] || {});
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters && event.queryStringParameters.id) || null;
      if (!id) return json({ error: 'Missing id' }, 400);
      // verify owner
      const resOwner = await fetch(`${base}?id=eq.${encodeURIComponent(id)}&select=user_id`, {
        method: 'GET', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: 'application/json' }
      });
      if (!resOwner.ok) return json({ error: 'Not found' }, 404);
      const rows = await resOwner.json();
      if (!rows || !rows.length || rows[0].user_id !== user.id) return json({ error: 'Forbidden' }, 403);

      const res = await fetch(`${base}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
      });
      if (!res.ok) {
        const txt = await res.text(); console.error('delete failed', txt);
        return json({ error: 'Delete failed' }, 500);
      }
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('classes error', e);
    return json({ error: 'Server error' }, 500);
  }
};
