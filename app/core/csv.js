// app/core/csv.js
export function rowsToCsv(rows){
  if(!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const head = headers.join(',');
  const lines = [head];
  rows.forEach(r => {
    const vals = headers.map(h => csvCell(r[h]));
    lines.push(vals.join(','));
  });
  return lines.join('\n');
}

function csvCell(v){
  const s = String(v==null?'':v).replace(/"/g,'""');
  return `"${s}"`;
}

export function downloadText(name, content, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type: mime||'text/plain'}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
