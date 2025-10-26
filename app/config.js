// app/config.js
export const CONFIG = {
  app: {
    queueKey: 'attempts_queue_v1',
    studentKey: 'student_v1',
  },
  supabase: {
    enabled: true,
    url: 'https://knhozdhvjhcovyjbjfji.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuaG96ZGh2amhjb3Z5amJqZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzA2NTYsImV4cCI6MjA3NzAwNjY1Nn0.RSwb6_1DRqN1_DVCikxKyJ144UlQbG78MZVq-vQedPg',
    table: 'attempts',
    flatViewName: 'attempts_flat'
  },
  admin: {
    charts: true,           // показывать графики в админке
    defaultPageSize: 25,    // размер страницы по умолчанию
    maxExportRows: 1000     // максимум строк на экспорт
  }
};

// Поддержка window.__CONFIG__ для override без редактирования файла
(function applyRuntimeOverrides(){
  const src = (globalThis && globalThis.__CONFIG__) || null;
  if(!src || typeof src !== 'object') return;
  function merge(dst, src){
    Object.keys(src).forEach(k => {
      if(src[k] && typeof src[k]==='object' && !Array.isArray(src[k])){
        if(!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], src[k]);
      }else{
        dst[k] = src[k];
      }
    });
  }
  merge(CONFIG, src);
})();
