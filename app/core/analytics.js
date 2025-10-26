// app/core/analytics.js
// Чистые функции для агрегаций и форматирования

export function fmtPct(x){ return (Math.round((x||0)*1000)/10).toFixed(1) + '%' }
export function fmtMs(ms){
  ms = Math.max(0, Math.floor(ms||0));
  const m = Math.floor(ms/60000), s = Math.floor(ms/1000)%60;
  return (''+m).padStart(2,'0') + ':' + (''+s).padStart(2,'0');
}

// Суммы по всем попыткам: считаем по ответам (correct/total), а не по числу попыток
export function aggregateOverall(attempts){
  let sumCorrect=0, sumTotal=0;
  attempts.forEach(a => { sumCorrect += (a.correct||0); sumTotal += (a.total||0); });
  return { sumCorrect, sumTotal };
}

// Последние N попыток: верно/неверно и среднее время на вопрос (взвешенно)
export function lastNAttemptsStats(attempts, n){
  const last = attempts.slice(0, n); // уже отсортированы по finished_at DESC в выборке
  let ok=0, all=0, wTime=0;
  last.forEach(a => {
    ok += (a.correct||0);
    all += (a.total||0);
    // avg_ms — среднее время на вопрос в попытке; взвешиваем по числу вопросов
    if(typeof a.avg_ms === 'number' && a.total>0) wTime += a.avg_ms * a.total;
  });
  const avgPerQuestion = all>0 ? Math.round(wTime / all) : 0;
  return { okInLast: ok, errInLast: Math.max(0, all-ok), avgPerQuestionMsLast: avgPerQuestion };
}

// Извлекаем entries из payload всех попыток
export function flattenEntries(attempts){
  const out = [];
  attempts.forEach(a => {
    const entries = a && a.payload && Array.isArray(a.payload.entries) ? a.payload.entries : null;
    if(!entries) return;
    entries.forEach((e, idx) => {
      out.push({
        attempt_id: a.id,
        finished_at: a.finished_at || a.created_at || null,
        topic: e.topic || (Array.isArray(a.topic_ids)? a.topic_ids[0] : null),
        ok: !!e.ok,
        timeMs: typeof e.timeMs==='number' ? e.timeMs : 0,
        pos: e.i ?? idx,
        stem: e.stem || ''
      });
    });
  });
  // Сортируем по времени (свежие сначала)
  out.sort((x,y)=> String(y.finished_at).localeCompare(String(x.finished_at)));
  return out;
}

// Агрегация по темам по entries
export function groupByTopicFromEntries(entries){
  const map = Object.create(null);
  entries.forEach(e => {
    const t = e.topic || 'unknown';
    const o = map[t] || (map[t] = { ok:0, total:0, timeMs:0 });
    o.ok += e.ok ? 1 : 0;
    o.total += 1;
    o.timeMs += (e.timeMs||0);
  });
  return map;
}

// Дополнительно — сглаженная точность по дням (на случай графиков)
export function timeSeriesByDay(attempts){
  const day = new Map();
  attempts.forEach(a => {
    const d = (a.finished_at||a.created_at||'').slice(0,10);
    if(!d) return;
    const o = day.get(d) || { sumAcc:0, cnt:0 };
    const acc = (a.total>0)? (a.correct/a.total) : 0;
    o.sumAcc += acc; o.cnt++;
    day.set(d, o);
  });
  const labels = Array.from(day.keys()).sort();
  const values = labels.map(k => {
    const o = day.get(k); return o.cnt? Math.round((o.sumAcc/o.cnt)*1000)/10 : 0;
  });
  return { labels, values };
}
