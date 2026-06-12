package ru.egetrainer.core.services

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import ru.egetrainer.core.AppJson
import ru.egetrainer.core.models.AuthSession
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/**
 * Единый сетевой слой Supabase — порт SupabaseClient.swift (зеркало
 * app/providers/supabase.js + supabase-rest.js):
 * - GoTrue: password-login, refresh, logout;
 * - PostgREST: rpc / select / insert;
 * - авто-refresh access_token (< 60 с до истечения) и один повтор запроса на 401;
 * - ретраи ТОЛЬКО сетевых сбоев/таймаутов (любой HTTP-ответ не ретраится),
 *   backoff как в вебе: 350 / 800 / 1500 мс.
 */
class SupabaseClient(private val store: SessionStore) {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    private val sessionMutex = Mutex()

    @Volatile
    private var session: AuthSession? = store.load()

    private var refreshInFlight: CompletableDeferred<AuthSession?>? = null

    private val jsonMedia = "application/json".toMediaType()

    // MARK: Session

    val currentSession: AuthSession? get() = session

    suspend fun restoreSession(): AuthSession? {
        val s = session ?: return null
        if (!s.isExpiringSoon) return s
        return refreshSession()
    }

    fun setSession(s: AuthSession?) {
        session = s
        if (s != null) store.save(s) else store.clear()
    }

    // MARK: Auth (GoTrue)

    suspend fun signIn(email: String, password: String): AuthSession {
        val url = "${SupabaseConfig.BASE_URL}/auth/v1/token".toHttpUrl()
            .newBuilder().addQueryParameter("grant_type", "password").build()
        val body = JsonObject(
            mapOf("email" to JsonPrimitive(email), "password" to JsonPrimitive(password))
        ).toString()
        val req = Request.Builder().url(url)
            .post(body.toRequestBody(jsonMedia))
            .header("apikey", SupabaseConfig.ANON_KEY)
            .header("Content-Type", "application/json")
            .build()

        val (data, status) = dataWithRetry(req)
        if (status != 200) throw SupabaseError.fromAuthBody(status, data)
        val s = decode(AuthSession.serializer(), data).normalized()
        setSession(s)
        return s
    }

    /**
     * Best-effort refresh (как в вебе): при неудаче сессию не трогаем —
     * протухший токен поймает 401-ветка конкретного запроса.
     * Конкурентные вызовы дедуплицируются (один сетевой refresh).
     */
    suspend fun refreshSession(): AuthSession? {
        val waitFor: CompletableDeferred<AuthSession?>
        val isOwner: Boolean
        sessionMutex.withLock {
            val existing = refreshInFlight
            if (existing != null) {
                waitFor = existing
                isOwner = false
            } else {
                val current = session
                if (current == null || current.refreshToken.isEmpty()) return null
                val d = CompletableDeferred<AuthSession?>()
                refreshInFlight = d
                waitFor = d
                isOwner = true
            }
        }
        if (!isOwner) return waitFor.await()

        val refreshed: AuthSession? = try {
            doRefresh(session!!.refreshToken)
        } catch (_: Throwable) {
            null
        }
        if (refreshed != null) setSession(refreshed)
        sessionMutex.withLock { refreshInFlight = null }
        waitFor.complete(refreshed)
        return refreshed
    }

    private suspend fun doRefresh(refreshToken: String): AuthSession? {
        val url = "${SupabaseConfig.BASE_URL}/auth/v1/token".toHttpUrl()
            .newBuilder().addQueryParameter("grant_type", "refresh_token").build()
        val body = JsonObject(mapOf("refresh_token" to JsonPrimitive(refreshToken))).toString()
        val req = Request.Builder().url(url)
            .post(body.toRequestBody(jsonMedia))
            .header("apikey", SupabaseConfig.ANON_KEY)
            .header("Content-Type", "application/json")
            .build()
        val (data, status) = runCatching { execute(req) }.getOrNull() ?: return null
        if (status != 200) return null
        return runCatching { decode(AuthSession.serializer(), data).normalized() }.getOrNull()
    }

    suspend fun signOut() {
        val s = session
        if (s != null) {
            val req = Request.Builder()
                .url("${SupabaseConfig.BASE_URL}/auth/v1/logout")
                .post(ByteArray(0).toRequestBody(null))
                .header("apikey", SupabaseConfig.ANON_KEY)
                .header("Authorization", "Bearer ${s.accessToken}")
                .build()
            runCatching { execute(req) } // best-effort revoke, UX не блокируем
        }
        setSession(null)
    }

    // MARK: PostgREST

    /** RPC-вызов: POST /rest/v1/rpc/<name>. Декодирует ответ в T. */
    suspend fun <T> rpc(
        name: String,
        params: JsonObject = JsonObject(emptyMap()),
        deserializer: DeserializationStrategy<T>,
    ): T = decode(deserializer, rpcRaw(name, params))

    /** RPC без интереса к телу ответа. */
    suspend fun rpcVoid(name: String, params: JsonObject = JsonObject(emptyMap())) {
        rpcRaw(name, params)
    }

    /** RPC, возвращающий сырое JSON-дерево (для форм «массив ИЛИ объект»). */
    suspend fun rpcElement(name: String, params: JsonObject = JsonObject(emptyMap())): JsonElement {
        val data = rpcRaw(name, params)
        return runCatching { AppJson.parseToJsonElement(data.decodeToString()) }
            .getOrElse { throw SupabaseError.Decoding(it.message ?: "parse") }
    }

    /**
     * PostgREST для scalar-RPC может вернуть как объект, так и массив из одной
     * строки — хелпер разворачивает обе формы (зеркало rpcSingleRow iOS /
     * normalizeAttemptRowFromRpc в вебе).
     */
    suspend fun <T> rpcSingleRow(
        name: String,
        params: JsonObject = JsonObject(emptyMap()),
        deserializer: DeserializationStrategy<T>,
    ): T {
        val element = rpcElement(name, params)
        val row: JsonElement = when (element) {
            is JsonArray -> element.firstOrNull() ?: throw SupabaseError.EmptyResponse()
            else -> element
        }
        return runCatching { AppJson.decodeFromJsonElement(deserializer, row) }
            .getOrElse { throw SupabaseError.Decoding(it.message ?: "decode") }
    }

    /** REST select: GET /rest/v1/<table>?<query> */
    suspend fun <T> select(
        table: String,
        query: Map<String, String>,
        deserializer: DeserializationStrategy<T>,
    ): T {
        val urlBuilder = "${SupabaseConfig.BASE_URL}/rest/v1/$table".toHttpUrl().newBuilder()
        query.forEach { (k, v) -> urlBuilder.addQueryParameter(k, v) }
        val req = Request.Builder().url(urlBuilder.build()).get().build()
        return decode(deserializer, authedRequest(req))
    }

    /** REST insert: POST /rest/v1/<table> (Prefer: return=representation). */
    suspend fun <T> insert(
        table: String,
        values: JsonObject,
        deserializer: DeserializationStrategy<T>,
    ): T {
        val req = Request.Builder()
            .url("${SupabaseConfig.BASE_URL}/rest/v1/$table")
            .post(values.toString().toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .build()
        return decode(deserializer, authedRequest(req))
    }

    // MARK: Internals

    private suspend fun rpcRaw(name: String, params: JsonObject): ByteArray {
        val req = Request.Builder()
            .url("${SupabaseConfig.BASE_URL}/rest/v1/rpc/$name")
            .post(params.toString().toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .build()
        return authedRequest(req)
    }

    /**
     * Запрос с auth-заголовками, авто-refresh при близком к истечению токене
     * и одним повтором на 401 (зеркало 401-retry из supabase-rest.js).
     */
    internal suspend fun authedRequest(request: Request): ByteArray {
        var s = session ?: throw SupabaseError.AuthRequired()
        if (s.isExpiringSoon) {
            refreshSession()?.let { s = it }
        }

        suspend fun attempt(token: String): Pair<ByteArray, Int> {
            val req = request.newBuilder()
                .header("apikey", SupabaseConfig.ANON_KEY)
                .header("Authorization", "Bearer $token")
                .build()
            return dataWithRetry(req)
        }

        var (data, status) = attempt(s.accessToken)
        if (status == 401) {
            val refreshed = refreshSession()
            if (refreshed == null) {
                setSession(null)
                throw SupabaseError.AuthRequired()
            }
            val second = attempt(refreshed.accessToken)
            data = second.first
            status = second.second
        }

        if (status !in 200..299) throw mapHTTPError(status, data)
        return data
    }

    /** Сетевые ретраи: повторяем только IOException (сбой/таймаут), любой HTTP-ответ возвращаем сразу. */
    internal suspend fun dataWithRetry(req: Request, retries: Int = 2): Pair<ByteArray, Int> {
        val backoffsMs = longArrayOf(350, 800, 1500)
        for (attemptIdx in 0..retries) {
            try {
                return execute(req)
            } catch (e: IOException) {
                val isTimeout = e is SocketTimeoutException || e is InterruptedIOException
                if (attemptIdx == retries) {
                    if (isTimeout) throw SupabaseError.Timeout()
                    throw SupabaseError.Network(e)
                }
                delay(backoffsMs[minOf(attemptIdx, backoffsMs.size - 1)])
            }
        }
        throw SupabaseError.Network(null)
    }

    private suspend fun execute(req: Request): Pair<ByteArray, Int> =
        withContext(Dispatchers.IO) {
            http.newCall(req).execute().use { resp ->
                Pair(resp.body?.bytes() ?: ByteArray(0), resp.code)
            }
        }

    private fun mapHTTPError(status: Int, body: ByteArray): SupabaseError {
        val obj = runCatching {
            AppJson.parseToJsonElement(body.decodeToString()) as? JsonObject
        }.getOrNull()
        val msg = (obj?.get("message") as? JsonPrimitive)
            ?.takeIf { it.isString }?.content ?: ""
        if (status == 403 || msg.uppercase().contains("ACCESS_DENIED")) return SupabaseError.AccessDenied()
        if (status == 401) return SupabaseError.AuthRequired()
        return SupabaseError.Http(status, msg)
    }

    internal fun <T> decode(deserializer: DeserializationStrategy<T>, data: ByteArray): T =
        try {
            AppJson.decodeFromString(deserializer, data.decodeToString())
        } catch (e: Exception) {
            throw SupabaseError.Decoding(e.toString())
        }

    internal fun baseHttpUrl(): HttpUrl = SupabaseConfig.BASE_URL.toHttpUrl()
}
