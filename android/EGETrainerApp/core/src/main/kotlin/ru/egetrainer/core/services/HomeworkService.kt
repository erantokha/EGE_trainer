package ru.egetrainer.core.services

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ru.egetrainer.core.AppJson
import ru.egetrainer.core.models.AttemptPayload
import ru.egetrainer.core.models.Homework
import ru.egetrainer.core.models.HomeworkArchiveItem
import ru.egetrainer.core.models.HomeworkArchivePage
import ru.egetrainer.core.models.HomeworkAttempt
import ru.egetrainer.core.models.HomeworkSummary
import ru.egetrainer.core.models.StartAttemptResult
import ru.egetrainer.core.models.SubmitAttemptResult

/** Домен ДЗ ученика (зеркало app/providers/homework.js, порт HomeworkService.swift). */
class HomeworkService(private val client: SupabaseClient) {

    /** Список ДЗ ученика (student_my_homeworks_summary). */
    suspend fun myHomeworksSummary(): HomeworkSummary =
        client.rpc("student_my_homeworks_summary", deserializer = HomeworkSummary.serializer())

    /** ДЗ по токену ссылки (get_homework_by_token). */
    suspend fun homework(byToken: String): Homework =
        client.rpcSingleRow(
            "get_homework_by_token",
            buildJsonObject { put("p_token", byToken) },
            Homework.serializer(),
        )

    /** Начать/возобновить попытку (start_homework_attempt). */
    suspend fun startAttempt(token: String, studentName: String): StartAttemptResult {
        // student_key в RPC нормализуется на бэке; имя — как в вебе (trim + collapse spaces)
        val name = studentName.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        return client.rpcSingleRow(
            "start_homework_attempt",
            buildJsonObject {
                put("p_token", token)
                put("p_student_name", name)
            },
            StartAttemptResult.serializer(),
        )
    }

    /** Сдать ДЗ (submit_homework_attempt_v2 — контракт submitHomeworkAttempt веба). */
    suspend fun submitAttempt(
        attemptId: String,
        payload: AttemptPayload,
        total: Int,
        correct: Int,
        durationMs: Int,
    ): SubmitAttemptResult {
        val payloadJson = AppJson.encodeToJsonElement(AttemptPayload.serializer(), payload)
        return client.rpcSingleRow(
            "submit_homework_attempt_v2",
            buildJsonObject {
                put("p_attempt_id", attemptId)
                put("p_payload", payloadJson)
                put("p_total", total)
                put("p_correct", correct)
                put("p_duration_ms", durationMs)
            },
            SubmitAttemptResult.serializer(),
        )
    }

    /** Последняя попытка текущего ученика по токену (get_homework_attempt_by_token). */
    suspend fun attempt(byToken: String): HomeworkAttempt? =
        try {
            client.rpcSingleRow(
                "get_homework_attempt_by_token",
                buildJsonObject { put("p_token", byToken) },
                HomeworkAttempt.serializer(),
            )
        } catch (_: SupabaseError.EmptyResponse) {
            null
        }

    /**
     * Архив ДЗ с пагинацией (student_my_homeworks_archive — как
     * getStudentMyHomeworksArchive веба: p_offset/p_limit, веб начинает с offset=10).
     */
    suspend fun archive(offset: Int, limit: Int = 50): List<HomeworkArchiveItem> {
        val element = client.rpcElement(
            "student_my_homeworks_archive",
            buildJsonObject {
                put("p_offset", offset)
                put("p_limit", limit)
            },
        )
        return HomeworkArchivePage.parse(element)
    }

    /** Отчёт по попытке для учителя (get_homework_attempt_for_teacher). */
    suspend fun attemptForTeacher(attemptId: String): HomeworkAttempt =
        client.rpcSingleRow(
            "get_homework_attempt_for_teacher",
            buildJsonObject { put("p_attempt_id", attemptId) },
            HomeworkAttempt.serializer(),
        )
}
