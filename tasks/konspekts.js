// tasks/konspekts.js
// WLM.1 — ученическая страница «Конспекты занятий»: список опубликованных конспектов
// авторизованного ученика (student_konspekts_list_v1) по датам; открыть/скачать PDF по
// подписанному URL (клиент мьютит сам через Storage REST, доступ гейтит storage.objects RLS).

import { studentKonspektsList, signedUrl } from '../app/providers/konspekts.js?v=2026-06-17-6-063624';
import { getSession } from '../app/providers/supabase.js?v=2026-06-17-6-063624';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtDate(iso) {
  try {
    const p = String(iso || '').split('-').map(Number);
    const y = p[0], m = p[1], d = p[2];
    if (!y || !m || !d) return String(iso || '');
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d} ${months[m - 1] || ''} ${y}`.trim();
  } catch (_) { return String(iso || ''); }
}

function pluralCards(n) {
  const a = n % 10, b = n % 100;
  const word = (a === 1 && b !== 11) ? 'карточка'
    : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'карточки'
      : 'карточек';
  return `${n} ${word}`;
}

function renderKonspekt(k) {
  const card = el('div', 'kons-card');

  const head = el('div', 'kons-card-head');
  head.appendChild(el('div', 'kons-date', fmtDate(k.lesson_date)));
  const bits = [];
  if (k.teacher_name) bits.push(k.teacher_name);
  if (k.snapshot_count) bits.push(pluralCards(Number(k.snapshot_count)));
  head.appendChild(el('div', 'kons-meta', bits.join('  ·  ')));
  card.appendChild(head);

  const btn = el('button', 'btn small kons-open', 'Открыть PDF');
  btn.type = 'button';
  if (!k.pdf_path) { btn.disabled = true; btn.textContent = 'Нет файла'; }
  btn.addEventListener('click', async () => {
    if (!k.pdf_path || btn.disabled) return;
    // Открываем вкладку синхронно (до await) — иначе блокировщик попапов её срежет.
    const w = window.open('', '_blank');
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Открываю…';
    try {
      const url = await signedUrl(k.pdf_path, 3600);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      console.warn('open konspekt pdf failed', e);
      if (w) { try { w.close(); } catch (_) {} }
      btn.textContent = 'Ошибка';
      setTimeout(() => { btn.textContent = old; }, 1600);
    } finally {
      btn.disabled = false;
      if (btn.textContent === 'Открываю…') btn.textContent = old;
    }
  });
  card.appendChild(btn);

  return card;
}

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('konspektsRoot');
  if (!root) return;

  const session = await getSession({ timeoutMs: 4000 }).catch(() => null);
  if (!session) {
    root.innerHTML = '';
    root.appendChild(el('div', 'kons-empty', 'Войдите, чтобы увидеть конспекты занятий.'));
    return;
  }

  try {
    const list = await studentKonspektsList();
    root.innerHTML = '';
    if (!list.length) {
      root.appendChild(el('div', 'kons-empty',
        'Пока нет конспектов. Они появятся после занятия с преподавателем.'));
      return;
    }
    for (const k of list) root.appendChild(renderKonspekt(k));
  } catch (e) {
    console.warn('load konspekts failed', e);
    root.innerHTML = '';
    root.appendChild(el('div', 'kons-empty',
      'Не удалось загрузить конспекты. Попробуйте обновить страницу.'));
  }

  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});
