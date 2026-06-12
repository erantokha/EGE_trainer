package ru.egetrainer.core.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

// MARK: student_analytics_screen_v1 (self / teacher scope)

@Serializable
data class AnalyticsScreen(
    val overall: OverallStats? = null,
    val student: AnalyticsStudent? = null,
    val sections: List<SectionStat>? = null,
    val topics: List<TopicStat>? = null,
    @SerialName("generated_at") val generatedAt: String? = null,
)

@Serializable
data class Counter(
    val total: Int,
    val correct: Int,
) {
    val pct: Int?
        get() = if (total > 0) (correct.toDouble() / total * 100).roundToInt() else null

    val ratioText: String get() = "$correct/$total"
}

@Serializable
data class OverallStats(
    val last3: Counter? = null,
    val last10: Counter? = null,
    val period: Counter? = null,
    @SerialName("all_time") val allTime: Counter? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
)

@Serializable
data class AnalyticsStudent(
    val days: Int? = null,
    val grade: Int? = null,
    val source: String? = null,
    @SerialName("student_id") val studentId: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("viewer_scope") val viewerScope: String? = null,
)

@Serializable
data class SectionStat(
    @SerialName("section_id") val sectionId: String,
    val title: String? = null,
    val last10: Counter? = null,
    val period: Counter? = null,
    @SerialName("all_time") val allTime: Counter? = null,
    val coverage: Coverage? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
) {
    val id: String get() = sectionId
}

@Serializable
data class Coverage(
    val pct: Int? = null,
    @SerialName("unics_total") val unicsTotal: Int? = null,
    @SerialName("unics_attempted") val unicsAttempted: Int? = null,
)

@Serializable
data class TopicStat(
    @SerialName("topic_id") val topicId: String,
    @SerialName("section_id") val sectionId: String? = null,
    @SerialName("subtopic_id") val subtopicId: String? = null,
    val title: String? = null,
    @SerialName("topic_order") val topicOrder: Int? = null,
    val last3: Counter? = null,
    val last10: Counter? = null,
    val period: Counter? = null,
    @SerialName("all_time") val allTime: Counter? = null,
    val coverage: Coverage? = null,
    val derived: DerivedStates? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("subtopic_last3_avg_pct") val subtopicLast3AvgPct: Double? = null,
) {
    val id: String get() = topicId
}

/** Производные состояния подтемы (бейджи «слабое», «давно не решал» и т.п.). */
@Serializable
data class DerivedStates(
    @SerialName("sample_state") val sampleState: String? = null,       // low | enough
    @SerialName("coverage_state") val coverageState: String? = null,   // covered | partial | none
    @SerialName("freshness_state") val freshnessState: String? = null, // fresh | stale
    @SerialName("performance_state") val performanceState: String? = null, // weak | mid | strong
)
