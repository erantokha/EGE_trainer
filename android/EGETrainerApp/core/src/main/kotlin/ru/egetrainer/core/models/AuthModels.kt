package ru.egetrainer.core.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Сессия Supabase Auth (ответ /auth/v1/token).
 * GoTrue может отдать expires_at ИЛИ только expires_in — после декода
 * обязательно вызывать [normalized] (зеркало init(from:) в AuthModels.swift).
 */
@Serializable
data class AuthSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Double? = null,
    @SerialName("expires_in") val expiresIn: Double? = null,
    val user: AuthUser,
) {
    /** expires_at гарантированно заполнен (из expires_in при отсутствии). */
    fun normalized(nowEpochSeconds: Double = System.currentTimeMillis() / 1000.0): AuthSession =
        if (expiresAt != null) this
        else copy(expiresAt = nowEpochSeconds + (expiresIn ?: 3600.0))

    val isExpiringSoon: Boolean
        get() = (expiresAt ?: 0.0) - System.currentTimeMillis() / 1000.0 < 60
}

@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null,
)

/** Строка таблицы profiles (читается под RLS своим токеном). */
@Serializable
data class Profile(
    val id: String,
    val email: String? = null,
    val role: String? = null, // "student" | "teacher"
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("student_grade") val studentGrade: Int? = null,
    @SerialName("teacher_type") val teacherType: String? = null,
    @SerialName("profile_completed") val profileCompleted: Boolean? = null,
) {
    val isTeacher: Boolean get() = role == "teacher"

    /** Профиль требует completion-шага (как редирект на google_complete.html). */
    val needsCompletion: Boolean
        get() {
            val r = (role ?: "").trim()
            if (r != "student" && r != "teacher") return true
            return profileCompleted == false
        }

    val displayName: String
        get() {
            val name = listOfNotNull(firstName, lastName).joinToString(" ").trim()
            if (name.isNotEmpty()) return name
            email?.substringBefore('@')?.takeIf { it.isNotEmpty() }?.let { return it }
            return "Пользователь"
        }

    /** Имя для start_homework_attempt — как inferNameFromUser в вебе. */
    val hwStudentName: String
        get() {
            firstName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            email?.substringBefore('@')?.takeIf { it.isNotEmpty() }?.let { return it }
            return "Ученик"
        }
}
