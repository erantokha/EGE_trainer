// app/core/safe_expr.mjs
// Безопасное вычисление простых математических выражений без eval/Function-конструктора.
// Поддержка: числа, переменные, + - * / ^, унарные +/- , скобки, функции abs/sqrt/min/max/pow.
//
// ВАЖНО: здесь намеренно строгая грамматика. Любые неожиданные символы/токены — ошибка.

const ALLOWED_FUNCS = Object.freeze({
  abs: { arity: 1, fn: Math.abs },
  sqrt: { arity: 1, fn: Math.sqrt },
  min: { arity: 2, fn: Math.min },
  max: { arity: 2, fn: Math.max },
  pow: { arity: 2, fn: Math.pow },
});

const PREC = Object.freeze({
  'u+': 5,
  'u-': 5,
  '^': 4,
  '*': 3,
  '/': 3,
  '+': 2,
  '-': 2,
});

const RIGHT_ASSOC = new Set(['^', 'u+', 'u-']);

const CACHE = new Map(); // expr -> rpn

function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}
function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}
function isAlpha(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}
function isIdentStart(ch) {
  return isAlpha(ch) || ch === '_';
}
function isIdent(ch) {
  return isIdentStart(ch) || isDigit(ch);
}

function tokenize(expr) {
  const s = String(expr ?? '');
  const out = [];
  let i = 0;

  const push = (t) => out.push(t);

  while (i < s.length) {
    const ch = s[i];

    if (isSpace(ch)) {
      i++;
      continue;
    }

    // number: 12, 12.3, .5, 1e-3
    if (isDigit(ch) || ch === '.') {
      let j = i;

      // leading dot must be followed by digit
      if (s[j] === '.' && !isDigit(s[j + 1] || '')) {
        throw new Error(`Недопустимый символ '.' (ожидалось число) на позиции ${j}`);
      }

      // int part
      while (isDigit(s[j] || '')) j++;

      // frac
      if (s[j] === '.') {
        j++;
        while (isDigit(s[j] || '')) j++;
      }

      // exponent
      if (s[j] === 'e' || s[j] === 'E') {
        const ePos = j;
        j++;
        if (s[j] === '+' || s[j] === '-') j++;
        if (!isDigit(s[j] || '')) {
          throw new Error(`Неверная экспонента в числе на позиции ${ePos}`);
        }
        while (isDigit(s[j] || '')) j++;
      }

      const raw = s.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        throw new Error(`Некорректное число "${raw}"`);
      }
      push({ type: 'num', value: v });
      i = j;
      continue;
    }

    // identifier
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (isIdent(s[j] || '')) j++;
      const name = s.slice(i, j);
      push({ type: 'ident', value: name });
      i = j;
      continue;
    }

    // symbols/operators
    if ('+-*/^(),'.includes(ch)) {
      push({ type: 'sym', value: ch });
      i++;
      continue;
    }

    throw new Error(`Недопустимый символ "${ch}" на позиции ${i}`);
  }

  return out;
}

function shouldPopOp(opOnStack, incomingOp) {
  const p1 = PREC[opOnStack];
  const p2 = PREC[incomingOp];
  if (p1 == null || p2 == null) return false;

  if (RIGHT_ASSOC.has(incomingOp)) {
    // pop while stack precedence > incoming
    return p1 > p2;
  }
  // left associative: pop while stack precedence >= incoming
  return p1 >= p2;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];

  // prev token kind for unary detection
  // null | 'value' | 'op' | '(' | ',' 
  let prevKind = null;

  const peek = () => stack[stack.length - 1];

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    const next = tokens[idx + 1] || null;

    if (t.type === 'num') {
      output.push(t);
      prevKind = 'value';
      continue;
    }

    if (t.type === 'ident') {
      // function call if followed by '('
      if (next && next.type === 'sym' && next.value === '(') {
        const fn = ALLOWED_FUNCS[t.value];
        if (!fn) {
          throw new Error(`Неизвестная функция "${t.value}"`);
        }
        stack.push({ type: 'func', value: t.value });
        prevKind = 'value'; // treat as value before '('? not important
      } else {
        output.push({ type: 'var', value: t.value });
        prevKind = 'value';
      }
      continue;
    }

    if (t.type === 'sym') {
      const s = t.value;

      if (s === '(') {
        stack.push({ type: 'sym', value: '(' });
        prevKind = '(';
        continue;
      }

      if (s === ')') {
        while (stack.length && !(peek().type === 'sym' && peek().value === '(')) {
          output.push(stack.pop());
        }
        if (!stack.length) {
          throw new Error('Несогласованные скобки: лишняя ")"');
        }
        stack.pop(); // pop '('

        // if top is function, pop it too
        if (stack.length && peek().type === 'func') {
          output.push(stack.pop());
        }

        prevKind = 'value';
        continue;
      }

      if (s === ',') {
        // argument separator: pop until '('
        while (stack.length && !(peek().type === 'sym' && peek().value === '(')) {
          output.push(stack.pop());
        }
        if (!stack.length) {
          throw new Error('Запятая вне вызова функции');
        }
        prevKind = ',';
        continue;
      }

      // operators
      if ('+-*/^'.includes(s)) {
        let op = s;
        const isUnary = prevKind === null || prevKind === 'op' || prevKind === '(' || prevKind === ',';
        if (isUnary && (op === '+' || op === '-')) {
          op = op === '+' ? 'u+' : 'u-';
        }

        while (stack.length) {
          const top = peek();
          if (top.type === 'op' && shouldPopOp(top.value, op)) {
            output.push(stack.pop());
          } else {
            break;
          }
        }

        stack.push({ type: 'op', value: op });
        prevKind = 'op';
        continue;
      }

      throw new Error(`Неожиданный символ "${s}"`);
    }

    throw new Error('Неожиданный токен');
  }

  while (stack.length) {
    const t = stack.pop();
    if (t.type === 'sym' && t.value === '(') {
      throw new Error('Несогласованные скобки: лишняя "("');
    }
    output.push(t);
  }

  return output;
}

function applyBinary(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new Error('Деление на 0');
      return a / b;
    case '^': return Math.pow(a, b);
    default:
      throw new Error(`Неизвестный оператор "${op}"`);
  }
}

function evalRpn(rpn, params) {
  const st = [];
  const pop1 = () => {
    if (!st.length) throw new Error('Некорректное выражение: не хватает операндов');
    return st.pop();
  };

  for (const t of rpn) {
    if (t.type === 'num') {
      st.push(t.value);
      continue;
    }

    if (t.type === 'var') {
      if (params == null || !(t.value in params)) {
        throw new Error(`Неизвестная переменная "${t.value}"`);
      }
      const v = Number(params[t.value]);
      if (!Number.isFinite(v)) {
        throw new Error(`Некорректное значение переменной "${t.value}"`);
      }
      st.push(v);
      continue;
    }

    if (t.type === 'op') {
      if (t.value === 'u+' || t.value === 'u-') {
        const a = pop1();
        st.push(t.value === 'u-' ? -a : +a);
        continue;
      }
      const b = pop1();
      const a = pop1();
      const res = applyBinary(t.value, a, b);
      if (!Number.isFinite(res)) throw new Error('Результат не является конечным числом');
      st.push(res);
      continue;
    }

    if (t.type === 'func') {
      const meta = ALLOWED_FUNCS[t.value];
      if (!meta) throw new Error(`Неизвестная функция "${t.value}"`);
      const args = [];
      for (let i = 0; i < meta.arity; i++) args.push(pop1());
      args.reverse();
      const res = meta.fn(...args);
      if (!Number.isFinite(res)) throw new Error('Результат функции не является конечным числом');
      st.push(res);
      continue;
    }

    throw new Error('Неожиданный токен при вычислении');
  }

  if (st.length !== 1) {
    throw new Error('Некорректное выражение');
  }
  const v = st[0];
  if (!Number.isFinite(v)) throw new Error('Результат не является конечным числом');
  return v;
}

export function safeEvalExpr(expr, params = {}) {
  const key = String(expr ?? '').trim();
  if (!key) throw new Error('Пустое выражение');

  let rpn = CACHE.get(key);
  if (!rpn) {
    const tokens = tokenize(key);
    rpn = toRpn(tokens);
    CACHE.set(key, rpn);
  }
  return evalRpn(rpn, params);
}
