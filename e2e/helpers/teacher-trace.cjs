// e2e/helpers/teacher-trace.cjs
// WTC1 · observability-харнесс для диагностики teacher-home «составления работ».
// READ-ONLY: ничего не чинит, только наблюдает. Захватывает:
//   - RPC-трейс (teacher_picking_screen_v2 init/resolve, teacher_picking_resolve_batch_v1, list_my_students):
//     имя, статус, из request — mode/scope/selection/exclude/seed; из response — picked_questions.length,
//     shortages, warnings, error;
//   - in-page state: #sum, desired-counts из DOM (.count), фактически добавленные из sessionStorage
//     teacher_added_tasks_v1 (per-bucket), prefill (hw_create_prefill_v1), выбранный ученик, фильтр;
//   - сессия (token/exp из localStorage), 401-ответы, console errors / pageerrors.

const RPC_RE = /\/rest\/v1\/rpc\/(teacher_picking_screen_v2|teacher_picking_resolve_batch_v1|list_my_students|listMyStudents)/;

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return null; } }

// Подключить трейс к странице. Возвращает аккумулятор + reset().
function attachTrace(page) {
  const trace = { rpc: [], consoleErrors: [], pageErrors: [], http401: [] };

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const m = url.match(RPC_RE);
      const is401 = res.status() === 401;
      if (is401) trace.http401.push({ url, status: 401 });
      if (!m) return;
      const fn = m[1];
      const req = res.request();
      let reqArgs = null;
      try { reqArgs = safeParse(req.postData() || 'null'); } catch (_) {}
      let body = null;
      try { body = await res.json(); } catch (_) { body = null; }

      // payload может прийти как сам объект функции (PostgREST возвращает return значения функции)
      const payload = (body && typeof body === 'object')
        ? (body.payload && typeof body.payload === 'object' ? body.payload : body)
        : null;
      const picked = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;

      trace.rpc.push({
        fn,
        status: res.status(),
        mode: String(payload?.screen?.mode || reqArgs?.p_mode || reqArgs?.mode || '').trim() || null,
        // request summary
        req: reqArgs ? summarizeReqArgs(reqArgs) : null,
        // response summary
        picked_n: picked ? picked.length : null,
        shortages: Array.isArray(payload?.shortages) ? payload.shortages : null,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : null,
        sections_n: Array.isArray(payload?.sections) ? payload.sections.length : null,
        error: (body && body.error) ? String(body.error?.message || body.error) : null,
      });
    } catch (_) { /* ignore trace failures */ }
  });

  page.on('console', (msg) => { if (msg.type() === 'error') trace.consoleErrors.push(msg.text()); });
  page.on('pageerror', (e) => trace.pageErrors.push(String(e && e.message || e)));

  trace.reset = () => { trace.rpc = []; trace.consoleErrors = []; trace.pageErrors = []; trace.http401 = []; };
  return trace;
}

// Сжать RPC-аргументы (postData) до читаемого вида.
function summarizeReqArgs(args) {
  // args обычно { p_payload: {...} } или плоско. Ищем вложенный payload.
  const p = args?.p_payload || args?.payload || args;
  const sel = p?.selection || null;
  const request = p?.request || null;
  const requests = Array.isArray(p?.requests) ? p.requests : null;
  const exq = p?.exclude_question_ids || p?.p_exclude_question_ids || null;
  const countSel = (o) => {
    if (!o || typeof o !== 'object') return null;
    const out = {};
    for (const k of ['protos', 'topics', 'sections']) {
      if (Array.isArray(o[k])) out[k] = o[k].length;
    }
    if (Array.isArray(o.exclude_topic_ids)) out.exclude_topic_ids = o.exclude_topic_ids.length;
    return out;
  };
  return {
    mode: String(p?.mode || '').trim() || null,
    filter_id: p?.filter_id ?? null,
    selection: countSel(sel),
    request: request ? { scope_kind: request.scope_kind, scope_id: request.scope_id, n: request.n } : null,
    requests: requests ? requests.map((r) => ({ scope_kind: r.scope_kind, scope_id: r.scope_id, n: r.n })) : null,
    exclude_question_ids_n: Array.isArray(exq) ? exq.length : null,
    seed: p?.seed ? String(p.seed).slice(0, 8) + '…' : null,
  };
}

// Снимок in-page state (desired vs фактически добавленные + сессия).
async function snapshotState(page) {
  return page.evaluate(() => {
    const num = (el) => Math.max(0, Math.floor(Number(el?.value ?? 0) || 0));
    const sectionCounts = {};
    let sectionSum = 0;
    document.querySelectorAll('#accordion .node.section').forEach((node) => {
      const id = String(node.dataset.id || '').trim();
      const v = num(node.querySelector('.countbox .count'));
      if (v > 0) { sectionCounts[id] = v; sectionSum += v; }
    });
    const topicCounts = {};
    let topicSum = 0;
    document.querySelectorAll('#accordion .node.topic').forEach((node) => {
      const id = String(node.dataset.id || '').trim();
      const v = num(node.querySelector('.countbox .count'));
      if (v > 0) { topicCounts[id] = v; topicSum += v; }
    });
    const desiredTotal = sectionSum + topicSum;

    // фактически добавленные из sessionStorage teacher_added_tasks_v1
    let addedStore = null;
    try { addedStore = JSON.parse(sessionStorage.getItem('teacher_added_tasks_v1') || 'null'); } catch (_) {}
    const contexts = {};
    let activeContextTotal = null;
    const sel = document.getElementById('teacherStudentSelect');
    const selectedStudent = String(sel?.value || '').trim() || null;
    if (addedStore && addedStore.contexts) {
      for (const [ctxKey, ctx] of Object.entries(addedStore.contexts)) {
        const buckets = (ctx && ctx.buckets) || {};
        const perBucket = {};
        let total = 0;
        for (const [bk, arr] of Object.entries(buckets)) {
          const n = Array.isArray(arr) ? arr.length : 0;
          perBucket[bk] = n; total += n;
        }
        contexts[ctxKey] = { total, perBucket, seed: (ctx?.seed || '').slice(0, 8) + '…' };
      }
    }

    // prefill
    let prefill = null;
    try {
      const pf = JSON.parse(sessionStorage.getItem('hw_create_prefill_v1') || 'null');
      if (pf) {
        const cnt = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        prefill = {
          topics_total: cnt(pf.topics), sections_total: cnt(pf.sections), protos_total: cnt(pf.protos),
          picked_refs_n: Array.isArray(pf.teacher_picked_refs) ? pf.teacher_picked_refs.length : null,
          teacher_student_id: pf.teacher_student_id || null, teacher_filter_id: pf.teacher_filter_id || null,
        };
      }
    } catch (_) {}

    // сессия (token/exp) из localStorage sb-*-auth-token
    let session = null;
    try {
      for (const [k, v] of Object.entries(window.localStorage || {})) {
        if (!k.endsWith('-auth-token') || !v) continue;
        const o = JSON.parse(v); const s = o?.currentSession || o?.session || o;
        if (s?.access_token) {
          const exp = Number(s.expires_at || 0) || 0;
          session = { present: true, expires_at: exp, ttl_sec: exp ? exp - Math.floor(Date.now() / 1000) : null, userId: s?.user?.id || null };
          break;
        }
      }
    } catch (_) {}

    // UI-признаки "разлогинен". NB: #loginGoogleBtn/#userMenuBtn создаёт header.js (могут
    // отсутствовать/не успеть) — это НЕнадёжный сигнал на teacher-home. Реальный teacher-home
    // logout-сигнал — #teacherStudentStatus="Войдите..." + #teacherStudentSelect disabled.
    const loginBtn = document.getElementById('loginGoogleBtn');
    const userBtn = document.getElementById('userMenuBtn');
    const headerLoggedOut = !!(loginBtn && !loginBtn.hidden) || !!(userBtn && userBtn.hidden);
    const tSel = document.getElementById('teacherStudentSelect');
    const tStatus = document.getElementById('teacherStudentStatus');
    const teacherStudentStatusText = tStatus ? String(tStatus.textContent || '').trim() : null;
    const teacherSelectDisabled = tSel ? !!tSel.disabled : null;
    const teacherSelectOptionCount = tSel ? tSel.options.length : null;
    const loginPrompt = /Войдите/i.test(teacherStudentStatusText || '');

    const sumEl = document.getElementById('sum');
    return {
      sumText: sumEl ? String(sumEl.textContent || '').trim() : null,
      desiredTotal, sectionCounts, topicCounts,
      activeContextKey: selectedStudent ? null : null, // вычислим в отчёте по ключу
      addedContexts: contexts,
      selectedStudent,
      teacherStudentViewActive: document.body.classList.contains('teacher-student-view'),
      headerLoggedOut,
      teacherStudentStatusText, teacherSelectDisabled, teacherSelectOptionCount, loginPrompt,
      prefill, session,
    };
  });
}

// Программно выбрать первого реального ученика (повтор commit() из home_teacher.html).
async function selectFirstStudent(page) {
  await page.waitForFunction(() => {
    const s = document.getElementById('teacherStudentSelect');
    return s && Array.from(s.options).some((o) => o.value);
  }, null, { timeout: 25000 }).catch(() => {});
  return page.evaluate(() => {
    const s = document.getElementById('teacherStudentSelect');
    if (!s) return null;
    const o = Array.from(s.options).find((x) => x.value);
    if (!o) return null;
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { value: o.value, label: o.text, optionCount: s.options.length };
  });
}

// Выбрать конкретного ученика по индексу реального option (для B2/B3 переключений).
async function selectStudentByIndex(page, idx) {
  return page.evaluate((i) => {
    const s = document.getElementById('teacherStudentSelect');
    if (!s) return null;
    const reals = Array.from(s.options).filter((o) => o.value);
    const o = reals[i];
    if (!o) return null;
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { value: o.value, label: o.text, realCount: reals.length };
  }, idx);
}

// Установить count раздела через реальный input (oninput → setSectionCount → scheduleSyncAddedTasks).
async function setSectionCountByIndex(page, sectionIdx, n) {
  return page.evaluate(({ sectionIdx, n }) => {
    const node = document.querySelectorAll('#accordion .node.section')[sectionIdx];
    if (!node) return null;
    const input = node.querySelector('.countbox .count');
    if (!input) return null;
    input.value = String(n);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { sectionId: String(node.dataset.id || '').trim(), n };
  }, { sectionIdx, n });
}

// Дождаться оседания дебаунса added-tasks sync (90мс + сетевой resolve). Эвристика: ждём тишины RPC.
async function waitSyncSettle(page, trace, { quietMs = 1200, maxMs = 18000 } = {}) {
  const start = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();
  while (Date.now() - start < maxMs) {
    const n = trace.rpc.length;
    if (n !== lastCount) { lastCount = n; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) break;
    await page.waitForTimeout(150);
  }
}

module.exports = {
  attachTrace, snapshotState, selectFirstStudent, selectStudentByIndex,
  setSectionCountByIndex, waitSyncSettle, RPC_RE,
};
