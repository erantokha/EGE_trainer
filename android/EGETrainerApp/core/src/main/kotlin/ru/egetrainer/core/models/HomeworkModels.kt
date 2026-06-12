package ru.egetrainer.core.models

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import ru.egetrainer.core.AppJson

// MARK: student_my_homeworks_summary

@Serializable
data class HomeworkSummary(
    val items: List<HomeworkListItem> = emptyList(),
    @SerialName("total_count") val totalCount: Int = 0,
    @SerialName("archive_count") val archiveCount: Int = 0,
    @SerialName("pending_count") val pendingCount: Int = 0,
)

@Serializable
data class HomeworkListItem(
    val title: String? = null,
    val token: String,
    @SerialName("assigned_at") val assignedAt: String? = null,
    @SerialName("homework_id") val homeworkId: String,
    @SerialName("is_submitted") val isSubmitted: Boolean = false,
    @SerialName("submitted_at") val submittedAt: String? = null,
    @SerialName("assignment_id") val assignmentId: String? = null,
    val correct: Int? = null,
    val total: Int? = null,
) {
    val id: String get() = assignmentId ?: token
    val displayTitle: String get() = title?.takeIf { it.isNotEmpty() } ?: "Домашнее задание"
}

// MARK: student_my_homeworks_archive

/**
 * Страница архива: RPC может вернуть массив напрямую или { items: [...] }
 * (веб обрабатывает обе формы — tasks/my_homeworks_archive.js).
 */
object HomeworkArchivePage {
    fun parse(element: JsonElement): List<HomeworkArchiveItem> = when (element) {
        is JsonArray -> element.map { AppJson.decodeFromJsonElement(HomeworkArchiveItemSerializer, it) }
        is JsonObject -> (element["items"] as? JsonArray)
            ?.map { AppJson.decodeFromJsonElement(HomeworkArchiveItemSerializer, it) }
            ?: emptyList()
        else -> emptyList()
    }
}

/** Элемент архива — поля с веб-фоллбэками (token|hw_token|link_token и т.п.). */
@Serializable(with = HomeworkArchiveItemSerializer::class)
data class HomeworkArchiveItem(
    val title: String? = null,
    val token: String? = null,
    val assignedAt: String? = null,
    val submittedAt: String? = null,
    val isSubmittedFlag: Boolean? = null,
    val correct: Int? = null,
    val total: Int? = null,
) {
    val id: String get() = token ?: "${title ?: ""}-${assignedAt ?: ""}"
    val isSubmitted: Boolean get() = isSubmittedFlag ?: (submittedAt != null)
    val displayTitle: String get() = title?.takeIf { it.isNotEmpty() } ?: "Домашнее задание"
}

object HomeworkArchiveItemSerializer : KSerializer<HomeworkArchiveItem> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("HomeworkArchiveItem")

    private fun JsonObject.str(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { k ->
            (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        }

    override fun deserialize(decoder: Decoder): HomeworkArchiveItem {
        val input = decoder as? JsonDecoder
            ?: throw IllegalStateException("HomeworkArchiveItem: only JSON supported")
        val o = input.decodeJsonElement() as? JsonObject ?: JsonObject(emptyMap())
        return HomeworkArchiveItem(
            title = o.str("title"),
            token = o.str("token", "hw_token", "link_token"),
            assignedAt = o.str("assigned_at", "created_at", "issued_at"),
            submittedAt = o.str("submitted_at", "finished_at"),
            isSubmittedFlag = (o["is_submitted"] as? JsonPrimitive)?.booleanOrNull,
            correct = (o["correct"] as? JsonPrimitive)?.intOrNull,
            total = (o["total"] as? JsonPrimitive)?.intOrNull,
        )
    }

    override fun serialize(encoder: Encoder, value: HomeworkArchiveItem) {
        throw UnsupportedOperationException("HomeworkArchiveItem encode не используется")
    }
}

// MARK: get_homework_by_token

@Serializable
data class Homework(
    @SerialName("homework_id") val homeworkId: String,
    val title: String? = null,
    val description: String? = null,
    @SerialName("spec_json") val specJson: HomeworkSpec? = null,
    // frozen_questions может прийти и как jsonb-массив, и как сериализованная строка
    @SerialName("frozen_questions") val frozenQuestionsRaw: JsonElement? = null,
    val seed: String? = null,
    @SerialName("attempts_per_student") val attemptsPerStudent: Int? = null,
    val kind: String? = null, // "graded" | "session"
    @SerialName("is_active") val isActive: Boolean? = null,
) {
    val frozenQuestions: List<QuestionRef>?
        get() {
            val raw = frozenQuestionsRaw ?: return null
            return when (raw) {
                is JsonArray -> runCatching {
                    AppJson.decodeFromJsonElement(ListSerializer(QuestionRef.serializer()), raw)
                }.getOrNull()
                is JsonPrimitive -> raw.takeIf { it.isString }?.content?.let { s ->
                    runCatching { AppJson.decodeFromString(ListSerializer(QuestionRef.serializer()), s) }.getOrNull()
                }
                else -> null
            }
        }

    /** Итоговый список ссылок на задачи (frozen приоритетнее fixed — как в hw.js). */
    val questionRefs: List<QuestionRef>
        get() = frozenQuestions?.takeIf { it.isNotEmpty() } ?: specJson?.fixed ?: emptyList()
}

@Serializable
data class HomeworkSpec(
    val fixed: List<QuestionRef>? = null,
    val shuffle: Boolean? = null,
    @SerialName("content_version") val contentVersion: String? = null,
)

@Serializable
data class QuestionRef(
    @SerialName("topic_id") val topicId: String,
    @SerialName("question_id") val questionId: String,
)

// MARK: start_homework_attempt

@Serializable
data class StartAttemptResult(
    @SerialName("attempt_id") val attemptId: String? = null,
    @SerialName("already_exists") val alreadyExists: Boolean? = null,
    val id: String? = null,
) {
    val resolvedAttemptId: String? get() = attemptId ?: id
}

// MARK: get_homework_attempt_by_token / get_homework_attempt_for_teacher

@Serializable
data class HomeworkAttempt(
    val id: String? = null,
    @SerialName("attempt_id") val attemptId: String? = null,
    @SerialName("homework_id") val homeworkId: String? = null,
    @SerialName("homework_title") val homeworkTitle: String? = null,
    @SerialName("student_id") val studentId: String? = null,
    @SerialName("student_name") val studentName: String? = null,
    val payload: AttemptPayload? = null,
    val total: Int? = null,
    val correct: Int? = null,
    @SerialName("duration_ms") val durationMs: Int? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("finished_at") val finishedAt: String? = null,
) {
    val resolvedId: String? get() = attemptId ?: id
    val isFinished: Boolean get() = finishedAt != null
}

@Serializable
data class AttemptPayload(
    val title: String? = null,
    @SerialName("homework_id") val homeworkId: String? = null,
    @SerialName("student_name") val studentName: String? = null,
    val questions: List<AttemptQuestion>? = null,
)

/** Один отвеченный вопрос внутри payload попытки. */
@Serializable
data class AttemptQuestion(
    @SerialName("question_id") val questionId: String? = null,
    @SerialName("topic_id") val topicId: String? = null,
    val correct: Boolean? = null,
    @SerialName("chosen_text") val chosenText: String? = null,
    @SerialName("correct_text") val correctText: String? = null,
    @SerialName("normalized_text") val normalizedText: String? = null,
    @SerialName("time_ms") val timeMs: Int? = null,
    val difficulty: Int? = null,
) {
    val id: String get() = questionId ?: hashCode().toString()
}

// MARK: submit_homework_attempt_v2

@Serializable
data class SubmitAttemptResult(
    @SerialName("attempt_id") val attemptId: String? = null,
    @SerialName("already_submitted") val alreadySubmitted: Boolean? = null,
    val total: Int? = null,
    val correct: Int? = null,
    @SerialName("duration_ms") val durationMs: Int? = null,
    @SerialName("finished_at") val finishedAt: String? = null,
)
