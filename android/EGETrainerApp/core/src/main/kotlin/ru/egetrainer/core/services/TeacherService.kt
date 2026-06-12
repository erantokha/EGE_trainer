package ru.egetrainer.core.services

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import ru.egetrainer.core.models.HomeworkLinkRow
import ru.egetrainer.core.models.HomeworkRow
import ru.egetrainer.core.models.OutgoingStudentRequest
import ru.egetrainer.core.models.PickingScreen
import ru.egetrainer.core.models.ProtoLast3Stat
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.QuestionStat
import ru.egetrainer.core.models.ResolveBatchResult
import ru.egetrainer.core.models.ResolvedQuestion
import ru.egetrainer.core.models.StudentAttemptRow
import ru.egetrainer.core.models.StudentListItem
import ru.egetrainer.core.models.StudentSummary
import java.security.SecureRandom

/** Teacher-домен: ученики, consent, подбор, создание/назначение ДЗ (порт TeacherService.swift). */
class TeacherService(private val client: SupabaseClient) {

    // MARK: Мои ученики

    suspend fun listMyStudents(): List<StudentListItem> =
        client.rpc("list_my_students", deserializer = ListSerializer(StudentListItem.serializer()))

    // MARK: Статистика прототипов для модалки (WMB1/WMB3 контракты)

    /** proto_last3_for_teacher_v1 — последние 3 попытки по базовым прототипам. */
    suspend fun protoLast3(studentId: String, unicIds: List<String>): List<ProtoLast3Stat> =
        client.rpc(
            "proto_last3_for_teacher_v1",
            buildJsonObject {
                put("p_student_id", studentId)
                putJsonArray("p_unic_ids") { unicIds.forEach { add(it) } }
            },
            ListSerializer(ProtoLast3Stat.serializer()),
        )

    /** proto_last3_for_self_v1 — то же для самого ученика (+ all-time и дата). */
    suspend fun protoLast3Self(unicIds: List<String>): List<ProtoLast3Stat> =
        client.rpc(
            "proto_last3_for_self_v1",
            buildJsonObject {
                putJsonArray("p_unic_ids") { unicIds.forEach { add(it) } }
            },
            ListSerializer(ProtoLast3Stat.serializer()),
        )

    /**
     * question_stats_for_teacher_v2 (фоллбэк v1) — per-вопросная статистика.
     * Сигнатура ТОЛЬКО p_student_id + p_question_ids (готча iOS: лишний
     * параметр = тихий 404; p_topic_id у функции нет — проверено против прода).
     */
    suspend fun questionStats(studentId: String, questionIds: List<String>): List<QuestionStat> {
        val params = buildJsonObject {
            put("p_student_id", studentId)
            putJsonArray("p_question_ids") { questionIds.forEach { add(it) } }
        }
        return try {
            client.rpc("question_stats_for_teacher_v2", params, ListSerializer(QuestionStat.serializer()))
        } catch (_: Exception) {
            client.rpc("question_stats_for_teacher_v1", params, ListSerializer(QuestionStat.serializer()))
        }
    }

    // MARK: Session-ссылки (WS.1, create_session_link)

    data class SessionLink(val token: String, val url: String)

    /**
     * create_session_link: shareable-ссылка на подборку (mode 'list'|'test').
     * Запись не идемпотентна — БЕЗ ретраев на уровне вызова (как task_session.js;
     * сетевые ретраи клиента касаются только IOException до получения ответа).
     */
    suspend fun createSessionLink(
        mode: String,
        shuffle: Boolean,
        frozenQuestions: List<QuestionRef>,
    ): SessionLink {
        @Serializable
        data class Created(
            val token: String? = null,
            @SerialName("homework_id") val homeworkId: String? = null,
        )

        val created = client.rpcSingleRow(
            "create_session_link",
            buildJsonObject {
                put("p_mode", mode)
                put("p_shuffle", shuffle)
                putJsonObject("p_spec_json") {}
                putJsonArray("p_frozen_questions") {
                    frozenQuestions.forEach { ref ->
                        add(buildJsonObject {
                            put("topic_id", ref.topicId)
                            put("question_id", ref.questionId)
                        })
                    }
                }
            },
            Created.serializer(),
        )
        val token = created.token?.takeIf { it.isNotEmpty() } ?: throw SupabaseError.EmptyResponse()
        val page = if (mode == "test") "tasks/trainer.html" else "tasks/list.html"
        return SessionLink(token, "${SupabaseConfig.SITE_BASE_URL}/$page?session=$token")
    }

    suspend fun studentsSummary(days: Int = 30, source: String = "all"): List<StudentSummary> =
        client.rpc(
            "teacher_students_summary",
            buildJsonObject {
                put("p_days", days)
                put("p_source", source)
            },
            ListSerializer(StudentSummary.serializer()),
        )

    /** Пригласить ученика по email (pending-запрос, consent-модель). */
    suspend fun inviteStudent(email: String) =
        client.rpcVoid(
            "teacher_invite_student",
            buildJsonObject { put("p_email", email.trim().lowercase()) },
        )

    suspend fun outgoingRequests(): List<OutgoingStudentRequest> =
        client.rpc(
            "list_my_student_requests",
            deserializer = ListSerializer(OutgoingStudentRequest.serializer()),
        )

    suspend fun cancelRequest(requestId: String) =
        client.rpcVoid("cancel_student_request", buildJsonObject { put("p_request_id", requestId) })

    suspend fun removeStudent(studentId: String) =
        client.rpcVoid("remove_student", buildJsonObject { put("p_student_id", studentId) })

    /** Выполненные работы ученика (list_student_attempts). */
    suspend fun studentAttempts(studentId: String): List<StudentAttemptRow> =
        client.rpc(
            "list_student_attempts",
            buildJsonObject { put("p_student_id", studentId) },
            ListSerializer(StudentAttemptRow.serializer()),
        )

    // MARK: Подбор задач (teacher_picking_screen_v2 / resolve_batch)

    suspend fun pickingScreen(
        studentId: String,
        days: Int = 30,
        source: String = "all",
        filterId: String? = null,
        seed: String? = null,
    ): PickingScreen = client.rpc(
        "teacher_picking_screen_v2",
        buildJsonObject {
            put("p_student_id", studentId)
            put("p_mode", "init")
            put("p_days", days)
            put("p_source", source)
            if (filterId != null) put("p_filter_id", filterId) else put("p_filter_id", JsonNull)
            putJsonObject("p_selection") {}
            putJsonObject("p_request") {}
            if (seed != null) put("p_seed", seed) else put("p_seed", JsonNull)
            put("p_exclude_question_ids", JsonNull)
        },
        PickingScreen.serializer(),
    )

    /**
     * Обобщённый resolve: смешанные бакеты proto/topic/section
     * (как pickQuestionsViaTeacherScreenResolveBatch веба), с shortage.
     */
    suspend fun resolveRequests(
        studentId: String,
        requests: List<ResolveRequest>,
        filterId: String? = null,
        excludeQuestionIds: List<String> = emptyList(),
        seed: String? = null,
    ): ResolveBatchResult = client.rpc(
        "teacher_picking_resolve_batch_v1",
        buildJsonObject {
            put("p_student_id", studentId)
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
            putJsonArray("p_exclude_question_ids") { excludeQuestionIds.forEach { add(it) } }
        },
        ResolveBatchResult.serializer(),
    )

    /**
     * Resolve с добором (P4-4: фильтр — приоритет, не сито): сначала по фильтру,
     * дефицит каждого бакета добирается вторым батчем без фильтра с исключением взятых.
     */
    suspend fun resolvePickedWithTopUp(
        studentId: String,
        requests: List<ResolveRequest>,
        filterId: String?,
    ): List<ResolvedQuestion> {
        val result = resolveRequests(studentId, requests, filterId)
        var picked = result.pickedQuestions.orEmpty()
        if (filterId == null) return picked

        val got = mutableMapOf<String, Int>()
        for (q in picked) {
            val key = "${q.scopeKind ?: ""}:${q.scopeId ?: ""}"
            got[key] = (got[key] ?: 0) + 1
        }
        val deficits = requests.mapNotNull { r ->
            val need = r.n - (got["${r.scopeKind}:${r.scopeId}"] ?: 0)
            if (need > 0) ResolveRequest(r.scopeKind, r.scopeId, need) else null
        }
        if (deficits.isNotEmpty()) {
            val topup = runCatching {
                resolveRequests(
                    studentId,
                    deficits,
                    filterId = null,
                    excludeQuestionIds = picked.map { it.questionId },
                )
            }.getOrNull()
            picked = picked + topup?.pickedQuestions.orEmpty()
        }
        return picked
    }

    /** Батч-подбор задач по выбранным темам: topic_id -> count. */
    suspend fun resolveBatch(
        studentId: String,
        selection: Map<String, Int>,
        source: String = "all",
        filterId: String? = null,
        seed: String? = null,
    ): List<ResolvedQuestion> {
        // p_complete не передаём (веб шлёт его только при true — обратная совместимость)
        val result = client.rpc(
            "teacher_picking_resolve_batch_v1",
            buildJsonObject {
                put("p_student_id", studentId)
                put("p_source", source)
                if (filterId != null) put("p_filter_id", filterId) else put("p_filter_id", JsonNull)
                putJsonObject("p_selection") {}
                putJsonArray("p_requests") {
                    selection.forEach { (topicId, n) ->
                        add(buildJsonObject {
                            put("scope_kind", "topic")
                            put("scope_id", topicId)
                            put("n", n)
                        })
                    }
                }
                if (seed != null) put("p_seed", seed) else put("p_seed", JsonNull)
                putJsonArray("p_exclude_question_ids") {}
            },
            ResolveBatchResult.serializer(),
        )
        return result.pickedQuestions.orEmpty()
    }

    // MARK: Создание и назначение ДЗ (hw_create.js flow)

    data class CreatedHomework(
        val homeworkId: String,
        val token: String,
        val url: String,
    )

    /** Полный флоу: insert homeworks -> insert homework_links -> (опц.) assign RPC. */
    suspend fun createHomework(
        title: String,
        description: String? = null,
        shuffle: Boolean = false,
        questions: List<QuestionRef>,
        assignToStudentId: String? = null,
    ): CreatedHomework {
        val session = client.currentSession ?: throw SupabaseError.AuthRequired()
        val ownerId = session.user.id

        val refsJson = buildJsonArray {
            questions.forEach { ref ->
                add(buildJsonObject {
                    put("topic_id", ref.topicId)
                    put("question_id", ref.questionId)
                })
            }
        }

        // 1) homeworks row (как createHomework в homework.js; description/shuffle —
        //    те же колонки/spec_json, что getDescriptionValue()/#shuffle hw_create.js)
        val hwRows = client.insert(
            "homeworks",
            buildJsonObject {
                put("owner_id", ownerId)
                put("title", title.trim())
                val desc = description?.takeIf { it.isNotEmpty() }
                if (desc != null) put("description", desc) else put("description", JsonNull)
                putJsonObject("spec_json") {
                    put("v", 1)
                    put("fixed", refsJson)
                    put("shuffle", shuffle)
                    put("generated", JsonNull)
                }
                put("frozen_questions", refsJson)
                put("attempts_per_student", 1)
                put("is_active", true)
            },
            ListSerializer(HomeworkRow.serializer()),
        )
        val hw = hwRows.firstOrNull() ?: throw SupabaseError.EmptyResponse()

        // 2) homework_links row с токеном — 16 случайных байт hex (makeToken из hw_create.js)
        val token = makeToken()
        client.insert(
            "homework_links",
            buildJsonObject {
                put("owner_id", ownerId)
                put("homework_id", hw.id)
                put("token", token)
                put("expires_at", JsonNull)
                put("is_active", true)
            },
            ListSerializer(HomeworkLinkRow.serializer()),
        )

        // 3) назначение ученику (assign_homework_to_student)
        if (assignToStudentId != null) {
            client.rpcVoid(
                "assign_homework_to_student",
                buildJsonObject {
                    put("p_homework_id", hw.id)
                    put("p_student_id", assignToStudentId)
                    put("p_token", token)
                },
            )
        }

        return CreatedHomework(hw.id, token, "${SupabaseConfig.SITE_BASE_URL}/tasks/hw.html?token=$token")
    }

    companion object {
        fun makeToken(): String {
            val bytes = ByteArray(16)
            SecureRandom().nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
