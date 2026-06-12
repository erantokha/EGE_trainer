package ru.egetrainer.core.services

import ru.egetrainer.core.AppJson
import ru.egetrainer.core.models.AuthSession

/**
 * Хранилище сессии. Интерфейс — чтобы harness/тесты работали in-memory,
 * а :app подменял на EncryptedSharedPreferences (аналог Keychain в iOS).
 */
interface SessionStore {
    fun load(): AuthSession?
    fun save(session: AuthSession)
    fun clear()
}

/** In-memory хранилище для тестов/харнесса. */
class InMemorySessionStore : SessionStore {
    private var session: AuthSession? = null
    override fun load(): AuthSession? = session
    override fun save(session: AuthSession) { this.session = session }
    override fun clear() { session = null }
}

/**
 * Утилиты (де)сериализации сессии для персистентных реализаций в :app —
 * формат тот же, что у iOS Keychain-стора (JSON AuthSession).
 */
object SessionCodec {
    fun encode(session: AuthSession): String =
        AppJson.encodeToString(AuthSession.serializer(), session)

    fun decode(raw: String): AuthSession? =
        runCatching { AppJson.decodeFromString(AuthSession.serializer(), raw).normalized() }.getOrNull()
}
