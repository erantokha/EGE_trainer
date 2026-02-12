// tasks/landing.js
// Лендинг на главной (/). Роль (ученик/учитель) меняет контент и CTA.
(function () {
  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
  const STORAGE_KEY = 'ege_landing_role';

  const el = {
    roleBtns: Array.from(document.querySelectorAll('.landing-seg-btn[data-role]')),
    start1: document.getElementById('landingStartBtn'),
    start2: document.getElementById('landingStartBtn2'),
    steps: document.getElementById('landingSteps'),
    benefits: document.getElementById('landingBenefits'),
    quotes: document.getElementById('landingQuotes'),
    mockText: document.getElementById('landingMockText'),
    ctaSub: document.getElementById('landingCtaSub'),
  };

  const DATA = {
    student: {
      ctaText: 'Начать как ученик',
      ctaSub: 'Тренируйся по темам и отслеживай прогресс.',
      mock: 'Главная ученика: темы, проценты, покрытие, готовность.',
      steps: [
        'Выбираешь тему и формат тренировки.',
        'Решаешь задачи, сразу видишь прогресс по темам.',
        'Получаешь ДЗ от учителя и сдаёшь в удобном виде.',
      ],
      benefits: [
        ['Понимаешь слабые темы', 'Проценты и покрытие по каждой теме.'],
        ['Системность', 'Тренировка без хаоса: темы, количество, приоритеты.'],
        ['Готовность в баллах', 'Видно, сколько до цели по первой части.'],
        ['Удобно с телефона', 'Можно тренироваться в дороге и дома.'],
        ['ДЗ не теряется', 'Список работ, статусы, история попыток.'],
        ['Мотивация', 'Прогресс виден сразу — легче держать темп.'],
      ],
      quotes: [
        ['Стало проще понять, какие темы реально проседают и что делать дальше.', 'Ученик, 11 класс (пример)'],
        ['Удобно, что домашка и тренировки в одном месте, ничего не теряется.', 'Ученик, 10 класс (пример)'],
      ],
    },
    teacher: {
      ctaText: 'Начать как учитель',
      ctaSub: 'Создавай ДЗ и смотри отчёты по каждому ученику.',
      mock: 'Учитель: список учеников, домашние задания, отчёты и ошибки.',
      steps: [
        'Создаёшь ДЗ по темам и количеству задач.',
        'Ученики решают — попытки и ответы сохраняются.',
        'Смотришь отчёт: что решено, где ошибки и пробелы.',
      ],
      benefits: [
        ['Домашка за минуты', 'Выбор тем, количества и параметров в одном экране.'],
        ['Отчёт по каждому', 'Кто сдал, кто нет, какие ошибки типовые.'],
        ['Экономия времени', 'Меньше ручной проверки, больше работы по сути.'],
        ['Контроль дисциплины', 'Несданные, просроченные, история работ.'],
        ['Понимание группы', 'Где класс “проседает” и что давать дальше.'],
        ['Единый кабинет', 'Ученики, задания и результаты в одной системе.'],
      ],
      quotes: [
        ['Отчёт по домашке помогает быстро понять, где у ученика пробел, и что дать дальше.', 'Учитель (пример)'],
        ['Удобно, что все попытки и ответы сохраняются — меньше вопросов “а я решал”.', 'Учитель (пример)'],
      ],
    },
  };

  function setActiveRole(role) {
    const r = (role === 'teacher') ? 'teacher' : 'student';
    try { localStorage.setItem(STORAGE_KEY, r); } catch (_) {}

    // синхронизируем обе группы тумблеров
    el.roleBtns.forEach((b) => {
      const isOn = b.getAttribute('data-role') === r;
      b.classList.toggle('active', isOn);
      b.setAttribute('aria-selected', isOn ? 'true' : 'false');
    });

    const d = DATA[r];

    if (el.start1) {
      el.start1.textContent = d.ctaText;
      el.start1.href = `./tasks/auth.html?next=/&panel=signup&role=${r}`;
    }
    if (el.start2) {
      el.start2.textContent = 'Начать';
      el.start2.href = `./tasks/auth.html?next=/&panel=signup&role=${r}`;
    }
    if (el.ctaSub) el.ctaSub.textContent = d.ctaSub;
    if (el.mockText) el.mockText.textContent = d.mock;

    renderSteps(d.steps);
    renderBenefits(d.benefits);
    renderQuotes(d.quotes);
  }

  function renderSteps(items) {
    if (!el.steps) return;
    el.steps.innerHTML = '';
    (items || []).forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'landing-step';
      li.innerHTML = `<div class="landing-step-n">Шаг ${i + 1}</div><p class="landing-step-t"></p>`;
      li.querySelector('.landing-step-t').textContent = String(t || '');
      el.steps.appendChild(li);
    });
  }

  function renderBenefits(items) {
    if (!el.benefits) return;
    el.benefits.innerHTML = '';
    (items || []).forEach(([title, desc]) => {
      const card = document.createElement('div');
      card.className = 'landing-card';
      const h = document.createElement('div');
      h.className = 'landing-card-title';
      h.textContent = String(title || '');
      const p = document.createElement('p');
      p.className = 'landing-card-desc';
      p.textContent = String(desc || '');
      card.appendChild(h);
      card.appendChild(p);
      el.benefits.appendChild(card);
    });
  }

  function renderQuotes(items) {
    if (!el.quotes) return;
    el.quotes.innerHTML = '';
    (items || []).forEach(([text, meta]) => {
      const q = document.createElement('div');
      q.className = 'landing-quote';
      const t = document.createElement('p');
      t.className = 'landing-quote-text';
      t.textContent = String(text || '');
      const m = document.createElement('div');
      m.className = 'landing-quote-meta';
      m.textContent = String(meta || '');
      q.appendChild(t);
      q.appendChild(m);
      el.quotes.appendChild(q);
    });
  }

  function bindRoleButtons() {
    el.roleBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const role = b.getAttribute('data-role');
        setActiveRole(role);
      });
    });
  }

  function getInitialRole() {
    try {
      const saved = String(localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
      if (saved === 'teacher' || saved === 'student') return saved;
    } catch (_) {}
    return 'student';
  }

  bindRoleButtons();
  setActiveRole(getInitialRole());
})();
