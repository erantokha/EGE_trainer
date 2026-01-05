// app/providers/auth.js
import { CONFIG } from '../config.js';
const { createClient } = window.supabase;

let client = null;
function getClient(){
  if(!client){ client = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey); }
  return client;
}

export function signInWithEmail(email){
  const sb = getClient();
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
}
export function onAuthStateChanged(cb){
  const sb = getClient();
  return sb.auth.onAuthStateChange((_evt, session)=>cb(session));
}
export function signOut(){ const sb = getClient(); return sb.auth.signOut(); }
export async function getSession(){ const sb=getClient(); const { data } = await sb.auth.getSession(); return data.session||null; }
