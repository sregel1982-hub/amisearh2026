import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Havi limitek a csomagok alapján
const LIMITS = {
  free: 30,
  pro_1m: 100, 
  pro_6m: 1000
};

export async function checkQuota(userId) {
  if (!userId) return { allowed: true }; // vendég

  // Aktuális hónap: YYYY-MM
  const currentMonth = new Date().toISOString().slice(0, 7);

  // 1. User csomagjának lekérése
  const { data: profile } = await supabase
   .from('profiles')
   .select('plan')
   .eq('id', userId)
   .single();

  const plan = profile?.plan || 'free';
  const limit = LIMITS[plan] || LIMITS.free;

  // 2. Havi használat lekérése
  const { data, error } = await supabase
   .from('usage_limits')
   .select('count')
   .eq('user_id', userId)
   .eq('month', currentMonth)
   .single();

  if (error && error.code!== 'PGRST116') {
    console.error('Quota check error:', error);
    return { allowed: true }; // Hiba esetén engedjük
  }

  const used = data?.count || 0;
  
  if (used >= limit) {
    return { 
      allowed: false, 
      limit: limit,
      used: used,
      plan: plan,
      message: `Havi limit elérve. ${plan} csomag: ${limit} kérdés/hó. Frissíts Pro-ra több kérdésért.`
    };
  }

  return { allowed: true, limit: limit, used: used, plan: plan };
}

export async function incrementUsage(userId) {
  if (!userId) return;

  const currentMonth = new Date().toISOString().slice(0, 7);

  const { error } = await supabase.rpc('increment_usage_monthly', { 
    p_user_id: userId, 
    p_month: currentMonth 
  });

  if (error) {
    console.error('Increment usage error:', error);
  }
}
