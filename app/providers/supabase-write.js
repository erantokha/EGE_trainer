// app/providers/supabase-write.js
// Безопасная запись попыток в public.attempts через supabase-js (authenticated).
// Раньше запись шла anon-ключом напрямую в PostgREST — это открывало дыру для спама/DoS.

import { supabase, getSession } from './supabase.js?v=2026-01-09-1';

function inferDisplayName(session) {
  const um = session?.user?.user_metadata || {};
  const full =
    um.full_name ||
    um.name ||
    [um.given_name, um.family_name].filter(Boolean).join(' ') ||
    null;
  return full || null;
}

/** Insert attempt into public.attempts via Supabase client (RLS).
 *  Returns { ok: boolean, data?: any, error?: any, skipped?: boolean }
 */
export async function insertAttempt(attemptRow) {
  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    return { ok: false, error: e };
  }

  if (!session) {
    // Без сессии запись запрещена RLS. Это не ошибка страницы — просто не сохраняем статистику.
    return { ok: true, skipped: true };
  }

  const userId = session.user?.id || null;
  if (!userId) return { ok: false, error: new Error('AUTH_USER_MISSING') };

  const row = {
    ...attemptRow,
    student_id: attemptRow?.student_id ?? userId,
    student_email: attemptRow?.student_email ?? (session.user?.email || null),
    student_name: attemptRow?.student_name ?? inferDisplayName(session),
  };

  const { data, error } = await supabase
    .from('attempts')
    .insert(row)
    .select()
    .single();

  return { ok: !error, data, error };
}
