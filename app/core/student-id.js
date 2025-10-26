
const KEY = 'student_v1';

export function getStudent(){
  try{ return JSON.parse(localStorage.getItem(KEY) || 'null');}catch(e){ return null;}
}

export function setStudent(student){
  localStorage.setItem(KEY, JSON.stringify(student));
  return student;
}

export function resetStudent(){
  localStorage.removeItem(KEY);
}

export function ensureStudentOrRedirect(baseHref='../'){
  const s = getStudent();
  if(!s){ location.href = baseHref; }
  return s;
}

export function uuidv4(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  const rnd = crypto.getRandomValues(new Uint8Array(16));
  rnd[6] = (rnd[6] & 0x0f) | 0x40;
  rnd[8] = (rnd[8] & 0x3f) | 0x80;
  const h = [...rnd].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
