// public/phase3_2.js
// Фаза 3.2 — стабильная версия без optional chaining и с безопасным восстановлением.
// Завязки: app/core/random.js, app/core/engine.js, app/core/session.js, app/core/validators.js

import { createRng, randomSeed } from '../app/core/random.js';
import { buildOrder, buildViews } from '../app/core/engine.js';
import { createSession } from '../app/core/session.js';
import { assertValidBank } from '../app/core/validators.js';

/* ----------------------------- DOM helpers ------------------------------ */
function $(id) { return document.getElementById(id); }
function q(sel) { return document.querySelector(sel); }
function on(elOrSel, evt, fn) {
  var el = typeof elOrSel === 'string' ? ( $(elOrSel) || q(elOrSel) ) : elOrSel;
  if (el) el.addEventListener(evt, fn);
  return el;
}
function show(el){ if (el) el.style.display = 'block'; }
function hide(el){ if (el) el.style.display = 'none'; }
function addClass(el, cls){ if (el && el.classList) el.classList.add(cls); }
function removeClass(el, cls){ if (el && el.classList) el.classList.remove(cls); }

/* ------------------------------- Consts --------------------------------- */
var ROOT         = new URL('../', location.href).href;
var REGISTRY_URL = ROOT + 'content/index.json';
var STORAGE_V3   = 'st_session_v3';

/* ------------------------- Static DOM references ------------------------ */
var modalEl      = $('topicModal');
var topicsEl     = $('topics');
var startBtn     = $('startBtn');
var toggleAllBtn = $('toggleAll');

var btnTopics    = $('btnTopics');
var btnPause     = $('btnPause');
var btnFinishTop = $('btnFinish');

var btnPrev      = $('btnPrev');
var btnNext      = $('btnNext');
var btnClear     = $('btnClear');

var quizBox      = $('quiz');
var resultBox    = $('summary');
var stemEl       = $('stem');
var optionsEl    = $('options');
var qCounter     = $('qCounter');
var progressBar  = $('progressBar');
var timerEl      = $('timer');
var filterTopic  = $('filterTopic');
var hint         = $('hint');

/* ------------------------------- State ---------------------------------- */
var registry        = null;          // content/index.json
var bank            = [];            // сводный банк вопросов
var session         = null;          // сессия ядра
var seed            = null;          // seed этой попытки
var selectedTopics  = [];            // выбраны в модалке
var filterTopicId   = '';            // фильтр селектора
var visiblePositions= [];            // массив позиций (индексов) в порядке
var checkboxes      = [];
var allSelected     = false;
var tickInt         = null;

/* ------------------------------ Utils ----------------------------------- */
function fmtTime(ms){
  var t = Math.max(0, Math.floor(ms||0));
  var m = Math.floor(t/60000);
  var s = Math.floor(t/1000)%60;
  var cs= Math.floor((t%1000)/10);
  function pad(n,w){ n=String(n); while(n.length<(w||2)) n='0'+n; return n; }
  return pad(m)+':'+pad(s)+'.'+pad(cs);
}

// Унифицированное отображение пункта ответа
function formatChoice(choice){
  if (choice == null) return '';
  if (typeof choice === 'string') return choice;
  if (typeof choice === 'object' && typeof choice.text === 'string') return choice.text;
  if (typeof choice === 'object' && ('S' in choice || 'V' in choice)) {
    var parts = [];
    if (choice.S != null) parts.push('S = '+choice.S);
    if (choice.V != null) parts.push('V = '+choice.V);
    return parts.join(', ');
  }
  try { return JSON.stringify(choice); } catch(e){ return String(choice); }
}

// Текущий порядок из сериализации (снаружи его нет)
function getOrder(){
  try {
    if (!session || !session.serialize) return [];
    var s = session.serialize();
    return Array.isArray(s.order) ? s.order : [];
  } catch(e){ return []; }
}

/* ---------------------------- Modal / Topics ---------------------------- */
function openTopics(){ removeClass(modalEl, 'hidden'); }
function closeTopics(){ addClass(modalEl, 'hidden'); }

function updateHint(){
  if (!hint) return;
  var n = checkboxes.filter(function(cb){ return cb.checked; }).length;
  hint.textContent = n === 0 ? 'Изначально ничего не выбрано' : ('Выбрано тем: '+n);
}

function renderTopicsList(){
  if (!topicsEl) return;
  topicsEl.innerHTML = '';
  checkboxes = [];
  var list = (registry && registry.topics) ? registry.topics.filter(function(t){return t.enabled;}) : [];
  for (var i=0;i<list.length;i++){
    var t = list[i];
    var label = document.createElement('label');
    label.className = 'topic';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = t.id;
    cb.addEventListener('change', updateHint);
    var span = document.createElement('span');
    span.textContent = t.title;
    label.appendChild(cb);
    label.appendChild(span);
    topicsEl.appendChild(label);
    checkboxes.push(cb);
  }
  updateHint();
}

/* ------------------------- Loading content index ------------------------ */
async function loadRegistry(){
  var res = await fetch(REGISTRY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry = await res.json();
  renderTopicsList();
}

/* ------------------------- Start / Restore session ---------------------- */
async function startNewSession(topicIds){
  selectedTopics = topicIds.slice();
  // собираем банк
  var enabled = registry.topics.filter(function(t){ return topicIds.indexOf(t.id) >= 0; });
  var packs = await Promise.all(enabled.map(function(t){
    return fetch(ROOT+'content/'+t.pack, {cache:'no-store'}).then(function(r){return r.json();});
  }));
  bank = [];
  for (var i=0;i<packs.length;i++){
    var p = packs[i];
    var qs = (p && p.questions) ? p.questions : [];
    for (var j=0;j<qs.length;j++){
      var q = qs[j];
      var obj = {};
      for (var k in q) obj[k] = q[k];
      obj.topic = p.topic;
      bank.push(obj);
    }
  }

  // валидация банка
  try { assertValidBank(bank); }
  catch(e){ alert('Ошибка в вопросах: '+(e.message||e)); openTopics(); return; }

  // построение порядка, представлений и сессии
  seed = String(randomSeed());
  var rng   = createRng(seed);
  var order = buildOrder(bank, rng);
  var views = buildViews(bank, order, rng);

  if (!order || order.length === 0){
    localStorage.removeItem(STORAGE_V3);
    openTopics();
    hide(quizBox);
    return;
  }

  session = createSession({ bank: bank, order: order, views: views, seed: seed, mode: 'practice' });
  bindSessionEvents();
  buildFilterSelect();
  applyFilterAndRender();
  startTick();
  persistV3();
}

async function tryRestore(){
  var raw = localStorage.getItem(STORAGE_V3);
  if (!raw) return false;
  try{
    var snap = JSON.parse(raw);
    await loadRegistry();
    selectedTopics = Array.isArray(snap.selectedTopics) ? snap.selectedTopics.slice() : [];
    if (!selectedTopics.length) return false;

    // восстановим банк по актуальному реестру
    var enabled = registry.topics.filter(function(t){ return selectedTopics.indexOf(t.id) >= 0; });
    var packs = await Promise.all(enabled.map(function(t){
      return fetch(ROOT+'content/'+t.pack, {cache:'no-store'}).then(function(r){return r.json();});
    }));
    bank = [];
    for (var i=0;i<packs.length;i++){
      var p = packs[i];
      var qs = (p && p.questions) ? p.questions : [];
      for (var j=0;j<qs.length;j++){
        var q = qs[j]; var obj={};
        for (var k in q) obj[k]=q[k];
        obj.topic = p.topic;
        bank.push(obj);
      }
    }

    // собрать views заново по order из снапшота
    var savedOrder = (snap.session && Array.isArray(snap.session.order)) ? snap.session.order : [];
    if (!savedOrder.length) return false;

    seed = String((snap.session && snap.session.seed) || randomSeed());
    var views = buildViews(bank, savedOrder, createRng(seed));
    session = createSession({ bank: bank, order: savedOrder, views: views, seed: seed, mode: (snap.session && snap.session.mode) || 'practice' });
    session.restore(snap.session);

    if (getOrder().length === 0) return false;

    bindSessionEvents();
    buildFilterSelect();
    filterTopicId = snap.filterTopicId || '';
    applyFilterAndRender();
    startTick();

    closeTopics();
    hide(resultBox);
    show(quizBox);
    return true;
  }catch(e){
    console.warn('Restore failed', e);
    return false;
  }
}

/* ------------------------- UI wiring / rendering ------------------------ */
function bindSessionEvents(){
  // простая шина событий
  session.onChange(function(type){
    if (type === 'pause' || type === 'resume'){
      if (btnPause) btnPause.textContent = session.isPaused() ? 'Продолжить' : 'Пауза';
      if (quizBox) {
        if (session.isPaused()) addClass(quizBox, 'paused'); else removeClass(quizBox, 'paused');
      }
    }
    if (type === 'goto' || type === 'select' || type === 'clear' || type === 'restore'){
      render();
    }
    persistV3();
  });
}

function buildFilterSelect(){
  if (!filterTopic) return;
  filterTopic.innerHTML = '<option value="">Все</option>';

  var orderArr = getOrder();
  var topicsSet = {};
  for (var i=0;i<orderArr.length;i++){
    var idx = orderArr[i];
    var t = (bank[idx] && bank[idx].topic) || '';
    if (t) topicsSet[t] = true;
  }
  var uniq = Object.keys(topicsSet);
  for (var j=0;j<uniq.length;j++){
    var opt = document.createElement('option');
    opt.value = uniq[j];
    opt.textContent = uniq[j];
    filterTopic.appendChild(opt);
  }
}

function applyFilterAndRender(){
  var orderArr = getOrder();

  if (!session || orderArr.length === 0){
    openTopics();
    hide(quizBox);
    return;
  }

  visiblePositions = [];
  for (var i=0;i<orderArr.length;i++){
    var idx = orderArr[i];
    var tp = (bank[idx] && bank[idx].topic) || '';
    if (!filterTopicId || tp === filterTopicId) visiblePositions.push(i);
  }

  // если фильтр дал пусто — сбросить на "Все"
  if (visiblePositions.length === 0){
    visiblePositions = [];
    for (var j=0;j<orderArr.length;j++) visiblePositions.push(j);
    if (filterTopic) filterTopic.value = '';
    filterTopicId = '';
  }

  var cur = session.currentIndex();
  var inList = false;
  for (var k=0;k<visiblePositions.length;k++){ if (visiblePositions[k] === cur){ inList = true; break; } }
  if (!inList && visiblePositions.length){
    session.goto(visiblePositions[0] - cur);
  }

  hide(resultBox);
  show(quizBox);
  render();
}

function render(){
  var orderArr = getOrder();
  var pos = session.currentIndex();
  var iInVisible = Math.max(0, visiblePositions.indexOf(pos));
  var total = visiblePositions.length;

  if (qCounter) qCounter.textContent = 'Вопрос '+ (Math.min(iInVisible+1, Math.max(total,1))) +' / '+ total;
  if (progressBar) progressBar.style.width = (total ? (iInVisible/total)*100 : 0)+'%';

  var view = session.currentView ? session.currentView() : null;
  if (stemEl) stemEl.innerHTML = view && view.stem ? view.stem : '';

  if (optionsEl){
    optionsEl.innerHTML = '';
    var snap = session.serialize ? session.serialize() : null;
    var chosen = (snap && Array.isArray(snap.answers)) ? snap.answers[pos] : null;
    var choices = (view && Array.isArray(view.choices)) ? view.choices : [];
    for (var i=0;i<choices.length;i++){
      var label = document.createElement('label');
      label.className = 'option';
      label.tabIndex = 0;
      var input = document.createElement('input');
      input.type = 'radio'; input.name = 'opt'; input.value = String(i);
      if (chosen === i) input.checked = true;
      var span = document.createElement('span');
      span.innerHTML = formatChoice(choices[i]);
      label.appendChild(input); label.appendChild(span);
      (function(idx){
        label.addEventListener('click', function(){ session.select(idx); persistV3(); });
      })(i);
      optionsEl.appendChild(label);
    }
  }
  if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([stemEl, optionsEl]);

  if (btnPrev) btnPrev.disabled = (visiblePositions.indexOf(pos) <= 0);
  if (btnNext) btnNext.textContent = (visiblePositions.indexOf(pos) === total - 1 && total>0) ? 'К результатам' : 'Дальше';
  if (quizBox) { if (session.isPaused && session.isPaused()) addClass(quizBox, 'paused'); else removeClass(quizBox, 'paused'); }
}

function gotoFiltered(delta){
  var pos = session.currentIndex();
  var iInVisible = visiblePositions.indexOf(pos);
  var nextInVis = iInVisible + delta;
  if (nextInVis < 0) return;
  if (nextInVis >= visiblePositions.length){ finish(); return; }
  var target = visiblePositions[nextInVis];
  session.goto(target - pos);
}

/* -------------------------- Timer / Persistence ------------------------- */
function startTick(){
  if (tickInt) clearInterval(tickInt);
  tickInt = setInterval(function(){
    var ms = session ? session.tick(performance.now()) : 0;
    if (timerEl) timerEl.textContent = fmtTime(ms);
  }, 50);
}

function persistV3(){
  if (!session || !session.serialize) return;
  var snap = {
    selectedTopics: selectedTopics.slice(),
    filterTopicId: filterTopicId,
    session: session.serialize()
  };
  try { localStorage.setItem(STORAGE_V3, JSON.stringify(snap)); } catch(e){}
}

/* ----------------------------- Summary ---------------------------------- */
function finish(){
  if (!session) return;
  var summary = session.finish();
  if (tickInt) clearInterval(tickInt);
  renderSummary(summary);
  try { localStorage.removeItem(STORAGE_V3); } catch(e){}
}

function htmlEscape(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function exportCSV(summary){
  function esc(s){ return '"'+String(s).replace(/"/g,'""')+'"'; }
  var head = ['#','topic','ok','time_ms','time','answer','correct','stem','seed','mode'];
  var lines = [head.join(',')];
  for (var i=0;i<summary.entries.length;i++){
    var e = summary.entries[i];
    lines.push([
      e.i, e.topic, e.ok?1:0, e.timeMs, fmtTime(e.timeMs),
      e.chosenText||'', e.correctText||'', (e.stem||'').replace(/\n/g,' '),
      summary.seed, summary.mode
    ].map(esc).join(','));
  }
  var blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_'+ new Date().toISOString().replace(/[:.]/g,'-') +'.csv';
  a.click(); URL.revokeObjectURL(a.href);
}
function exportJSON(summary){
  var blob = new Blob([JSON.stringify({createdAt:new Date().toISOString(), summary:summary}, null, 2)], {type:'application/json'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_'+ new Date().toISOString().replace(/[:.]/g,'-') +'.json';
  a.click(); URL.revokeObjectURL(a.href);
}

function renderSummary(summary){
  if (!resultBox) return;

  var rows = '';
  for (var i=0;i<summary.entries.length;i++){
    var e = summary.entries[i];
    rows += '<tr>'
      + '<td>'+ e.i +'</td>'
      + '<td>'+ htmlEscape(e.topic) +'</td>'
      + '<td>'+ (e.ok?'<span class="ok">верно</span>':'<span class="bad">ошибка</span>') +'</td>'
      + '<td>'+ fmtTime(e.timeMs) +'</td>'
      + '<td>'+ htmlEscape(formatChoice(e.chosenText||'')) +'</td>'
      + '<td>'+ htmlEscape(formatChoice(e.correctText||'')) +'</td>'
      + '</tr>';
  }

  var pct = (summary.correct/Math.max(summary.total,1))*100;
  resultBox.innerHTML =
    '<h2>Сводка попытки</h2>'
    + '<div class="row">'
      + '<div class="badge">Всего: '+ summary.total +'</div>'
      + '<div class="badge ok">Верно: '+ summary.correct +'</div>'
      + '<div class="badge bad">Ошибок: '+ (summary.total-summary.correct) +'</div>'
      + '<div class="badge">Среднее: '+ fmtTime(summary.avgMs) +'</div>'
      + '<button id="btnAgain" class="primary">Ещё раз</button>'
      + '<button id="btnPick"  class="secondary">Выбрать темы</button>'
      + '<button id="btnCSV"   class="secondary">CSV</button>'
      + '<button id="btnJSON"  class="secondary">JSON</button>'
    + '</div>'
    + '<div class="progress"><div class="bar" style="width:'+ pct +'%;"></div></div>'
    + '<div style="overflow:auto;margin-top:10px">'
      + '<table class="table">'
        + '<thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead>'
        + '<tbody>'+ rows +'</tbody>'
      + '</table>'
    + '</div>';

  hide(quizBox);
  show(resultBox);
  if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([resultBox]);

  on('btnCSV','click', function(){ exportCSV(summary); });
  on('btnJSON','click', function(){ exportJSON(summary); });
  on('btnAgain','click', function(){ restartWithSameTopics(); });
  on('btnPick','click', function(){
    try { localStorage.removeItem(STORAGE_V3); } catch(e){}
    hide(resultBox); hide(quizBox); openTopics();
  });
}

async function restartWithSameTopics(){
  try { localStorage.removeItem(STORAGE_V3); } catch(e){}
  if (!selectedTopics || !selectedTopics.length){ openTopics(); return; }
  await startNewSession(selectedTopics);
  hide(resultBox); show(quizBox);
}

/* ------------------------------- Events --------------------------------- */
// Темы/модалка
on(btnTopics, 'click', function(){ openTopics(); });

on(toggleAllBtn, 'click', function(){
  allSelected = !allSelected;
  for (var i=0;i<checkboxes.length;i++) checkboxes[i].checked = allSelected;
  if (toggleAllBtn) toggleAllBtn.textContent = allSelected ? 'Сбросить все' : 'Выбрать все';
  updateHint();
});

on(startBtn, 'click', async function(){
  var picked = checkboxes.filter(function(cb){return cb.checked;}).map(function(cb){return cb.value;});
  if (picked.length === 0){ alert('Выберите хотя бы одну тему'); return; }
  closeTopics();
  await startNewSession(picked);
});

// Навигация и действия
on(btnPrev, 'click', function(){ gotoFiltered(-1); });
on(btnNext, 'click', function(){ gotoFiltered(1); });
on(btnClear,'click', function(){ session.clear(); render(); persistV3(); });
on(btnPause,'click', function(){
  if (session.isPaused()) session.resume(); else session.pause();
  persistV3();
});
on(btnFinishTop,'click', finish);

// Фильтр тем
on(filterTopic,'change', function(){
  filterTopicId = filterTopic ? filterTopic.value : '';
  applyFilterAndRender();
  persistV3();
});

// Горячие клавиши
window.addEventListener('keydown', function(e){
  if (!session) return;
  if (modalEl && !modalEl.classList.contains('hidden')) return;
  if (resultBox && resultBox.style.display === 'block') return;

  if (e.key === 'ArrowLeft'){ e.preventDefault(); gotoFiltered(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter'){ e.preventDefault(); gotoFiltered(1); }
  else if (e.key === 'Backspace' || e.key === '0'){ e.preventDefault(); session.clear(); render(); persistV3(); }
  else if (String(e.key).toLowerCase() === 'p'){ e.preventDefault(); session.isPaused()?session.resume():session.pause(); persistV3(); }
  else if (['1','2','3','4'].indexOf(e.key) >= 0){
    var idx = Number(e.key) - 1;
    var v = session.currentView ? session.currentView() : null;
    if (v && v.choices && v.choices[idx] != null){ session.select(idx); render(); persistV3(); }
  }
});

/* ------------------------------ Bootstrap -------------------------------- */
(async function(){
  try{
    var restored = await tryRestore();
    if (!restored){
      await loadRegistry();
      openTopics();
    }
  }catch(e){
    alert('Ошибка инициализации: '+ (e.message||e));
    try { localStorage.removeItem(STORAGE_V3); } catch(_) {}
    openTopics();
  }
})();
