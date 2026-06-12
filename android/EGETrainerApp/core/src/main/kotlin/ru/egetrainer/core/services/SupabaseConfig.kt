package ru.egetrainer.core.services

/**
 * Конфигурация бэкенда. Зеркало app/config.js веб-клиента и
 * SupabaseConfig.swift iOS-приложения.
 *
 * Здесь ТОЛЬКО публичные значения: URL прокси и anon-ключ Supabase —
 * те же, что вшиты в клиентский JS сайта. Никаких service_role / секретов.
 */
object SupabaseConfig {
    /** Прокси Supabase (VPS Timeweb, РФ) — основной URL, который использует веб-клиент.
     *  Откаты (если прокси недоступен): https://knhozdhvjhcovyjbjfji.supabase.co */
    const val BASE_URL: String = "https://api.ege-trainer.ru"

    /** Публичный anon-ключ (role=anon) — тот же, что в app/config.js сайта. */
    const val ANON_KEY: String =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuaG96ZGh2amhjb3Z5amJqZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzA2NTYsImV4cCI6MjA3NzAwNjY1Nn0.RSwb6_1DRqN1_DVCikxKyJ144UlQbG78MZVq-vQedPg"

    /** Продакшен-сайт — источник контента задач (content/tasks/<topic>.json, картинки, видео-карта). */
    const val CONTENT_BASE_URL: String = "https://ege-trainer.ru"

    /** База для shareable-ссылок на ДЗ (как createHomeworkLinkUrl в вебе). */
    const val SITE_BASE_URL: String = "https://ege-trainer.ru"
}
