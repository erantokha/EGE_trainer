// W2.1' — partition 174 functions into core/student/teacher (correctness-first).
// Rule: core by default. A function is role-exclusive ONLY if its entire transitive caller-closure
// stays within that role's seed (i.e., NO shared/other-role function ever calls it). Over-coreing is
// safe (core loaded by both pages); a wrong role assignment would break the other page. READ-ONLY.
const fs = require('fs');
const path = require('path');
const A = __dirname;
const d = JSON.parse(fs.readFileSync(path.resolve(A, '../w2_0_artifacts/_extract.json'), 'utf8'));
const intents = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(A, '../w2_0_artifacts/intents.json'), 'utf8')); } catch { return {}; } })();
const names = d.fns.map((f) => f.name);
const consumers = d.consumers; // name -> [callers]
const calls = d.calls;         // name -> [callees]

// ---- explicit CORE (shared subsystem; never role-exclusive) ----
const CORE_RE = [
  /^\$\$?$/, /^pct$/, /^fmt/, /^safe/, /^esc$/, /^asset$/, /^isStudentLikeHome$/, /^studentLabel$/,
  /^applyDashboardHomeStats$/, /^applyTeacherPickingHomeStats$/, /^setHome/, /Home(Badge|Stats)/i,
  /^loadCatalog$/, /Accordion/i, /^renderSection/, /^renderTopic/, /^buildSection/, /Catalog/,
  /^refreshTotalSum$/, /^getTotalSelected$/, /Count\b/, /Sum\b/, /^updateProto/, /Proto/i,
  /^initAuthUI$/, /^refreshAuthUI$/, /^initAuthHeader$/, /Auth/i, /^getProtoModalEls$/,
  /save/i, /^startPick/, /^go[A-Z]/, /Selection/i, /^buildPickPayload/,
];
// ---- role SEEDS (strong role indicators) ----
const TEACHER_RE = [/teacher/i, /AddedTasks/i, /Resolve/i, /Manifest/i, /modalStats/i, /ModalStats/, /createHomework/i, /hwCreate/i, /HwCreate/, /Bucket/i, /Picked/i, /Preview/i, /^pickQuestionsVia/];
const STUDENT_RE = [/smart/i, /Smart/, /last10/i, /Last10/, /forecast/i, /Forecast/, /^updateSmartHint$/, /thermo/i];

const isCore0 = (n) => CORE_RE.some((re) => re.test(n));
const isTeacher0 = (n) => !isCore0(n) && TEACHER_RE.some((re) => re.test(n));
const isStudent0 = (n) => !isCore0(n) && !isTeacher0(n) && STUDENT_RE.some((re) => re.test(n));

// closure: a function joins roleClosure iff it's a seed OR ALL its callers are already in roleClosure
// (exclusive — no shared/other caller). Iterate to fixpoint.
function exclusiveClosure(seedFn) {
  let set = new Set(names.filter(seedFn));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of names) {
      if (set.has(n)) continue;
      if (isCore0(n)) continue;           // explicit-core never role-exclusive
      const callers = consumers[n] || [];
      if (callers.length === 0) continue; // 0 named callers (top-level/handler) → treat as core (entry wires both)
      if (callers.every((c) => set.has(c))) { set.add(n); changed = true; }
    }
  }
  return set;
}
const teacherSet = exclusiveClosure(isTeacher0);
const studentSet = exclusiveClosure(isStudent0);
// conflicts (in both) → core
for (const n of [...teacherSet]) if (studentSet.has(n)) { teacherSet.delete(n); studentSet.delete(n); }

const role = {};
for (const n of names) role[n] = teacherSet.has(n) ? 'teacher' : studentSet.has(n) ? 'student' : 'core';

// ---- VALIDATE: no student<->teacher direct calls (must route through core) ----
const violations = [];
for (const n of names) {
  for (const callee of (calls[n] || [])) {
    if (role[n] === 'student' && role[callee] === 'teacher') violations.push(`${n}(student) -> ${callee}(teacher)`);
    if (role[n] === 'teacher' && role[callee] === 'student') violations.push(`${n}(teacher) -> ${callee}(student)`);
    if (role[n] === 'core' && role[callee] !== 'core') violations.push(`CORE ${n} -> ${callee}(${role[callee]}) [core must not call role module]`);
  }
}

// ---- exports core must provide (core funcs called by student/teacher) ----
const coreExports = new Set();
for (const n of names) if (role[n] !== 'core') for (const callee of (calls[n] || [])) if (role[callee] === 'core') coreExports.add(callee);

const counts = { core: 0, student: 0, teacher: 0 };
for (const n of names) counts[role[n]]++;

// write split_log.md
const log = [];
log.push('# W2.1\' split assignment (assign.cjs) — correctness-first partition', '');
log.push(`counts: core=${counts.core}  student=${counts.student}  teacher=${counts.teacher}  (total ${names.length})`);
log.push(`cross-role / core->role VIOLATIONS: ${violations.length}`);
violations.slice(0, 40).forEach((v) => log.push('  ✗ ' + v));
log.push('', `core exports needed (called by role modules): ${coreExports.size}`);
log.push('  ' + [...coreExports].sort().join(', '));
log.push('', '## STUDENT functions', ...[...studentSet].sort().map((n) => `  ${n} — ${intents[n] || ''}`));
log.push('', '## TEACHER functions', ...[...teacherSet].sort().map((n) => `  ${n} — ${intents[n] || ''}`));
fs.writeFileSync(path.join(A, 'split_log.md'), log.join('\n') + '\n');
fs.writeFileSync(path.join(A, '_assign.json'), JSON.stringify({ role, coreExports: [...coreExports] }, null, 0));

console.log(`counts: core=${counts.core} student=${counts.student} teacher=${counts.teacher}`);
console.log(`VIOLATIONS (must be 0): ${violations.length}`);
violations.slice(0, 30).forEach((v) => console.log('  ' + v));
console.log(`core exports: ${coreExports.size}`);
