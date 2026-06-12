package ru.egetrainer.core.services

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import ru.egetrainer.core.models.AuthSession
import ru.egetrainer.core.models.Profile

/** Авторизация и профиль — порт AuthService.swift (login -> profiles.role -> роутинг по роли). */
class AuthService(private val client: SupabaseClient) {

    suspend fun signIn(email: String, password: String): AuthSession =
        client.signIn(email.trim().lowercase(), password)

    suspend fun signOut() = client.signOut()

    suspend fun restoreSession(): AuthSession? = client.restoreSession()

    /** Профиль текущего пользователя (RLS отдаёт только свою строку). */
    suspend fun fetchMyProfile(): Profile {
        val rows = client.select(
            "profiles",
            query = mapOf("select" to "*"),
            deserializer = ListSerializer(Profile.serializer()),
        )
        return rows.firstOrNull() ?: throw SupabaseError.EmptyResponse()
    }

    /**
     * update_my_profile — контракт tasks/profile.js и google_complete.js:
     * строго p_first_name / p_last_name / p_role / p_teacher_type / p_student_grade
     * (готча iOS: неверные имена параметров RPC молча не работают).
     */
    suspend fun updateMyProfile(
        firstName: String,
        lastName: String,
        role: String,
        teacherType: String? = null,
        studentGrade: Int? = null,
    ) {
        client.rpcVoid(
            "update_my_profile",
            JsonObject(
                mapOf(
                    "p_first_name" to JsonPrimitive(firstName),
                    "p_last_name" to JsonPrimitive(lastName),
                    "p_role" to JsonPrimitive(role),
                    "p_teacher_type" to if (role == "teacher" && teacherType != null)
                        JsonPrimitive(teacherType) else JsonNull,
                    "p_student_grade" to if (role == "student" && studentGrade != null)
                        JsonPrimitive(studentGrade) else JsonNull,
                )
            )
        )
    }

    /** delete_my_account — чистит попытки, связи и пользователя auth.users. */
    suspend fun deleteMyAccount() {
        client.rpcVoid("delete_my_account")
        client.signOut()
    }

    // MARK: Регистрация / сброс (red-zone, контракт tasks/auth.js)

    /** URL веб-callback подтверждения почты (как callback в tasks/auth.js). */
    private val emailCallbackURL = "${SupabaseConfig.SITE_BASE_URL}/tasks/auth_callback.html"

    /** Регистрация (signUpWithPassword веба): meta = role/имя/класс|тип.
     *  true — если сессия выдана сразу (без email-confirm). */
    suspend fun signUp(
        email: String,
        password: String,
        role: String,
        firstName: String,
        lastName: String,
        teacherType: String? = null,
        studentGrade: Int? = null,
    ): Boolean {
        val meta = buildMap {
            put("role", JsonPrimitive(role))
            put("first_name", JsonPrimitive(firstName))
            put("last_name", JsonPrimitive(lastName))
            put("teacher_type", if (role == "teacher" && teacherType != null)
                JsonPrimitive(teacherType) else JsonNull)
            put("student_grade", if (role == "student" && studentGrade != null)
                JsonPrimitive(studentGrade) else JsonNull)
        }
        return client.signUp(
            email = email.trim().lowercase(),
            password = password,
            meta = JsonObject(meta),
            emailRedirectTo = emailCallbackURL,
        )
    }

    suspend fun resendSignupEmail(email: String) =
        client.resendSignupEmail(email.trim().lowercase(), emailCallbackURL)

    /** Письмо сброса пароля; смена пароля завершается на вебе (auth_reset.html). */
    suspend fun sendPasswordReset(email: String) =
        client.sendPasswordReset(
            email.trim().lowercase(),
            "${SupabaseConfig.SITE_BASE_URL}/tasks/auth_reset.html",
        )
}
