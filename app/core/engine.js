// app/core/engine.js
// Генератор порядка и представлений (views) для вопросов.
// Важное: в каждом view выставляется view.correct — индекс правильного ПОСЛЕ перемешивания.

function _rngOrMath(rng) {
  return (typeof rng === 'function') ? rng : Math.random;
}

function _shuffle(arr, rng) {
  var r = _rngOrMath(rng);
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(r() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function buildOrder(bank, rng) {
  var order = [];
  for (var i = 0; i < bank.length; i++) order.push(i);
  return _shuffle(order, rng);
}

export function buildViews(bank, order, rng) {
  var r = _rngOrMath(rng);
  var views = [];

  for (var p = 0; p < order.length; p++) {
    var qIdx = order[p];
    var q = bank[qIdx] || {};

    var stem =
      q.stem != null ? q.stem :
      q.question != null ? q.question :
      q.text != null ? q.text : '';

    var allChoices = Array.isArray(q.choices) ? q.choices.slice() : [];
    var correctIdx =
      (typeof q.correct === 'number') ? q.correct :
      (typeof q.answer  === 'number') ? q.answer  :
      null;

    // Без вариантов — отрисуем пустой вопрос.
    if (!allChoices.length) {
      views.push({ stem: stem, choices: [], correct: null, correctText: '' });
      continue;
    }

    // Список индексов неверных вариантов
    var wrong = [];
    for (var i = 0; i < allChoices.length; i++) {
      if (i !== correctIdx) wrong.push(i);
    }
    _shuffle(wrong, r);

    // Берем правильный + 3 неверных (или меньше, если их не хватает)
    var selected = [];
    if (typeof correctIdx === 'number' &&
        correctIdx >= 0 && correctIdx < allChoices.length) {
      selected.push(correctIdx);
    }
    for (var k = 0; k < wrong.length && selected.length < 4; k++) {
      selected.push(wrong[k]);
    }
    // На всякий случай: если всего вариантов меньше 4 — оставляем сколько есть.

    // Перемешиваем выбранные
    _shuffle(selected, r);

    // Индекс правильного в перемешанном списке
    var correctPos = -1;
    for (var s = 0; s < selected.length; s++) {
      if (selected[s] === correctIdx) { correctPos = s; break; }
    }

    // Собираем итоговые варианты
    var choices = [];
    for (var t = 0; t < selected.length; t++) {
      choices.push(allChoices[selected[t]]);
    }

    var correctText = (correctIdx != null && allChoices[correctIdx] != null)
      ? allChoices[correctIdx]
      : '';

    views.push({
      stem: stem,
      choices: choices,
      correct: (correctPos >= 0 ? correctPos : null),
      correctText: correctText,
      // при желании можно сохранить сопоставление с исходными индексами
      // _origChoiceIdx: selected.slice()
    });
  }

  return views;
}
