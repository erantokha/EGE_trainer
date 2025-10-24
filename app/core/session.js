// app/core/session.js
// Мини-ядро сессии: порядок вопросов, ответы, таймер, сериализация/restore.
// Без optional chaining и прочих «тонкостей», чтобы исключить синтаксические проблемы.

export function createSession({ bank, order, views, seed, mode = 'practice' }) {
  // ---------- приватное состояние ----------
  var _bank = bank || [];
  var _order = (order || []).slice();
  var _views = (views || []).slice();

  var _pos = 0;                              // позиция в _order
  var _answers = new Array(_order.length).fill(null);     // выбранные индексы
  var _answeredIn = new Array(_order.length).fill(null);  // номер попытки, в которую дан ответ

  var _timeMs = new Array(_order.length).fill(0); // накопленное время по вопросам
  var _elapsedMs = 0;                       // накопленное общее время
  var _paused = false;                      // пауза
  var _lastTs = null;                       // последний ts для tick()

  var _attemptId = 1;                       // текущая попытка
  var _seed = seed != null ? String(seed) : '';
  var _mode = String(mode || 'practice');

  var _subscribers = [];

  function emit(type) {
    for (var i = 0; i < _subscribers.length; i++) {
      try { _subscribers[i](type); } catch (e) {}
    }
  }

  // ---------- таймер ----------
  function tick(nowTs) {
    if (_paused) return _elapsedMs;
    if (typeof nowTs !== 'number') return _elapsedMs;

    if (_lastTs == null) { _lastTs = nowTs; return _elapsedMs; }
    var dt = nowTs - _lastTs;
    if (!isFinite(dt) || dt <= 0) return _elapsedMs;

    _elapsedMs += dt;
    if (_order.length > 0 && _pos >= 0 && _pos < _order.length) {
      _timeMs[_pos] += dt;
    }
    _lastTs = nowTs;
    return _elapsedMs;
  }

  function pause() {
    if (_paused) return;
    _paused = true;
    _lastTs = null;
    emit('pause');
  }

  function resume() {
    if (!_paused) return;
    _paused = false;
    _lastTs = null;
    emit('resume');
  }

  function isPaused() { return _paused; }

  // ---------- навигация ----------
  function goto(delta) {
    if (typeof delta !== 'number') return;
    var next = _pos + delta;
    if (next < 0) next = 0;
    if (next > _order.length - 1) next = _order.length - 1;
    if (next !== _pos) {
      _pos = next;
      emit('goto');
    }
  }

  function currentIndex() { return _pos; }
  function currentView()  { return _views[_pos]; }

  // ---------- ответы ----------
  function select(index) {
    if (_order.length === 0) return;
    if (index == null) return;
    _answers[_pos] = index;
    if (_answeredIn[_pos] == null) _answeredIn[_pos] = _attemptId;
    emit('select');
  }

  function clear() {
    if (_order.length === 0) return;
    _answers[_pos] = null;
    emit('clear');
  }

  // ---------- сериализация / восстановление ----------
  function serialize() {
    return {
      bankVersion: 1,
      pos: _pos,
      answers: _answers.slice(),
      answeredIn: _answeredIn.slice(),
      order: _order.slice(),
      elapsedMs: Math.round(_elapsedMs),
      timeMs: _timeMs.slice().map(function (x) { return Math.round(x || 0); }),
      paused: _paused,
      seed: _seed,
      mode: _mode,
      attemptId: _attemptId
    };
  }

  function restore(s) {
    if (!s || typeof s !== 'object') { emit('restore'); return; }
    // переносим только совместимые поля, проверяя длины
    try {
      if (typeof s.pos === 'number') _pos = Math.min(Math.max(0, s.pos), Math.max(_order.length - 1, 0));
      if (Array.isArray(s.answers) && s.answers.length === _order.length) _answers = s.answers.slice();
      if (Array.isArray(s.answeredIn) && s.answeredIn.length === _order.length) _answeredIn = s.answeredIn.slice();
      if (Array.isArray(s.timeMs) && s.timeMs.length === _order.length) _timeMs = s.timeMs.slice();
      if (typeof s.elapsedMs === 'number') _elapsedMs = s.elapsedMs;
      if (typeof s.paused === 'boolean') _paused = s.paused;
      if (s.seed != null) _seed = String(s.seed);
      if (s.mode != null) _mode = String(s.mode);
      if (typeof s.attemptId === 'number') _attemptId = s.attemptId;
    } catch (e) {}
    _lastTs = null;
    emit('restore');
  }

  // ---------- завершение и сводка ----------
  function finish() {
    // фиксируем таймер
    pause();

    var entriesAll = _order.map(function (qIdx, pos) {
      var v = _views[pos] || {};
      var chosen = _answers[pos];

      // найти корректный ответ
      var corr = (typeof v.correct === 'number') ? v.correct : undefined;

      if (typeof corr !== 'number' && Array.isArray(v.choices)) {
        // ищем вариант с флагом
        var idx = -1;
        for (var k = 0; k < v.choices.length; k++) {
          var ch = v.choices[k];
          if (ch && typeof ch === 'object' &&
              (ch.isCorrect === true || ch.correct === true || ch.true === true)) {
            idx = k; break;
          }
        }
        if (idx >= 0) corr = idx;
      }

      // запасной вариант — текст правильного
      var corrText;
      if (typeof corr === 'number' && v.choices && v.choices[corr] != null) {
        corrText = v.choices[corr];
      } else {
        corrText = (v.correctText != null ? v.correctText :
                   (v.answer != null ? v.answer :
                   (v.solution != null ? v.solution : '')));
      }

      // сверка
      var ok = false;
      if (chosen != null) {
        if (typeof corr === 'number') ok = (chosen === corr);
        else if (corrText != null && v.choices && v.choices[chosen] != null) {
          var toStr = function (x) { return (typeof x === 'string') ? x : JSON.stringify(x); };
          ok = (toStr(v.choices[chosen]) === toStr(corrText));
        }
      }

      return {
        i: pos + 1,
        topic: (_bank[qIdx] && _bank[qIdx].topic) || '',
        ok: ok,
        timeMs: Math.round(_timeMs[pos] || 0),
        chosenIndex: chosen,
        chosenText: (chosen != null && v.choices) ? v.choices[chosen] : '',
        correctIndex: (typeof corr === 'number') ? corr : null,
        correctText: corrText,
        stem: v.stem,
        attemptId: _answeredIn[pos] != null ? _answeredIn[pos] : null
      };
    });

    // берём только ответы текущей попытки
    var entries = entriesAll.filter(function (e) { return e.attemptId === _attemptId; });
    var total = entries.length;
    var correct = entries.filter(function (e) { return e.ok; }).length;
    var avgMs = total ? Math.round(entries.reduce(function (s, e) { return s + (e.timeMs || 0); }, 0) / total) : 0;

    return {
      total: total,
      correct: correct,
      incorrect: total - correct,
      avgMs: avgMs,
      entries: entries,
      seed: _seed,
      mode: _mode,
      attemptId: _attemptId
    };
  }

  // ---------- API ----------
  return {
    // навигация / состояние
    goto: goto,
    currentIndex: currentIndex,
    currentView: currentView,
    // ответы
    select: select,
    clear: clear,
    // таймер
    tick: tick,
    pause: pause,
    resume: resume,
    isPaused: isPaused,
    // сериализация
    serialize: serialize,
    restore: restore,
    // финал
    finish: finish,
    // подписки
    onChange: function (fn) { if (typeof fn === 'function') _subscribers.push(fn); }
  };
}
