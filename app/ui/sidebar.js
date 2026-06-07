// app/ui/sidebar.js — единый аддитивный контроллер бокового меню (рельс/дровер).
//
// Подключается на всех app-страницах ОДНОЙ строкой; работает ПОВЕРХ существующей
// inline-разметки #htSidebar и inline-IIFE страницы (open/close, синк имени, выход,
// бейдж уведомлений остаются на инлайне — здесь НЕ дублируются). Добавляет только
// то, что должно быть единым на всём сайте:
//   1) пункт «Главная» (домик) первым, цель — по роли (ученик→home_student, учитель→home_teacher);
//   2) подсветку активного пункта по текущему пути (.ht-sidebar-item.active);
//   3) персист состояния рельса (.ht-sidebar.open) в localStorage — ТОЛЬКО десктоп,
//      восстановление без анимации-мигания;
//   4) role-aware для «универсальных» страниц (профиль, #htSidebar[data-sidebar-role="auto"]):
//      определяет роль и переключает body[data-home-variant] + перестраивает набор пунктов.
//
// Инвариант: НЕ ломаем id/классы, на которых держится CSS (.ht-sidebar*, #htNav*, body.has-notif).

const OPEN_KEY = 'ege_sidebar_open';

const ICONS = {
  home:
    '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
  stats:
    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  works:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  profile:
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  students:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

// Описание пунктов по роли (первый — «Главная»). href — относительно «домашнего» url.
const NAV = {
  student: [
    { id: 'htNavHome', icon: 'home', label: 'Главная', href: 'home_student.html' },
    { id: 'htNavStats', icon: 'stats', label: 'Статистика', href: 'tasks/stats.html' },
    { id: 'htNavWorks', icon: 'works', label: 'Мои ДЗ', href: 'tasks/my_homeworks.html' },
    { id: 'htNavProfile', icon: 'profile', label: 'Профиль', href: 'tasks/profile.html' },
  ],
  teacher: [
    { id: 'htNavHome', icon: 'home', label: 'Главная', href: 'home_teacher.html' },
    { id: 'htNavStudents', icon: 'students', label: 'Мои ученики', href: 'tasks/my_students.html' },
    { id: 'htNavWorks', icon: 'works', label: 'Выданные работы', href: 'tasks/my_students.html' },
    { id: 'htNavProfile', icon: 'profile', label: 'Профиль', href: 'tasks/profile.html' },
  ],
};

function homeUrl() {
  try {
    return /\/tasks(\/|$)/.test(location.pathname)
      ? new URL('../', location.href).toString()
      : new URL('./', location.href).toString();
  } catch (_) {
    return './';
  }
}

function isDesktop() {
  try {
    return window.matchMedia('(min-width:1025px)').matches;
  } catch (_) {
    return false;
  }
}

// Ключ текущей страницы — для подсветки активного пункта.
function pageKey() {
  const p = String(location.pathname || '');
  if (/\/home_student\.html$/.test(p)) return 'home_student';
  if (/\/home_teacher\.html$/.test(p)) return 'home_teacher';
  if (p === '/' || p === '' || /\/index\.html$/.test(p)) return 'root';
  const m = p.match(/\/tasks\/([a-z0-9_]+)\.html$/i);
  return m ? m[1].toLowerCase() : '';
}

// Какие ключи страниц «принадлежат» пункту. ВАЖНО (правка оператора): подсветка только на
// САМИХ страницах-пунктах меню. Подстраницы/режимы, которых нет в меню (открытое ДЗ hw,
// архив my_homeworks_archive, открытый ученик student, trainer/list/unique/analog/hw_create),
// НЕ подсвечивают ничего — иначе кажется, будто мы «на вкладке», которой нет.
function matchFor(id, role) {
  switch (id) {
    case 'htNavHome':
      return role === 'teacher' ? ['home_teacher'] : ['home_student'];
    case 'htNavStats':
      return ['stats'];
    case 'htNavWorks':
      // student — только сам список «Мои ДЗ» (НЕ архив, НЕ открытое ДЗ);
      // teacher «Выданные работы» пока без отдельной страницы.
      return role === 'teacher' ? [] : ['my_homeworks'];
    case 'htNavStudents':
      // только сам список «Мои ученики» (НЕ карточка открытого ученика student.html).
      return ['my_students'];
    case 'htNavProfile':
      return ['profile'];
    default:
      return [];
  }
}

// Роль из кэша header.js (sessionStorage ege_profile_role:<uid>).
function cachedRole() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('ege_profile_role:')) {
        const v = (sessionStorage.getItem(k) || '').trim().toLowerCase();
        if (v) return v === 'teacher' ? 'teacher' : 'student';
      }
    }
  } catch (_) {}
  return null;
}

// Роль из текста #menuStats (header.js: «Мои ученики» = учитель, «Статистика» = ученик).
function menuStatsRole() {
  const el = document.getElementById('menuStats');
  if (!el) return null;
  const t = (el.textContent || '').trim();
  if (!t) return null;
  return /ученик/i.test(t) ? 'teacher' : 'student';
}

function makeIconSpan(icon) {
  const span = document.createElement('span');
  span.className = 'ht-sidebar-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    (ICONS[icon] || '') +
    '</svg>';
  return span;
}

function makeItem(def) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ht-sidebar-item';
  btn.id = def.id;
  btn.appendChild(makeIconSpan(def.icon));
  const label = document.createElement('span');
  label.className = 'ht-sidebar-label';
  label.textContent = def.label;
  btn.appendChild(label);
  btn.addEventListener('click', () => {
    try {
      location.href = homeUrl() + def.href;
    } catch (_) {}
  });
  return btn;
}

// role-specific страница: просто добавить «Главная» первым (один раз), не трогая остальные.
function ensureHome(nav, role) {
  if (nav.querySelector('#htNavHome')) return;
  const def = NAV[role][0]; // Home всегда первый в NAV
  nav.insertBefore(makeItem(def), nav.firstChild);
}

// universal страница (профиль): полностью перестроить набор пунктов под роль.
function rebuildNav(nav, role) {
  nav.textContent = '';
  NAV[role].forEach((def) => nav.appendChild(makeItem(def)));
}

function markActive(nav, role) {
  const key = pageKey();
  nav.querySelectorAll('.ht-sidebar-item').forEach((b) => {
    const on = !!b.id && matchFor(b.id, role).indexOf(key) !== -1;
    b.classList.toggle('active', on);
  });
}

// ── Персист рельса (.open) — только десктоп ──
function restoreOpen(sidebar) {
  if (!isDesktop()) return; // мобилка: дровер всегда стартует закрытым
  let open = false;
  try {
    open = localStorage.getItem(OPEN_KEY) === '1';
  } catch (_) {}
  if (!open) return;
  document.body.classList.add('ht-sidebar-restoring'); // CSS гасит transition
  sidebar.classList.add('open');
  document.body.classList.add('ht-sidebar-open');
  const close = sidebar.querySelector('#htSidebarClose');
  const openBtn = document.getElementById('htSidebarOpen');
  if (close) close.setAttribute('aria-expanded', 'true');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.classList.remove('ht-sidebar-restoring'))
  );
}

function observeOpenAndSave(sidebar) {
  const save = () => {
    if (!isDesktop()) return; // мобильные открытия дровера не сохраняем
    try {
      localStorage.setItem(OPEN_KEY, sidebar.classList.contains('open') ? '1' : '0');
    } catch (_) {}
  };
  new MutationObserver(save).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
}

export function initSidebar() {
  const sidebar = document.getElementById('htSidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('.ht-sidebar-nav');
  if (!nav) return;

  const auto = sidebar.dataset.sidebarRole === 'auto';

  function resolveRole() {
    if (auto) {
      return menuStatsRole() || cachedRole() || document.body.dataset.homeVariant || 'student';
    }
    return document.body.dataset.homeVariant || 'student';
  }

  let role = resolveRole() === 'teacher' ? 'teacher' : 'student';

  function apply(r) {
    r = r === 'teacher' ? 'teacher' : 'student';
    if (auto) {
      document.body.dataset.homeVariant = r; // профиль: каркас/CSS под роль
      rebuildNav(nav, r); // полный набор пунктов под роль
    } else {
      ensureHome(nav, r); // только «Главная» первым
    }
    markActive(nav, r);
  }

  apply(role);

  // Универсальная страница: роль может уточниться асинхронно (header.js дотягивает profiles.role).
  if (auto) {
    const fix = () => {
      const nr = resolveRole() === 'teacher' ? 'teacher' : 'student';
      if (nr !== role) {
        role = nr;
        apply(role);
      }
    };
    const ms = document.getElementById('menuStats');
    if (ms) new MutationObserver(fix).observe(ms, { childList: true, characterData: true, subtree: true });
    // #menuStats монтируется header.js асинхронно — ловим появление.
    const mountObs = new MutationObserver(() => {
      const m = document.getElementById('menuStats');
      if (m) {
        fix();
        new MutationObserver(fix).observe(m, { childList: true, characterData: true, subtree: true });
      }
    });
    mountObs.observe(document.body, { childList: true, subtree: true });
    try {
      window.addEventListener('app-auth-changed', fix);
    } catch (_) {}
    setTimeout(fix, 1200);
    setTimeout(fix, 2600);
  }

  restoreOpen(sidebar);
  observeOpenAndSave(sidebar);
}
