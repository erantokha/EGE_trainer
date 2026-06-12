package ru.egetrainer.core.services

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import ru.egetrainer.core.models.AuthSession
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * GoTrue-флоу регистрации/сброса/OAuth — порт SupabaseAuthFlows.swift
 * (зеркало signUpWithPassword / resendSignupEmail / sendPasswordReset /
 * signInWithGoogle (PKCE) из app/providers/supabase.js).
 * Все вызовы — без сетевых ретраев (retries = 0), как в iOS.
 */

private val jsonMedia = "application/json".toMediaType()

/** POST /auth/v1/signup. true — если сессия выдана сразу
 *  (autoconfirm выключен на проде → обычно false: ждём письмо). */
suspend fun SupabaseClient.signUp(
    email: String,
    password: String,
    meta: JsonObject,
    emailRedirectTo: String,
): Boolean {
    val url = "${SupabaseConfig.BASE_URL}/auth/v1/signup".toHttpUrl()
        .newBuilder().addQueryParameter("redirect_to", emailRedirectTo).build()
    val body = JsonObject(
        mapOf(
            "email" to JsonPrimitive(email),
            "password" to JsonPrimitive(password),
            "data" to meta,
        )
    ).toString()
    val req = Request.Builder().url(url)
        .post(body.toRequestBody(jsonMedia))
        .header("apikey", SupabaseConfig.ANON_KEY)
        .header("Content-Type", "application/json")
        .build()

    val (data, status) = dataWithRetry(req, retries = 0)
    if (status !in 200..299) throw SupabaseError.fromAuthBody(status, data)
    val s = runCatching { decode(AuthSession.serializer(), data).normalized() }.getOrNull()
    if (s != null && s.accessToken.isNotEmpty()) {
        setSession(s)
        return true
    }
    return false
}

/** POST /auth/v1/resend {type:'signup'} — переотправка письма подтверждения. */
suspend fun SupabaseClient.resendSignupEmail(email: String, emailRedirectTo: String) {
    val url = "${SupabaseConfig.BASE_URL}/auth/v1/resend".toHttpUrl()
        .newBuilder().addQueryParameter("redirect_to", emailRedirectTo).build()
    val body = JsonObject(
        mapOf("type" to JsonPrimitive("signup"), "email" to JsonPrimitive(email))
    ).toString()
    val req = Request.Builder().url(url)
        .post(body.toRequestBody(jsonMedia))
        .header("apikey", SupabaseConfig.ANON_KEY)
        .header("Content-Type", "application/json")
        .build()
    val (data, status) = dataWithRetry(req, retries = 0)
    if (status !in 200..299) throw SupabaseError.fromAuthBody(status, data)
}

/** POST /auth/v1/recover — письмо для смены пароля (redirect на веб auth_reset). */
suspend fun SupabaseClient.sendPasswordReset(email: String, redirectTo: String) {
    val url = "${SupabaseConfig.BASE_URL}/auth/v1/recover".toHttpUrl()
        .newBuilder().addQueryParameter("redirect_to", redirectTo).build()
    val body = JsonObject(mapOf("email" to JsonPrimitive(email))).toString()
    val req = Request.Builder().url(url)
        .post(body.toRequestBody(jsonMedia))
        .header("apikey", SupabaseConfig.ANON_KEY)
        .header("Content-Type", "application/json")
        .build()
    val (data, status) = dataWithRetry(req, retries = 0)
    if (status !in 200..299) throw SupabaseError.fromAuthBody(status, data)
}

// MARK: OAuth (Google, PKCE)

/** URL /auth/v1/authorize для Custom Tabs (аналог ASWebAuthenticationSession). */
fun oauthAuthorizeURL(provider: String, redirectTo: String, codeChallenge: String): String =
    "${SupabaseConfig.BASE_URL}/auth/v1/authorize".toHttpUrl().newBuilder()
        .addQueryParameter("provider", provider)
        .addQueryParameter("redirect_to", redirectTo)
        .addQueryParameter("code_challenge", codeChallenge)
        .addQueryParameter("code_challenge_method", "s256")
        .build()
        .toString()

/** POST /auth/v1/token?grant_type=pkce — обмен кода на сессию. */
suspend fun SupabaseClient.exchangeOAuthCode(code: String, codeVerifier: String): AuthSession {
    val url = "${SupabaseConfig.BASE_URL}/auth/v1/token".toHttpUrl()
        .newBuilder().addQueryParameter("grant_type", "pkce").build()
    val body = JsonObject(
        mapOf(
            "auth_code" to JsonPrimitive(code),
            "code_verifier" to JsonPrimitive(codeVerifier),
        )
    ).toString()
    val req = Request.Builder().url(url)
        .post(body.toRequestBody(jsonMedia))
        .header("apikey", SupabaseConfig.ANON_KEY)
        .header("Content-Type", "application/json")
        .build()
    val (data, status) = dataWithRetry(req, retries = 0)
    if (status != 200) throw SupabaseError.fromAuthBody(status, data)
    val s = decode(AuthSession.serializer(), data).normalized()
    setSession(s)
    return s
}

/** PKCE-пара verifier/challenge (S256), как в supabase-js: 64 случайных байта
 *  → base64url verifier (86 симв., в пределах 43–128), SHA-256 → challenge. */
class PKCEPair {
    val verifier: String
    val challenge: String

    init {
        val bytes = ByteArray(64)
        SecureRandom().nextBytes(bytes)
        verifier = base64Url(bytes)
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.UTF_8))
        challenge = base64Url(digest)
    }

    private fun base64Url(data: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(data)
}
