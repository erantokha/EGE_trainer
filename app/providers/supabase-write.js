import { CONFIG } from '../config.js?v=2026-01-06-1';

/** Insert attempt into public.attempts via Supabase REST (schema you shared).
 *  Returns { ok: boolean, data?: any, error?: any }
 */
export async function insertAttempt(attemptRow) {
  const url = `${CONFIG.supabase.url}/rest/v1/attempts`;
  const headers = {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(attemptRow) });
    const data = await res.json();
    if (!res.ok) return { ok:false, error:data };
    return { ok:true, data };
  } catch (e) {
    return { ok:false, error: String(e) };
  }
}
