package ru.egetrainer.core.services

import ru.egetrainer.core.models.CatalogEntry
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.ResolvedQuestion
import ru.egetrainer.core.models.RunQuestion
import kotlin.random.Random

/**
 * Подбор задач на главной ученика — порт student-веток picker.js
 * (StudentPickEngine.swift):
 * - без фильтра: клиентский random со спредом по базовым прототипам
 *   (randomQuestions / randomQuestionsInSection с ротацией);
 * - с фильтром: self-гейт teacher_picking_resolve_batch_v1 ОДНИМ батчем
 *   со всеми бакетами (урок iOS: 12 последовательных RPC = 11,3 с, один
 *   батч = 0,9 с) c over-fetch (want + 6, cap 40) и клиентской
 *   двухпроходной ротацией pickByProtoRotation поверх атрибуции
 *   scope_kind/scope_id ответа.
 */
object StudentPickEngine {

    /** Выбранный прототип в модалке: baseId -> тема + количество. */
    data class ProtoPick(val topicId: String, val count: Int)

    data class Selection(
        val topicCounts: Map<String, Int> = emptyMap(),    // CHOICE_TOPICS
        val sectionCounts: Map<String, Int> = emptyMap(),  // CHOICE_SECTIONS
        val protoCounts: Map<String, ProtoPick> = emptyMap(), // CHOICE_PROTOS
    ) {
        val total: Int
            get() = topicCounts.values.sum() +
                sectionCounts.values.sum() +
                protoCounts.values.sumOf { it.count }
    }

    private data class Bucket(val kind: String, val id: String, val want: Int)

    suspend fun pick(
        selection: Selection,
        sections: List<Pair<CatalogEntry, List<CatalogEntry>>>,
        filterId: String?,
        student: StudentService,
        content: ContentService,
    ): List<RunQuestion> {
        if (!filterId.isNullOrEmpty()) {
            return pickFiltered(selection, sections, filterId, student, content)
        }
        return pickClient(selection, sections, content)
    }

    // MARK: Без фильтра (клиентский random + спред)

    private suspend fun pickClient(
        selection: Selection,
        sections: List<Pair<CatalogEntry, List<CatalogEntry>>>,
        content: ContentService,
    ): List<RunQuestion> {
        val out = mutableListOf<RunQuestion>()
        val used = mutableSetOf<String>()
        // proto-бакеты первыми (scope-приоритет proto > topic > section)
        for ((baseId, pick) in selection.protoCounts.entries.sortedBy { it.key }) {
            val topic = runCatching { content.topicEntry(pick.topicId) }.getOrNull() ?: continue
            val qs = runCatching {
                content.randomQuestionsForProto(topic, baseId, pick.count, used)
            }.getOrDefault(emptyList())
            qs.forEach { used.add(it.questionId) }
            out.addAll(qs)
        }
        for ((section, topics) in sections) {
            for (topic in topics) {
                val n = selection.topicCounts[topic.id] ?: 0
                if (n <= 0) continue
                val qs = runCatching {
                    content.randomQuestions(topic, n, used)
                }.getOrDefault(emptyList())
                qs.forEach { used.add(it.questionId) }
                out.addAll(qs)
            }
            val secN = selection.sectionCounts[section.id] ?: 0
            if (secN > 0) {
                val qs = runCatching {
                    content.randomQuestionsInSection(topics, secN, used)
                }.getOrDefault(emptyList())
                qs.forEach { used.add(it.questionId) }
                out.addAll(qs)
            }
        }
        return out
    }

    // MARK: С фильтром (self-гейт resolve одним батчем + ротация)

    private suspend fun pickFiltered(
        selection: Selection,
        sections: List<Pair<CatalogEntry, List<CatalogEntry>>>,
        filterId: String,
        student: StudentService,
        content: ContentService,
    ): List<RunQuestion> {
        val seed = Random.nextInt(100_000, 1_000_000).toString()

        // bucket'ы: proto первыми, затем topic и section в порядке каталога
        val buckets = mutableListOf<Bucket>()
        for ((baseId, pick) in selection.protoCounts.entries.sortedBy { it.key }) {
            buckets.add(Bucket("proto", baseId, pick.count))
        }
        for ((section, topics) in sections) {
            for (topic in topics) {
                val n = selection.topicCounts[topic.id]
                if (n != null && n > 0) buckets.add(Bucket("topic", topic.id, n))
            }
            val n = selection.sectionCounts[section.id]
            if (n != null && n > 0) buckets.add(Bucket("section", section.id, n))
        }
        if (buckets.isEmpty()) return emptyList()

        // over-fetch как overN() веба: want + 6, cap 40 — на каждый бакет
        val requests = buckets.map { ResolveRequest(it.kind, it.id, minOf(it.want + 6, 40)) }
        val candidates = runCatching {
            student.resolveFiltered(requests, filterId, emptyList(), seed)
        }.getOrDefault(emptyList())

        val usedIds = mutableSetOf<String>()
        val usedBases = mutableSetOf<String>()
        val pickedByBucket = rotateBuckets(candidates, buckets, usedIds, usedBases).toMutableMap()

        // P4-4 (решение оператора): фильтр — приоритет, не сито. Дефицит
        // добирается вторым батчем БЕЗ фильтра с исключением взятых.
        val deficits = buckets.mapNotNull { b ->
            val got = pickedByBucket["${b.kind}:${b.id}"]?.size ?: 0
            if (got < b.want) Bucket(b.kind, b.id, b.want - got) else null
        }
        if (deficits.isNotEmpty()) {
            val topupReqs = deficits.map { ResolveRequest(it.kind, it.id, minOf(it.want + 6, 40)) }
            val topup = runCatching {
                student.resolveFiltered(topupReqs, null, usedIds.toList(), seed)
            }.getOrDefault(emptyList())
            val extra = rotateBuckets(topup, deficits, usedIds, usedBases)
            for ((key, qs) in extra) {
                pickedByBucket[key] = pickedByBucket.getOrDefault(key, emptyList()) + qs
            }
        }

        val refs = mutableListOf<QuestionRef>()
        for (bucket in buckets) {
            val picked = pickedByBucket["${bucket.kind}:${bucket.id}"] ?: emptyList()
            refs.addAll(picked.map {
                QuestionRef(topicId = it.topicId ?: bucket.id, questionId = it.questionId)
            })
        }
        return content.buildQuestions(refs)
    }

    /**
     * Двухпроходная ротация по базовым прототипам (pickByProtoRotation) с
     * группировкой по бакетам атрибуции ответа. Public — покрыта юнитами
     * :core и проверкой pick.spread в :harness.
     */
    fun rotate(
        candidates: List<ResolvedQuestion>,
        buckets: List<Triple<String, String, Int>>,
        usedIds: MutableSet<String>,
        usedBases: MutableSet<String>,
    ): Map<String, List<ResolvedQuestion>> {
        val byBucket = mutableMapOf<String, MutableList<ResolvedQuestion>>()
        for (c in candidates) {
            byBucket.getOrPut("${c.scopeKind ?: ""}:${c.scopeId ?: ""}") { mutableListOf() }.add(c)
        }
        val out = mutableMapOf<String, List<ResolvedQuestion>>()
        for ((kind, id, want) in buckets) {
            val key = "$kind:$id"
            val cands = byBucket[key] ?: emptyList()
            val picked = mutableListOf<ResolvedQuestion>()
            for (c in cands) {
                if (picked.size >= want) break
                if (usedIds.contains(c.questionId)) continue
                val base = ContentService.baseId(c.questionId)
                if (!usedBases.contains(base)) {
                    usedBases.add(base)
                    usedIds.add(c.questionId)
                    picked.add(c)
                }
            }
            for (c in cands) {
                if (picked.size >= want) break
                if (usedIds.contains(c.questionId)) continue
                usedIds.add(c.questionId)
                picked.add(c)
            }
            out[key] = picked
        }
        return out
    }

    private fun rotateBuckets(
        candidates: List<ResolvedQuestion>,
        buckets: List<Bucket>,
        usedIds: MutableSet<String>,
        usedBases: MutableSet<String>,
    ): Map<String, List<ResolvedQuestion>> =
        rotate(candidates, buckets.map { Triple(it.kind, it.id, it.want) }, usedIds, usedBases)
}
