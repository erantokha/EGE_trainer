package ru.egetrainer.core.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// MARK: list_my_students

@Serializable
data class StudentListItem(
    @SerialName("student_id") val studentId: String,
    val email: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("student_grade") val studentGrade: Int? = null,
    @SerialName("linked_at") val linkedAt: String? = null,
) {
    val id: String get() = studentId

    val displayName: String
        get() {
            val name = listOfNotNull(firstName, lastName).joinToString(" ").trim()
            if (name.isNotEmpty()) return name
            return email ?: "Ученик"
        }
}

// MARK: teacher_students_summary

@Serializable
data class StudentSummary(
    @SerialName("student_id") val studentId: String,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("activity_total") val activityTotal: Int? = null,
    @SerialName("last10_total") val last10Total: Int? = null,
    @SerialName("last10_correct") val last10Correct: Int? = null,
    @SerialName("covered_topics_all_time") val coveredTopicsAllTime: Int? = null,
)

// MARK: consent: запросы учителя (исходящие) и ученика (входящие)

@Serializable
data class OutgoingStudentRequest(
    @SerialName("request_id") val requestId: String,
    @SerialName("student_email") val studentEmail: String? = null,
    val status: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val id: String get() = requestId
}

@Serializable
data class IncomingTeacherRequest(
    @SerialName("request_id") val requestId: String,
    @SerialName("teacher_id") val teacherId: String? = null,
    @SerialName("teacher_name") val teacherName: String? = null,
    @SerialName("teacher_email") val teacherEmail: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val status: String? = null,
) {
    val id: String get() = requestId
}

@Serializable
data class MyTeacher(
    @SerialName("teacher_id") val teacherId: String,
    @SerialName("teacher_name") val teacherName: String? = null,
    @SerialName("teacher_email") val teacherEmail: String? = null,
    @SerialName("linked_at") val linkedAt: String? = null,
) {
    val id: String get() = teacherId
    val displayName: String get() = teacherName ?: teacherEmail ?: "Преподаватель"
}

// MARK: list_student_attempts

@Serializable
data class StudentAttemptRow(
    @SerialName("attempt_id") val attemptId: String,
    @SerialName("homework_id") val homeworkId: String? = null,
    @SerialName("homework_title") val homeworkTitle: String? = null,
    val total: Int? = null,
    val correct: Int? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("finished_at") val finishedAt: String? = null,
    @SerialName("duration_ms") val durationMs: Int? = null,
) {
    val id: String get() = attemptId
}

// MARK: teacher_picking_screen_v2

@Serializable
data class PickingScreen(
    val screen: PickingScreenMeta? = null,
    val sections: List<PickSection>? = null,
    val student: PickingStudent? = null,
) {
    @Serializable
    data class PickingScreenMeta(
        val mode: String? = null,
        @SerialName("can_pick") val canPick: Boolean? = null,
        @SerialName("session_seed") val sessionSeed: String? = null,
        @SerialName("supported_filters") val supportedFilters: List<String>? = null,
    )

    @Serializable
    data class PickingStudent(
        val days: Int? = null,
        val source: String? = null,
        @SerialName("student_id") val studentId: String? = null,
    )
}

@Serializable
data class PickSection(
    @SerialName("section_id") val sectionId: String,
    val title: String? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
    @SerialName("filter_counts") val filterCounts: FilterCounts? = null,
    val topics: List<PickTopic>? = null,
) {
    val id: String get() = sectionId
}

@Serializable
data class PickTopic(
    @SerialName("topic_id") val topicId: String,
    val title: String? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
    val coverage: PickCoverage? = null,
    val progress: PickProgress? = null,
    @SerialName("topic_state") val topicState: PickTopicState? = null,
    @SerialName("filter_counts") val filterCounts: FilterCounts? = null,
) {
    val id: String get() = topicId
}

@Serializable
data class PickCoverage(
    @SerialName("total_proto_count") val totalProtoCount: Int? = null,
    @SerialName("covered_proto_count") val coveredProtoCount: Int? = null,
)

@Serializable
data class PickProgress(
    @SerialName("all_time_pct") val allTimePct: Int? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("attempt_count_total") val attemptCountTotal: Int? = null,
    @SerialName("correct_count_total") val correctCountTotal: Int? = null,
    @SerialName("subtopic_last3_avg_pct") val subtopicLast3AvgPct: Double? = null,
)

@Serializable
data class PickTopicState(
    @SerialName("is_stale") val isStale: Boolean? = null,
    @SerialName("is_low_seen") val isLowSeen: Boolean? = null,
    @SerialName("is_not_seen") val isNotSeen: Boolean? = null,
    @SerialName("is_unstable") val isUnstable: Boolean? = null,
)

@Serializable
data class FilterCounts(
    val stale: Int? = null,
    val unstable: Int? = null,
    @SerialName("unseen_low") val unseenLow: Int? = null,
    @SerialName("weak_spots") val weakSpots: Int? = null,
)

// MARK: Статистика прототипов (proto_last3_*, question_stats_for_teacher_*)

/**
 * Бейдж «последние 3 попытки» по базовому прототипу (unic_id);
 * self-версия дополнительно отдаёт total/correct/last_attempt_at.
 */
@Serializable
data class ProtoLast3Stat(
    @SerialName("unic_id") val unicId: String,
    @SerialName("last3_total") val last3Total: Int? = null,
    @SerialName("last3_correct") val last3Correct: Int? = null,
    val total: Int? = null,
    val correct: Int? = null,
    @SerialName("last_attempt_at") val lastAttemptAt: String? = null,
)

@Serializable
data class QuestionStat(
    @SerialName("question_id") val questionId: String,
    val total: Int? = null,
    val correct: Int? = null,
    @SerialName("last3_total") val last3Total: Int? = null,
    @SerialName("last3_correct") val last3Correct: Int? = null,
    @SerialName("last_attempt_at") val lastAttemptAt: String? = null,
)

// MARK: teacher_picking_resolve_batch_v1

@Serializable
data class ResolveBatchResult(
    @SerialName("picked_questions") val pickedQuestions: List<ResolvedQuestion>? = null,
    val shortages: List<ResolveShortage>? = null,
)

@Serializable
data class ResolveShortage(
    @SerialName("scope_id") val scopeId: String? = null,
    @SerialName("is_shortage") val isShortage: Boolean? = null,
    @SerialName("requested_n") val requestedN: Int? = null,
    @SerialName("returned_n") val returnedN: Int? = null,
    val message: String? = null,
)

/**
 * Вопрос из resolve-батча. question_id + topic_id достаточно для
 * создания ДЗ (frozen_questions) и резолва текста через ContentService.
 */
@Serializable
data class ResolvedQuestion(
    @SerialName("question_id") val questionId: String,
    @SerialName("topic_id") val topicId: String? = null,
    @SerialName("proto_id") val protoId: String? = null,
    @SerialName("manifest_path") val manifestPath: String? = null,
    /** Атрибуция бакета из ответа батча (для клиентской ротации по бакетам). */
    @SerialName("scope_kind") val scopeKind: String? = null,
    @SerialName("scope_id") val scopeId: String? = null,
) {
    val id: String get() = questionId
}

// MARK: создание ДЗ (REST insert)

@Serializable
data class HomeworkRow(
    val id: String,
    val title: String? = null,
)

@Serializable
data class HomeworkLinkRow(
    val id: String? = null,
    val token: String? = null,
)
