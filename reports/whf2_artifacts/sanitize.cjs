// WHF2 §9.4 — sanitize HAR + log artifacts in place.
// Redacts: JWTs, access_token/refresh_token, password, email addresses,
// Authorization/apikey/Cookie header values, code_verifier/pkce.
const fs = require('fs');
const path = require('path');

const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function scrub(text) {
  let s = text;
  s = s.replace(JWT, '***JWT***');
  // JSON value forms
  s = s.replace(/("(?:access_token|refresh_token|provider_token|provider_refresh_token)"\s*:\s*)"[^"]*"/g, '$1"***REDACTED***"');
  s = s.replace(/("password"\s*:\s*)"[^"]*"/g, '$1"***REDACTED***"');
  s = s.replace(/("(?:code_verifier|code|pkce[A-Za-z_]*)"\s*:\s*)"[^"]*"/g, '$1"***REDACTED***"');
  // urlencoded password=...&
  s = s.replace(/(password=)[^&"\s]+/gi, '$1***REDACTED***');
  // emails (after JWT/json) — leave example.com as-is for readability
  s = s.replace(EMAIL, (m) => (/@example\.com$/i.test(m) ? m : '<email_redacted>'));
  return s;
}

function scrubHarHeaders(har) {
  try {
    const obj = JSON.parse(har);
    for (const e of obj?.log?.entries || []) {
      for (const h of e?.request?.headers || []) {
        if (/^(authorization|apikey|cookie|x-client-info)$/i.test(h.name)) h.value = '***REDACTED***';
      }
      for (const h of e?.response?.headers || []) {
        if (/^set-cookie$/i.test(h.name)) h.value = '***REDACTED***';
      }
    }
    return JSON.stringify(obj);
  } catch (_) {
    return har; // not JSON-parseable as expected; text scrub still applied below
  }
}

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /\.(har|log\.txt)$/.test(f));
const report = [];
for (const f of files) {
  const fp = path.join(dir, f);
  let txt = fs.readFileSync(fp, 'utf8');
  const before = txt.length;
  if (f.endsWith('.har')) txt = scrubHarHeaders(txt);
  txt = scrub(txt);
  // verification: any JWT / plaintext-looking secrets left?
  const leftoverJwt = (txt.match(JWT) || []).length;
  fs.writeFileSync(fp, txt);
  report.push(`${f}: ${before}B → ${txt.length}B, residual JWT matches=${leftoverJwt}`);
}
console.log(report.join('\n'));
console.log('done');
