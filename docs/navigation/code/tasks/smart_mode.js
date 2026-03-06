// tasks/smart_mode.js
// Хранение и утилиты «умной тренировки».
// Данные живут в sessionStorage, чтобы сохраняться при обновлении страницы,
// но не «тянуться» между разными вкладками/сессиями браузера.

const KEY = 'smart_mode_v1';

function safeParse(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (_) {
    return null;
  }
}

export function loadSmartMode() {
  try {
    return safeParse(sessionStorage.getItem(KEY));
  } catch (_) {
    return null;
  }
}

export function saveSmartMode(obj) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(obj || null));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSmartMode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch (_) {}
}

export function isSmartModeActive(smart) {
  const s = smart || loadSmartMode();
  if (!s || typeof s !== 'object') return false;
  // Минимальная проверка, чтобы случайные данные не ломали trainer.
  return s.v === 1 && s.plan && typeof s.plan === 'object' && s.plan.topics && typeof s.plan.topics === 'object';
}

export function ensureSmartDefaults(smart) {
  const s = smart && typeof smart === 'object' ? smart : { v: 1 };
  if (s.v !== 1) s.v = 1;
  if (!s.created_at) s.created_at = new Date().toISOString();
  if (!s.plan || typeof s.plan !== 'object') s.plan = { topics: {} };
  if (!s.plan.topics || typeof s.plan.topics !== 'object') s.plan.topics = {};
  if (!Array.isArray(s.questions)) s.questions = [];
  if (!s.progress || typeof s.progress !== 'object') s.progress = {};
  if (!s.progress.per_topic || typeof s.progress.per_topic !== 'object') s.progress.per_topic = {};
  if (typeof s.progress.total_done !== 'number') s.progress.total_done = 0;
  if (typeof s.progress.total_correct !== 'number') s.progress.total_correct = 0;
  if (typeof s.progress.total_target !== 'number') {
    const sum = Object.values(s.plan.topics || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    s.progress.total_target = sum;
  }
  return s;
}
