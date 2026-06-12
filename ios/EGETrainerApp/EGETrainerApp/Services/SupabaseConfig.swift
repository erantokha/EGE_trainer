import Foundation

/// Конфигурация бэкенда. Зеркало app/config.js веб-клиента.
///
/// Здесь ТОЛЬКО публичные значения: URL прокси и anon-ключ Supabase —
/// те же, что вшиты в клиентский JS сайта. Никаких service_role / секретов.
enum SupabaseConfig {
    /// Прокси Supabase (VPS Timeweb, РФ) — основной URL, который использует веб-клиент.
    /// Откаты (если прокси недоступен): https://knhozdhvjhcovyjbjfji.supabase.co
    static let baseURL = URL(string: "https://api.ege-trainer.ru")!

    /// Публичный anon-ключ (role=anon) — тот же, что в app/config.js сайта.
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuaG96ZGh2amhjb3Z5amJqZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzA2NTYsImV4cCI6MjA3NzAwNjY1Nn0.RSwb6_1DRqN1_DVCikxKyJ144UlQbG78MZVq-vQedPg"

    /// Продакшен-сайт — источник контента задач (content/tasks/*.json, картинки, видео-карта).
    static let contentBaseURL = URL(string: "https://ege-trainer.ru")!

    /// База для shareable-ссылок на ДЗ (как createHomeworkLinkUrl в вебе).
    static let siteBaseURL = URL(string: "https://ege-trainer.ru")!
}
