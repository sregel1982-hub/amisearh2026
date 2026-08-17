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

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || null;
  const token = auth ? String(auth).replace(/^Bearer\s+/i, '') : null;
  const user = await getUserFromToken(token);
  if (!user) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // Try to load a profile row from `profiles` table, if present
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'GET',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    let profile = null;
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) profile = rows[0];
    }

    const out = {
      id: user.id,
      email: user.email || null,
      username: (profile && (profile.username || profile.user_name)) || (user.email ? user.email.split('@')[0] : null),
      fullName: (profile && (profile.full_name || profile.fullName || profile.name)) || (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || null,
      plan: (profile && profile.plan) || 'Free',
      status: (profile && profile.status) || 'teacher', // default to teacher only to let frontend work; you may want to change
      rawProfile: profile || null,
    };

    return { statusCode: 200, headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'application/json' }), body: JSON.stringify({ profile: out }) };
  } catch (e) {
    console.error('user-profile error', e);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server error' }) };
  }
};
