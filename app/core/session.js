
// app/core/session.js
// Ядро сессии: таймер с восстановлением, учёт попыток, сериализация/восстановление

export function createSession({ bank, order, views, seed, mode = 'practice' }) {
  const N = order.length;
  const answers = new Array(N).fill(null);
  let curIndex = 0;
  let _mode = mode;

  // таймер
  let elapsedMs = 0;
  let lastTs = null;
  let paused = false;

  // время по вопросам
  const timeMs = new Array(N).fill(0);

  // попытки
  let attemptId = Date.now();
  const answeredIn = new Array(N).fill(null);

  // события
  const listeners = new Set();
  const notify = (type) => listeners.forEach(cb => { try { cb(type); } catch {} });
  function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  function currentView() { return views[curIndex]; }
  function currentIndex() { return curIndex; }
  function isPaused() { return !!paused; }

  function tick(ts = performance.now()) {
    if (!paused) {
      if (lastTs == null) lastTs = ts;
      else {
        const dt = ts - lastTs;
        elapsedMs += dt;
        timeMs[curIndex] += dt;
        lastTs = ts;
      }
    }
    return elapsedMs;
  }

  function pause() { tick(performance.now()); paused = true; lastTs = null; notify('pause'); }
  function resume() { paused = false; lastTs = performance.now(); notify('resume'); }

  function goto(delta) {
    tick(performance.now());
    let next = curIndex + delta;
    if (next < 0) next = 0;
    if (next >= N) next = N - 1;
    if (next !== curIndex) {
      curIndex = next;
      lastTs = performance.now();
      notify('goto');
    }
  }

  function select(choiceIdx) {
    answers[curIndex] = choiceIdx;
    answeredIn[curIndex] = attemptId;
    notify('select');
  }

  function clear() { answers[curIndex] = null; answeredIn[curIndex] = attemptId; notify('clear'); }


  function finish() {
    // финальный тик и пауза
    pause();

    const entriesAll = order.map((qIdx, pos) => {
      const v = views[pos];
      const chosen = answers[pos];

      // --- Определяем корректный индекс максимально надёжно ---
      let corr = (typeof v.correct === 'number') ? v.correct : undefined;
      if (typeof corr !== 'number' && Array.isArray(v.choices)) {
        // 1) ищем по флагам в объектных вариантах
        let idx = -1;
        for (let k = 0; k < v.choices.length; k++) {
          const ch = v.choices[k];
          if (ch && typeof ch === 'object' &&
             (ch.isCorrect === true || ch.correct === true || ch.true === true)) {
            idx = k; break;
          }
        }
        if (idx >= 0) corr = idx;
      }
      // 2) fallback по текстовым полям ответа
      let corrText = undefined;
      if (typeof corr === 'number' && v.choices && v.choices[corr] != null) {
        corrText = v.choices[corr];
      } else {
        corrText = v.correctText ?? v.answer ?? v.solution ?? '';
      }

      // Вычисляем корректность
      let ok = false;
      if (chosen != null) {
        if (typeof corr === 'number') ok = (chosen === corr);
        else if (corrText != null && v.choices && v.choices[chosen] != null) {
          // мягкое сравнение по тексту
          const toStr = (x) => (typeof x === 'string') ? x : JSON.stringify(x);
          ok = toStr(v.choices[chosen]) === toStr(corrText);
        }
      }

      return {
        i: pos + 1,
        topic: bank[qIdx].topic,
        ok,
        timeMs: Math.round(timeMs[pos] || 0),
        chosenIndex: chosen,
        chosenText: chosen != null && v.choices ? v.choices[chosen] : '',
        correctIndex: (typeof corr === 'number') ? corr : null,
        correctText: corrText,
        stem: v.stem,
        attemptId: answeredIn[pos] || null,
      };
    });

    const entries = entriesAll.filter(e => e.attemptId === attemptId);
    const total = entries.length;
    const correct = entries.filter(e => e.ok).length;
    const avgMs = total ? Math.round(entries.reduce((s, e) => s + (e.timeMs || 0), 0) / total) : 0;

    return {
      total, correct, incorrect: total - correct, avgMs,
      entries,
      seed, mode: _mode, attemptId,
    };
  }

  function newAttempt()  }

  function newAttempt() {
    attemptId = Date.now();
    for (let i=0;i<N;i++){ answers[i]=null; timeMs[i]=0; answeredIn[i]=null; }
    curIndex = 0; elapsedMs = 0; lastTs = performance.now(); paused = false; notify('restart');
  }

  function serialize() {
    return { v:3, seed, mode:_mode, order, curIndex, answers, elapsedMs, paused, timeMs, answeredIn, attemptId };
  }

  function restore(snap) {
    try {
      if (typeof snap.curIndex === 'number') curIndex = Math.max(0, Math.min(N-1, snap.curIndex));
      if (Array.isArray(snap.answers)) snap.answers.forEach((v,i)=>answers[i]=v);
      elapsedMs = Number(snap.elapsedMs || 0);
      paused = !!snap.paused;
      if (Array.isArray(snap.timeMs)) snap.timeMs.forEach((v,i)=>timeMs[i]=Number(v||0));
      if (Array.isArray(snap.answeredIn)) snap.answeredIn.forEach((v,i)=>answeredIn[i]=v);
      attemptId = snap.attemptId || Date.now();
      lastTs = paused ? null : performance.now();
      notify('restore');
    } catch(e){ console.warn('session.restore error:', e); }
  }

  return {
    onChange,
    currentIndex, currentView,
    goto, select, clear,
    isPaused, pause, resume,
    tick, finish, newAttempt,
    serialize, restore,
    get order(){ return order; },
    get seed(){ return seed; },
  };
}
