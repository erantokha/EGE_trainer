// app/config.js
export const CONFIG = {
  app: {
    queueKey: 'attempts_queue_v1',
    studentKey: 'student_v1',
  },
  supabase: {
    enabled: true,
    url: 'https://yifkowufwjehwwnrnhvz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmtvd3Vmd2plaHd3bnJuaHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDAzODksImV4cCI6MjA3NjgxNjM4OX0.EG2Bj3892hUBXjoDc4LYFtz28Q7_uDtGd-UJXOmcmac',
    table: 'attempts'
  }
};
