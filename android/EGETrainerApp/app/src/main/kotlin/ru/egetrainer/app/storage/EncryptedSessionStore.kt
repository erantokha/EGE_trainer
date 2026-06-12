package ru.egetrainer.app.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import ru.egetrainer.core.models.AuthSession
import ru.egetrainer.core.services.KeyValueStore
import ru.egetrainer.core.services.SessionCodec
import ru.egetrainer.core.services.SessionStore

/**
 * Шифрованное хранение сессии — аналог KeychainSessionStore iOS:
 * EncryptedSharedPreferences (AES256, ключ в Android Keystore), сессия
 * переживает перезапуск приложения. Формат значения — SessionCodec (:core),
 * тот же JSON AuthSession, что у iOS Keychain-стора.
 */
class EncryptedSessionStore(context: Context) : SessionStore {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            "ege_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun load(): AuthSession? =
        prefs.getString(KEY, null)?.let { SessionCodec.decode(it) }

    override fun save(session: AuthSession) {
        prefs.edit().putString(KEY, SessionCodec.encode(session)).apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "supabase_session"
    }
}

/** Обычные SharedPreferences как KeyValueStore (для TrainingDraftStore — не секреты). */
class PrefsKeyValueStore(context: Context, name: String = "ege_kv") : KeyValueStore {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(name, Context.MODE_PRIVATE)

    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }
    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}
