package ru.egetrainer.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import ru.egetrainer.app.storage.EncryptedSessionStore
import ru.egetrainer.app.storage.PrefsKeyValueStore
import ru.egetrainer.core.models.Profile
import ru.egetrainer.core.services.AuthService
import ru.egetrainer.core.services.ContentService
import ru.egetrainer.core.services.HomeworkService
import ru.egetrainer.core.services.PKCEPair
import ru.egetrainer.core.services.ProtoStatsCache
import ru.egetrainer.core.services.StudentService
import ru.egetrainer.core.services.SupabaseClient
import ru.egetrainer.core.services.TeacherService
import ru.egetrainer.core.services.TrainingDraftStore
import ru.egetrainer.core.services.exchangeOAuthCode

/**
 * Глобальное состояние приложения: сессия + профиль + роль —
 * порт AppState.swift (ObservableObject -> AndroidViewModel + StateFlow).
 */
class AppState(application: Application) : AndroidViewModel(application) {

    sealed class Phase {
        data object Launching : Phase()   // восстановление сессии при старте
        data object SignedOut : Phase()
        data class SignedIn(val profile: Profile) : Phase()
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Launching)
    val phase: StateFlow<Phase> = _phase

    /** Несданные ДЗ — бейдж на табе «Мои ДЗ» (паритет красной точки сайдбара веба). */
    private val _pendingHomeworksCount = MutableStateFlow(0)
    val pendingHomeworksCount: StateFlow<Int> = _pendingHomeworksCount

    val client = SupabaseClient(EncryptedSessionStore(application))
    val auth = AuthService(client)
    val homework = HomeworkService(client)
    val student = StudentService(client)
    val teacher = TeacherService(client)
    val content = ContentService.shared
    val protoStats = ProtoStatsCache.create(teacher, content)
    val draftStore = TrainingDraftStore(PrefsKeyValueStore(application))

    /** PKCE-пара текущего Google-флоу (живёт от authorize до exchange). */
    @Volatile
    var pendingPkce: PKCEPair? = null

    /** Ошибка OAuth-колбэка (показывается на auth-экране). */
    val oauthError = MutableStateFlow<String?>(null)

    /** Старт Google-входа: PKCE + Custom Tab с authorize-URL (зеркало signInWithGoogle). */
    fun startGoogleSignIn() {
        val pkce = PKCEPair()
        pendingPkce = pkce
        val url = ru.egetrainer.core.services.oauthAuthorizeURL(
            provider = "google",
            redirectTo = ru.egetrainer.app.screens.auth.GoogleSignIn.REDIRECT_URL,
            codeChallenge = pkce.challenge,
        )
        ru.egetrainer.app.screens.auth.GoogleSignIn.launch(getApplication(), url)
    }

    /** Обработка deep-link колбэка (вызывается из MainActivity). */
    fun handleOAuthCallback(code: String) {
        viewModelScope.launch {
            try {
                completeGoogleSignIn(code)
                oauthError.value = null
            } catch (e: ru.egetrainer.core.services.SupabaseError) {
                oauthError.value = e.userMessage
            } catch (e: Exception) {
                oauthError.value = "Не удалось завершить вход через Google. Попробуйте ещё раз."
            }
        }
    }

    val profile: Profile?
        get() = (_phase.value as? Phase.SignedIn)?.profile

    /** Восстановление сессии при запуске (сценарий C: пользователь остаётся залогинен). */
    suspend fun bootstrap() {
        if (auth.restoreSession() == null) {
            _phase.value = Phase.SignedOut
            return
        }
        // Сессия есть, но профиль мог не загрузиться (сеть?) — вторая попытка,
        // после второй неудачи остаёмся на signedOut (зеркало iOS).
        val profile = runCatching { auth.fetchMyProfile() }.getOrNull()
            ?: runCatching { auth.fetchMyProfile() }.getOrNull()
        _phase.value = profile?.let { Phase.SignedIn(it) } ?: Phase.SignedOut
    }

    suspend fun signIn(email: String, password: String) {
        auth.signIn(email, password)
        val profile = auth.fetchMyProfile()
        _phase.value = Phase.SignedIn(profile)
    }

    /** Завершение Google-флоу: обмен code -> сессия -> профиль (роутинг по needsCompletion). */
    suspend fun completeGoogleSignIn(code: String) {
        val pkce = pendingPkce ?: throw IllegalStateException("Google-вход не был начат")
        client.exchangeOAuthCode(code, pkce.verifier)
        pendingPkce = null
        val profile = auth.fetchMyProfile()
        _phase.value = Phase.SignedIn(profile)
    }

    suspend fun signOut() {
        auth.signOut()
        _phase.value = Phase.SignedOut
    }

    suspend fun reloadProfile() {
        runCatching { auth.fetchMyProfile() }.getOrNull()?.let {
            _phase.value = Phase.SignedIn(it)
        }
    }

    /** Явно выставить счётчик несданных (после загрузки списка ДЗ). */
    fun setPendingHomeworks(n: Int) { _pendingHomeworksCount.value = n }

    /** Обновить счётчик несданных ДЗ (как syncNotif на вебе). */
    fun refreshHomeworkBadge() {
        viewModelScope.launch {
            runCatching { homework.myHomeworksSummary() }.getOrNull()?.let {
                _pendingHomeworksCount.value = it.pendingCount
            }
        }
    }
}
