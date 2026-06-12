package ru.egetrainer.core.services

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlinx.serialization.json.JsonObject
import ru.egetrainer.core.models.AnalyticsScreen
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.IncomingTeacherRequest
import ru.egetrainer.core.models.MyTeacher
import ru.egetrainer.core.models.PickingScreen
import ru.egetrainer.core.models.ResolveBatchResult
import ru.egetrainer.core.models.ResolvedQuestion
import java.time.Instant
import java.util.UUID

/** Студенческая аналитика + consent-flow ученика + запись попыток тренировки (порт StudentService.swift). */
class StudentService(private val client: SupabaseClient) {

    /**
     * student_analytics_screen_v1 — canonical layer-4 контракт статистики.
     * scope: "self" (ученик о себе) | "teacher" (учитель об ученике, требуется studentId).
     */
    suspend fun analytics(
        scope: String = "self",
        studentId: String? = null,
        days: Int = 30,
        source: String = "all",
    ): AnalyticsScreen = client.rpc(
        "student_analytics_screen_v1",
        buildJsonObject {
            put("p_viewer_scope", scope)
            put("p_days", days)
            put("p_source", source)
            put("p_mode", "init")
            if (studentId != null) put("p_student_id", studentId)
        },
        AnalyticsScreen.serializer(),
    )

    /** id текущего пользователя — для self-гейта teacher RPC. */
    fun selfUserId(): String? = client.currentSession?.user?.id

    /**
     * Подбор задач с фильтром — self-гейт teacher_picking_resolve_batch_v1
     * (тот же RPC, p_student_id = свой id; как student-ветки picker.js).
     * requests: n уже с over-fetch.
     */
    suspend fun resolveFiltered(
        requests: List<ResolveRequest>,
        filterId: String?,
        excludeQuestionIds: List<String>,
        seed: String?,
    ): List<ResolvedQuestion> {
        val sid = selfUserId() ?: throw SupabaseError.AuthRequired()
        val result = client.rpc(
            "teacher_picking_resolve_batch_v1",
            buildJsonObject {
                put("p_student_id", sid)
                put("p_source", "all")
                if (filterId != null) put("p_filter_id", filterId) else put("p_filter_id", JsonNull)
                putJsonObject("p_selection") {}
                putJsonArray("p_requests") {
                    requests.forEach { r ->
                        add(buildJsonObject {
                            put("scope_kind", r.scopeKind)
                            put("scope_id", r.scopeId)
                            put("n", r.n)
                        })
                    }
                }
                if (seed != null) put("p_seed", seed) else put("p_seed", JsonNull)
                putJsonArray("p_exclude_question_ids") {
                    excludeQuestionIds.forEach { add(it) }
                }
            },
            ResolveBatchResult.serializer(),
        )
        return result.pickedQuestions.orEmpty()
    }

    /**
     * Экран подбора с фильтром для самого ученика (self-гейт
     * teacher_picking_screen_v2 — бейджи состояний тем как у учителя).
     */
    suspend fun pickingScreenSelf(filterId: String?, days: Int = 30): PickingScreen {
        val sid = selfUserId() ?: throw SupabaseError.AuthRequired()
        return client.rpc(
            "teacher_picking_screen_v2",
            buildJsonObject {
                put("p_student_id", sid)
                put("p_mode", "init")
                put("p_days", days)
                put("p_source", "all")
                if (filterId != null) put("p_filter_id", filterId) else put("p_filter_id", JsonNull)
                putJsonObject("p_selection") {}
                putJsonObject("p_request") {}
                put("p_seed", JsonNull)
                put("p_exclude_question_ids", JsonNull)
            },
            PickingScreen.serializer(),
        )
    }

    // MARK: Тренировка: запись попытки (write_answer_events_v1, supabase-write.js)

    suspend fun writeTrainingAttempt(
        questions: List<AttemptQuestion>,
        startedAtMs: Long,
        finishedAtMs: Long,
        topicIds: List<String>,
        extraMeta: JsonObject = JsonObject(emptyMap()),
    ) {
        val total = questions.size
        val correct = questions.count { it.correct == true }
        val durationMs = (finishedAtMs - startedAtMs).toInt()

        val events = buildJsonArray {
            questions.forEach { q ->
                add(buildJsonObject {
                    put("question_id", q.questionId ?: "")
                    put("topic_id", q.topicId ?: "")
                    put("correct", q.correct ?: false)
                    put("chosen_text", q.chosenText ?: "")
                    put("normalized_text", q.normalizedText ?: "")
                    put("correct_text", q.correctText ?: "")
                    put("time_ms", q.timeMs ?: 0)
                    put("difficulty", q.difficulty ?: 1)
                })
            }
        }

        client.rpcVoid(
            "write_answer_events_v1",
            buildJsonObject {
                put("p_source", "test")
                put("p_attempt_ref", UUID.randomUUID().toString().lowercase())
                put("p_events", events)
                put("p_attempt_started_at", Instant.ofEpochMilli(startedAtMs).toString())
                put("p_attempt_finished_at", Instant.ofEpochMilli(finishedAtMs).toString())
                put("p_attempt_meta", buildJsonObject {
                    put("mode", "test")
                    putJsonArray("topic_ids") { topicIds.forEach { add(it) } }
                    put("total", total)
                    put("correct", correct)
                    put("duration_ms", durationMs)
                    put("avg_ms", if (total > 0) durationMs / total else 0)
                    put("client", "android")
                    extraMeta.forEach { (k, v) -> put(k, v) }
                })
            },
        )
    }

    // MARK: Consent (ученик)

    suspend fun incomingTeacherRequests(): List<IncomingTeacherRequest> =
        client.rpc(
            "list_incoming_teacher_requests",
            deserializer = ListSerializer(IncomingTeacherRequest.serializer()),
        )

    suspend fun respondTeacherRequest(requestId: String, accept: Boolean) =
        client.rpcVoid(
            "respond_teacher_request",
            buildJsonObject {
                put("p_request_id", requestId)
                put("p_accept", accept)
            },
        )

    suspend fun myTeachers(): List<MyTeacher> =
        client.rpc("list_my_teachers", deserializer = ListSerializer(MyTeacher.serializer()))

    suspend fun revokeTeacher(teacherId: String) =
        client.rpcVoid("revoke_my_teacher", buildJsonObject { put("p_teacher_id", teacherId) })
}
