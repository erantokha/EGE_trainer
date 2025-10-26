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
    table: 'attempts'
  }
};
