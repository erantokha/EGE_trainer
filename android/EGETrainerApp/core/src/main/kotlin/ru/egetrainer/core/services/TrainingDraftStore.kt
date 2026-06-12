package ru.egetrainer.core.services

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import ru.egetrainer.core.AppJson
import ru.egetrainer.core.models.QuestionRef

/** Простое строковое KV-хранилище (в :app — SharedPreferences, в тестах — память). */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

class InMemoryKeyValueStore : KeyValueStore {
    private val map = mutableMapOf<String, String>()
    override fun get(key: String): String? = map[key]
    override fun put(key: String, value: String) { map[key] = value }
    override fun remove(key: String) { map.remove(key) }
}

/**
 * Черновик незавершённой тренировки — эквивалент tasks_session_v1 (trainer.js)
 * и TrainingDraftStore.swift: набор замороженных refs + введённые ответы.
 * TTL 12 ч (как REPORT_MAX_AGE_MS веба). Позволяет продолжить тренировку
 * после перезапуска приложения; Android дополнительно хранит ответы.
 */
class TrainingDraftStore(
    private val store: KeyValueStore,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    @Serializable
    data class Draft(
        val refs: List<QuestionRef>,
        val answers: Map<String, String> = emptyMap(), // "topicId|questionId" -> ответ
        val mode: String = "list",                     // "list" | "test"
        val shuffle: Boolean = false,
        @SerialName("saved_at_ms") val savedAtMs: Long,
    )

    companion object {
        private const val KEY = "training_draft_v1"
        private const val MAX_AGE_MS: Long = 12 * 3600 * 1000 // как REPORT_MAX_AGE_MS веба
    }

    fun save(draft: Draft) {
        runCatching {
            store.put(KEY, AppJson.encodeToString(Draft.serializer(), draft))
        }
    }

    fun load(): Draft? {
        val raw = store.get(KEY) ?: return null
        val draft = runCatching {
            AppJson.decodeFromString(Draft.serializer(), raw)
        }.getOrNull() ?: return null
        if (clock() - draft.savedAtMs > MAX_AGE_MS || draft.refs.isEmpty()) {
            clear()
            return null
        }
        return draft
    }

    fun clear() {
        store.remove(KEY)
    }
}
