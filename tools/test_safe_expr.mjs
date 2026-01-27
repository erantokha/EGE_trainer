// tools/test_safe_expr.mjs
import assert from 'node:assert/strict';
import { safeEvalExpr } from '../app/core/safe_expr.mjs';

function eq(a, b, eps = 1e-12) {
  assert.ok(Number.isFinite(a), `not finite: ${a}`);
  assert.ok(Number.isFinite(b), `not finite: ${b}`);
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

eq(safeEvalExpr('2+2*2'), 6);
eq(safeEvalExpr('(2+2)*2'), 8);
eq(safeEvalExpr('-3+5'), 2);
eq(safeEvalExpr('+3+5'), 8);
eq(safeEvalExpr('sqrt(9)+abs(-1)'), 4);
eq(safeEvalExpr('a*2+b', { a: 3, b: 4 }), 10);
eq(safeEvalExpr('2^3'), 8);
eq(safeEvalExpr('pow(2,3)'), 8);
eq(safeEvalExpr('min(5,2)+max(1,4)'), 6);

assert.throws(() => safeEvalExpr('Math.sqrt(9)'), /Недопустимый символ/);
assert.throws(() => safeEvalExpr('fetch(1)'), /Неизвестная функция/);
assert.throws(() => safeEvalExpr('a/0', { a: 1 }), /Деление на 0/);
assert.throws(() => safeEvalExpr('a+(b', { a: 1, b: 2 }), /скобки/);

console.log('safe_expr ok');
