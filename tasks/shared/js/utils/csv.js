
export function toCsv(rows){
  const cols = Object.keys(rows[0] || {id:1});
  const esc = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  return [ cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(',')) ].join('\n');
}
