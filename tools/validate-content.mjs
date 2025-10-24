#!/usr/bin/env node
/**
 * tools/validate-content.mjs
 * Валидация контента тренажёра (content/index.json и пакеты вопросов).
 * Запуск: node tools/validate-content.mjs [--max-errors=100] [--json]
 * Выход с кодом 1 при наличии ошибок.
 */
import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const CONTENT_ROOT = path.join(CWD, 'content');
const INDEX_FILE   = path.join(CONTENT_ROOT, 'index.json');

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.split('=');
  return [k, v ?? ''];
}));
const AS_JSON = args.has('--json');
const MAX_ERRORS = Number(args.get('--max-errors') ?? '100') || 100;

function ok(s){ console.log(s); }
function warn(s){ console.warn(s); }
function err(s){ console.error(s); }

function readJson(file){
  return readFile(file, 'utf8').then(JSON.parse);
}

function fileExists(p){
  return stat(p).then(()=>true).catch(()=>false);
}

function isNonEmptyString(x){
  return typeof x === 'string' && x.trim().length > 0;
}

function kebabLike(x){
  return /^[a-z0-9][a-z0-9\-]*$/.test(x);
}

function countOccurrences(hay, needle){
  let pos = 0, c = 0;
  while(true){
    const i = hay.indexOf(needle, pos);
    if(i === -1) break;
    c++; pos = i + needle.length;
  }
  return c;
}

// ---- Collect ----
/** @typedef {{path:string, code:string, msg:string}} Issue */

const issues = /** @type {Issue[]} */([]);
const warnings = /** @type {Issue[]} */([]);

function pushError(path, code, msg){
  if(issues.length < MAX_ERRORS) issues.push({ path, code, msg });
}
function pushWarn(path, code, msg){
  warnings.push({ path, code, msg });
}

// ---- Validate index.json ----
/** @returns {Promise<{index:any, topicsMeta: {id:string,title:string,pack:string,enabled:boolean,packPath:string}[]}>} */
async function validateIndex(){
  const idx = await readJson(INDEX_FILE).catch(e=>{
    pushError('content/index.json','index.read','Не удалось прочитать или распарсить index.json: '+e.message);
    return null;
  });
  if(!idx) return { index:null, topicsMeta: [] };
  if(!Array.isArray(idx.topics)){
    pushError('content/index.json','index.topics.array','Поле topics должно быть массивом');
    return { index: idx, topicsMeta: [] };
  }
  const ids = new Set();
  const topicsMeta = [];
  for (const t of idx.topics){
    const p = `index.topics[${t?.id ?? '?'}]`;
    if(!isNonEmptyString(t.id)) pushError(p,'topic.id','id обязателен и должен быть непустой строкой');
    else {
      if(ids.has(t.id)) pushError(p,'topic.id.duplicate',`Повтор id темы: ${t.id}`);
      ids.add(t.id);
      if(!kebabLike(t.id)) pushWarn(p,'topic.id.format','Рекомендуется kebab-case для id (буквы/цифры/дефис)');
    }
    if(!isNonEmptyString(t.title)) pushError(p,'topic.title','title обязателен и должен быть непустой строкой');
    if(!isNonEmptyString(t.pack)) pushError(p,'topic.pack','pack обязателен и должен быть непустой строкой');
    if(typeof t.enabled !== 'boolean') pushError(p,'topic.enabled','enabled обязателен и должен быть boolean');

    const packPath = path.join(CONTENT_ROOT, t.pack || '');
    topicsMeta.push({ id: t.id, title: t.title, pack: t.pack, enabled: !!t.enabled, packPath });
    if(!(await fileExists(packPath))) pushError(p,'topic.pack.exists',`Файл пакета не найден: ${t.pack}`);
  }
  return { index: idx, topicsMeta };
}

// ---- Validate question pack ----
/** @param {any} pack @param {string} packRelPath */
function validatePack(pack, packRelPath){
  if(!pack || typeof pack !== 'object'){
    pushError(packRelPath,'pack.json','Формат пакета не является объектом JSON');
    return { topicName: '', questions: [] };
  }
  if(!isNonEmptyString(pack.topic)) pushError(packRelPath,'pack.topic','Поле "topic" (название темы) обязательно');
  if(!Array.isArray(pack.questions)) pushError(packRelPath,'pack.questions','Поле "questions" должно быть массивом');

  const topicName = isNonEmptyString(pack.topic) ? pack.topic : (packRelPath);
  const questions = Array.isArray(pack.questions) ? pack.questions : [];
  return { topicName, questions };
}

// ---- Validate questions ----
/** @param {any[]} questions @param {string} topicName @param {string} packRelPath @param {Set<string>} globalIds */
function validateQuestions(questions, topicName, packRelPath, globalIds){
  if(questions.length === 0){
    pushWarn(`${topicName}`,'topic.thin','В теме пока нет вопросов');
  } else if(questions.length < 2){
    pushWarn(`${topicName}`,'topic.thin','Мало вопросов в теме (меньше 2)');
  }

  for (let i=0;i<questions.length;i++){
    const q = questions[i] || {};
    const pathId = `${topicName}/${q.id ?? '#'+i}`;

    if(!isNonEmptyString(q.id)){
      pushError(pathId,'id.missing','Отсутствует id');
    } else {
      if(globalIds.has(q.id)) pushError(pathId,'id.duplicate',`Повтор id вопроса: ${q.id}`);
      globalIds.add(q.id);
      if(/\s/.test(q.id)) pushWarn(pathId,'id.spaces','В id нежелательны пробелы');
    }

    if(!isNonEmptyString(q.stem)) pushError(pathId,'stem.invalid','Пустая формулировка');
    if(!Array.isArray(q.choices) || q.choices.length !== 8){
      pushError(pathId,'choices.count','Должно быть ровно 8 вариантов');
    } else {
      const set = new Set();
      for (let j=0;j<q.choices.length;j++){
        const c = q.choices[j];
        if(!isNonEmptyString(c)) pushError(pathId,`choices.${j}.empty`,`Пустой вариант ответа #${j+1}`);
        const key = String(c).trim();
        if(set.has(key)) pushError(pathId,'choices.duplicate',`Дубликат варианта "${key}" в восьмёрке`);
        set.add(key);
      }
    }
    if(typeof q.answer !== 'number' || q.answer < 0 || q.answer > 7){
      pushError(pathId,'answer.range','answer должен быть числом 0..7');
    }

    if(q.difficulty != null && ![1,2,3].includes(q.difficulty)){
      pushError(pathId,'difficulty.range','difficulty ∈ {1,2,3} либо отсутствует');
    }

    // эвристики (warnings)
    const text = (q.stem || '') + ' ' + (Array.isArray(q.choices) ? q.choices.join(' ') : '');
    const lpar = countOccurrences(text, '\\\\(');
    const rpar = countOccurrences(text, '\\\\)');
    if(lpar !== rpar){
      pushWarn(pathId,'mathjax.paren','Непарные \\\\( и \\\\) в формулах');
    }
    const dollars = countOccurrences(text, '$$');
    if(dollars % 2 !== 0){
      pushWarn(pathId,'mathjax.dollars','Непарное число $$ в формулах');
    }
    if(/<script[\s>]/i.test(text)){
      pushError(pathId,'html.forbidden','Запрещённый тег <script>');
    }
  }
}

// ---- Main ----
(async function main(){
  ok(`Reading ${path.relative(CWD, INDEX_FILE)} ...`);
  const { index, topicsMeta } = await validateIndex();
  if(!index){
    printAndExit();
    return;
  }
  ok(`OK (${topicsMeta.length} topics)`);

  const globalIds = new Set();
  for (const t of topicsMeta){
    const rel = path.relative(CWD, t.packPath);
    ok(`Checking ${t.id} (${rel}) ...`);
    if(!(await fileExists(t.packPath))) continue;
    const pack = await readJson(t.packPath).catch(e=>{
      pushError(`${t.id}`,'pack.read',`Не удалось прочитать пакет: ${e.message}`); return null;
    });
    if(!pack) continue;
    const { topicName, questions } = validatePack(pack, rel);
    validateQuestions(questions, topicName || t.id, rel, globalIds);
  }

  // Итог
  printAndExit();
})().catch(e => {
  err('Fatal: ' + e.stack || e);
  process.exit(2);
});

function printAndExit(){
  const summary = {
    errors: issues.length,
    warnings: warnings.length,
    issues,
    warningsList: warnings,
  };

  if(AS_JSON){
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const lines = [];
    if(issues.length){
      lines.push('\nErrors:');
      for (const it of issues) lines.push(`  • [${it.code}] ${it.path}: ${it.msg}`);
      if (issues.length >= MAX_ERRORS) lines.push(`  ...и ещё, ограничено --max-errors=${MAX_ERRORS}`);
    }
    if(warnings.length){
      lines.push('\nWarnings:');
      for (const it of warnings) lines.push(`  ! [${it.code}] ${it.path}: ${it.msg}`);
    }
    const head = `\nERRORS: ${issues.length}, WARNINGS: ${warnings.length}`;
    console.log(lines.length ? (head + '\n' + lines.join('\n')) : head);
    console.log(issues.length ? '✖ Validation failed' : '✔ Validation passed');
  }

  process.exit(issues.length ? 1 : 0);
}
