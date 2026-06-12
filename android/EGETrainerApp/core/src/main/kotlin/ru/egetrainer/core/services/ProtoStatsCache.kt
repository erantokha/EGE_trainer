package ru.egetrainer.core.services

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ru.egetrainer.core.models.ProtoLast3Stat
import ru.egetrainer.core.models.QuestionStat

/**
 * Кэш статистики прототипов с прогревом — порт WFX1/WMB3 веба
 * (_TEACHER_MODAL_STATS_CACHE + warmTeacherModalStatsForStudent):
 * модалка рендерит бейджи сразу из кэша, прогрев идёт при раскрытии секции.
 * TTL 60 с — как TEACHER_PROTO_WARMUP_TTL_MS.
 *
 * Зависимости заданы лямбдами (идиоматическое отклонение от iOS-actor,
 * зафиксировано: позволяет юнит-тестировать дедупликацию без сети).
 */
class ProtoStatsCache(
    private val protoCardsProvider: suspend (topicId: String) -> List<ContentService.ProtoCard>,
    private val teacherLast3: suspend (studentId: String, unicIds: List<String>) -> List<ProtoLast3Stat>,
    private val teacherQuestionStats: suspend (studentId: String, questionIds: List<String>) -> List<QuestionStat>,
    private val selfLast3: suspend (unicIds: List<String>) -> List<ProtoLast3Stat>,
    private val clock: () -> Long = System::currentTimeMillis,
    private val ttlMs: Long = 60_000,
) {
    companion object {
        /** Боевой конструктор поверх TeacherService/ContentService. */
        fun create(teacher: TeacherService, content: ContentService): ProtoStatsCache =
            ProtoStatsCache(
                protoCardsProvider = { topicId ->
                    content.topicEntry(topicId)?.let { content.protoCards(it) } ?: emptyList()
                },
                teacherLast3 = { studentId, unicIds -> teacher.protoLast3(studentId, unicIds) },
                teacherQuestionStats = { studentId, qids -> teacher.questionStats(studentId, qids) },
                selfLast3 = { unicIds -> teacher.protoLast3Self(unicIds) },
            )
    }

    private data class Key(val scope: String, val topicId: String)
    private data class Entry(val rows: Map<String, ProtoLast3Stat>, val atMs: Long)

    private val mutex = Mutex()
    private val cache = mutableMapOf<Key, Entry>()
    private val inFlight = mutableSetOf<Key>()

    suspend fun get(scope: String, topicId: String): Map<String, ProtoLast3Stat>? =
        mutex.withLock {
            val hit = cache[Key(scope, topicId)] ?: return@withLock null
            if (clock() - hit.atMs < ttlMs) hit.rows else null
        }

    suspend fun put(scope: String, topicId: String, rows: Map<String, ProtoLast3Stat>) {
        mutex.withLock { cache[Key(scope, topicId)] = Entry(rows, clock()) }
    }

    /**
     * Загрузка статистики темы (с дедупликацией параллельных прогревов).
     * teacher: proto_last3 (X/3) + question_stats c РЕАЛЬНЫМИ p_question_ids (дата);
     * self: всё из proto_last3_for_self_v1.
     */
    suspend fun load(studentId: String?, topicId: String): Map<String, ProtoLast3Stat> {
        val scope = studentId ?: "self"
        val key = Key(scope, topicId)

        var owner = false
        mutex.withLock {
            cache[key]?.let { if (clock() - it.atMs < ttlMs) return it.rows }
            if (!inFlight.contains(key)) {
                inFlight.add(key)
                owner = true
            }
        }
        // сетевая работа — строго ВНЕ лока (Mutex нереентерабелен)
        if (owner) return loadOwning(key, studentId, topicId)

        // другой прогрев уже идёт — подождём его результат
        // (поллинг дешевле подписок — как в iOS-actor)
        repeat(50) {
            delay(100)
            mutex.withLock {
                cache[key]?.let { if (clock() - it.atMs < ttlMs) return it.rows }
                if (!inFlight.contains(key)) return cache[key]?.rows ?: emptyMap()
            }
        }
        return mutex.withLock { cache[key]?.rows ?: emptyMap() }
    }

    private suspend fun loadOwning(
        key: Key,
        studentId: String?,
        topicId: String,
    ): Map<String, ProtoLast3Stat> {
        try {
            val cards = runCatching { protoCardsProvider(topicId) }.getOrDefault(emptyList())
            if (cards.isEmpty()) return emptyMap()
            val unicIds = cards.map { it.id }

            val map = mutableMapOf<String, ProtoLast3Stat>()
            if (studentId != null) {
                runCatching { teacherLast3(studentId, unicIds) }.getOrNull()?.forEach { r ->
                    map[r.unicId] = r
                }
                // дата — из question_stats по ВСЕМ id вариантов (как веб; не пустой список!)
                val allIds = cards.flatMap { it.protoIds }
                runCatching { teacherQuestionStats(studentId, allIds) }.getOrNull()?.forEach { q ->
                    val at = q.lastAttemptAt ?: return@forEach
                    val base = ContentService.baseId(q.questionId)
                    val s = map[base] ?: ProtoLast3Stat(unicId = base)
                    val newer = s.lastAttemptAt?.let { maxOf(it, at) } ?: at
                    map[base] = s.copy(lastAttemptAt = newer)
                }
            } else {
                runCatching { selfLast3(unicIds) }.getOrNull()?.forEach { r ->
                    map[r.unicId] = r
                }
            }
            mutex.withLock { cache[key] = Entry(map, clock()) }
            return map
        } finally {
            mutex.withLock { inFlight.remove(key) }
        }
    }
}
