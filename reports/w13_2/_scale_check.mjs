// W13.2a regression-gate: часть 1 (p≤12) scoring байт-в-байт + новые строки 13-32.
import { secondaryFromPrimary, secondaryFromPrimaryExact, thermoColorByPrimary } from '../../tasks/picker_stats.js';

const OLD_0_12 = [0,6,11,17,22,27,34,40,46,52,58,64,70];
const NEW_13_32 = {13:72,14:74,15:76,16:78,17:80,18:82,19:84,20:86,21:88,22:90,23:92,24:94,25:95,26:96,27:97,28:98,29:99,30:100,31:100,32:100};
let fail = 0;
const eq = (a,b,m) => { if (a!==b) { console.log(`FAIL ${m}: got ${a}, want ${b}`); fail++; } };

// часть 1: secondaryFromPrimary(0..12) === старая таблица (регресс-гейт)
for (let k=0;k<=12;k++) eq(secondaryFromPrimary(k), OLD_0_12[k], `secondaryFromPrimary(${k})`);
// часть 1: secondaryFromPrimaryExact на целых === таблица
for (let k=0;k<=12;k++) eq(secondaryFromPrimaryExact(k), OLD_0_12[k], `Exact(${k})`);
// часть 1: дробная интерполяция неизменна (11.5 → 64+0.5*(70-64)=67)
eq(secondaryFromPrimaryExact(11.5), 67, 'Exact(11.5)');
eq(secondaryFromPrimaryExact(8.5), 49, 'Exact(8.5)'); // 46+0.5*(52-46)
// часть 1: цвета термометра (0..12) неизменны
const COL = (p) => thermoColorByPrimary(p);
[['0','red'],[4,'red'],[5,'yellow'],[7,'yellow'],[8,'lime'],[10,'lime'],[11,'green'],[12,'green']]
  .forEach(([p,c]) => eq(COL(Number(p)), c, `color(${p})`));

// новые строки 13-32 (часть 2)
for (const k of Object.keys(NEW_13_32)) eq(secondaryFromPrimary(Number(k)), NEW_13_32[k], `new secondaryFromPrimary(${k})`);
// плато вершины
eq(secondaryFromPrimaryExact(30), 100, 'Exact(30)');
eq(secondaryFromPrimaryExact(32), 100, 'Exact(32)');
// клампы части 1 сняты: p=20 больше не уходит в 70
eq(secondaryFromPrimary(20), 86, 'no-clamp(20)');

console.log(fail ? `\n${fail} FAIL` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: часть 1 идентична, строки 13-32 корректны');
process.exit(fail ? 1 : 0);
