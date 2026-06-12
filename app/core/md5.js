/**
 * app/core/md5.js — vendored MD5 (RFC 1321), hex-выход.
 * WPS.1: нужен для побитового паритета с Postgres md5() в сортировках
 * resolve-подбора (см. docs/navigation/picking_resolve_semantics_spec.md §7–8).
 * Вход — строка (кодируется в UTF-8, как text в Postgres/UTF8). Без eval, без зависимостей.
 * Таблицы констант K/S захардкожены (никакого Math.sin на рантайме).
 */

const K = new Int32Array([
  -680876936, -389564586, 606105819, -1044525330,
  -176418897, 1200080426, -1473231341, -45705983,
  1770035416, -1958414417, -42063, -1990404162,
  1804603682, -40341101, -1502002290, 1236535329,
  -165796510, -1069501632, 643717713, -373897302,
  -701558691, 38016083, -660478335, -405537848,
  568446438, -1019803690, -187363961, 1163531501,
  -1444681467, -51403784, 1735328473, -1926607734,
  -378558, -2022574463, 1839030562, -35309556,
  -1530992060, 1272893353, -155497632, -1094730640,
  681279174, -358537222, -722521979, 76029189,
  -640364487, -421815835, 530742520, -995338651,
  -198630844, 1126891415, -1416354905, -57434055,
  1700485571, -1894986606, -1051523, -2054922799,
  1873313359, -30611744, -1560198380, 1309151649,
  -145523070, -1120210379, 718787259, -343485551,
]);

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const HEX = '0123456789abcdef';

function rotl(x, c) {
  return (x << c) | (x >>> (32 - c));
}

/**
 * md5Hex(str) → 32-символьная hex-строка (lowercase), идентичная md5(str) в Postgres.
 */
export function md5Hex(input) {
  const bytes = new TextEncoder().encode(String(input));
  const len = bytes.length;

  // padding: 0x80, нули, 8 байт длины (бит, little-endian)
  const paddedLen = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const bitLen = len * 8;
  // длина до 2^53 бит — пишем low 32 бита и high 21 бит
  const dv = new DataView(buf.buffer);
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;

  const M = new Int32Array(16);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);

    let A = a0; let B = b0; let C = c0; let D = d0;

    for (let i = 0; i < 64; i++) {
      let F; let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) & 15;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) & 15;
      }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[i] + M[g]) | 0, S[i])) | 0;
      A = tmp;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  let out = '';
  for (const word of [a0, b0, c0, d0]) {
    for (let i = 0; i < 4; i++) {
      const byte = (word >>> (i * 8)) & 0xff;
      out += HEX[byte >> 4] + HEX[byte & 15];
    }
  }
  return out;
}
