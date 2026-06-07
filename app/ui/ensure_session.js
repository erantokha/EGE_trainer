// app/ui/ensure_session.js
// WTC5: единый session-gate для «голых» страничных entry, которые читают authenticated-каталог
// (catalog_index_like_v1, grant → authenticated) сразу на boot. Без гейта на холодном старте токен
// ещё не гидратирован → requireSession бросает AUTH_REQUIRED → «Ошибка загрузки каталога».
//
// Паттерн рабочих страниц (picker.js/trainer.js/hw.js): finalizeOAuthRedirect() + await getSession(boot-like)
// ДО первого auth-требующего чтения; genuine-anon → redirect на auth.html?next=<current_url> (WHF1/WS.1).
//
// ВАЖНО: auth-ядро (supabase.js/supabase-rest.js) НЕ меняем — только используем его публичный API.
import { getSession, finalizeOAuthRedirect } from '../providers/supabase.js?v=2026-06-07-23';

/**
 * Поднять сессию перед authenticated-чтениями. Возвращает session | null.
 * При null и redirectOnAnon=true — делает location.replace на auth.html?next=<current_url>.
 * @param {{ timeoutMs?: number, skewSec?: number, redirectOnAnon?: boolean }} [opts]
 */
export async function ensureSessionReady({ timeoutMs = 2200, skewSec = 30, redirectOnAnon = true } = {}) {
  // Доводим OAuth-redirect (если вернулись с ?code=...), как делают рабочие страницы.
  try { finalizeOAuthRedirect(); } catch (_) {}

  let session = null;
  try {
    session = await getSession({ timeoutMs, skewSec });
  } catch (_) {
    session = null;
  }

  if (!session && redirectOnAnon) {
    try {
      const next = encodeURIComponent(location.href);
      location.replace(new URL('./auth.html?next=' + next, location.href).toString());
    } catch (_) { /* ignore */ }
  }

  return session;
}
