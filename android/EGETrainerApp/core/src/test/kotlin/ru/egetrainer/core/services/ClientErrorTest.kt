package ru.egetrainer.core.services

import ru.egetrainer.core.models.AuthSession
import ru.egetrainer.core.models.AuthUser
import java.security.MessageDigest
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Юниты сетевого ядра без сети: маппинг ошибок GoTrue, тексты ошибок,
 * PKCE-инварианты, граница авто-refresh. Гейт П-Т4 п.2 (WAND_0_PLAN §9).
 */
class ClientErrorTest {

    // MARK: SupabaseError.fromAuthBody — маппинг GoTrue (зеркало iOS)

    @Test
    fun `invalid_credentials maps to human message`() {
        val e = SupabaseError.fromAuthBody(
            400,
            """{"error_code":"invalid_credentials","msg":"Invalid login credentials"}""".toByteArray()
        )
        assertIs<SupabaseError.InvalidCredentials>(e)
        assertEquals("Неверный email или пароль.", e.userMessage)
    }

    @Test
    fun `invalid login text maps without error_code`() {
        val e = SupabaseError.fromAuthBody(
            400, """{"msg":"Invalid login credentials"}""".toByteArray()
        )
        assertIs<SupabaseError.InvalidCredentials>(e)
        assertEquals("Неверный email или пароль.", e.userMessage)
    }

    @Test
    fun `email not confirmed maps to confirm hint`() {
        val e = SupabaseError.fromAuthBody(
            401, """{"msg":"Email not confirmed"}""".toByteArray()
        )
        assertIs<SupabaseError.InvalidCredentials>(e)
        assertEquals("Email не подтверждён. Проверьте почту.", e.userMessage)
    }

    @Test
    fun `already registered maps to signin hint as in tasks-auth-js`() {
        val e = SupabaseError.fromAuthBody(
            422, """{"msg":"User already registered"}""".toByteArray()
        )
        assertIs<SupabaseError.InvalidCredentials>(e)
        assertTrue(e.userMessage.contains("уже зарегистрирован"))
    }

    @Test
    fun `unknown auth error falls back to http with raw message`() {
        val e = SupabaseError.fromAuthBody(
            500, """{"msg":"boom"}""".toByteArray()
        )
        assertIs<SupabaseError.Http>(e)
        assertEquals(500, e.status)
        assertEquals("boom", e.userMessage)
    }

    @Test
    fun `http error with empty message uses generic text`() {
        val e = SupabaseError.Http(503, "")
        assertEquals("Ошибка сервера (503). Попробуйте позже.", e.userMessage)
    }

    @Test
    fun `error texts match ios parity`() {
        assertEquals(
            "Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.",
            SupabaseError.Network(null).userMessage
        )
        assertEquals("Сервер не ответил вовремя. Попробуйте ещё раз.", SupabaseError.Timeout().userMessage)
        assertEquals("Нужно войти в аккаунт.", SupabaseError.AuthRequired().userMessage)
        assertEquals("Нет доступа к этим данным.", SupabaseError.AccessDenied().userMessage)
        assertEquals("Не удалось обработать ответ сервера.", SupabaseError.Decoding("x").userMessage)
        assertEquals("Сервер вернул пустой ответ.", SupabaseError.EmptyResponse().userMessage)
    }

    // MARK: PKCE (S256)

    @Test
    fun `pkce verifier length is within rfc bounds and challenge is sha256 base64url`() {
        val pair = PKCEPair()
        assertTrue(pair.verifier.length in 43..128, "verifier len=${pair.verifier.length}")
        // base64url-алфавит без паддинга
        assertTrue(Regex("^[A-Za-z0-9_-]+$").matches(pair.verifier))
        val expected = Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(pair.verifier.toByteArray(Charsets.UTF_8))
        )
        assertEquals(expected, pair.challenge)
    }

    @Test
    fun `pkce pairs are unique`() {
        assertFalse(PKCEPair().verifier == PKCEPair().verifier)
    }

    // MARK: авто-refresh граница (<60 с до истечения)

    @Test
    fun `session expiring in 59s is expiring soon and in 120s is not`() {
        val now = System.currentTimeMillis() / 1000.0
        val soon = AuthSession("a", "r", expiresAt = now + 59, user = AuthUser("u"))
        val fine = AuthSession("a", "r", expiresAt = now + 120, user = AuthUser("u"))
        assertTrue(soon.isExpiringSoon)
        assertFalse(fine.isExpiringSoon)
    }

    // MARK: oauth authorize URL — параметры PKCE

    @Test
    fun `oauth authorize url contains pkce params and redirect`() {
        val url = oauthAuthorizeURL("google", "egetrainer://auth-callback", "CHLG")
        assertTrue(url.startsWith("${SupabaseConfig.BASE_URL}/auth/v1/authorize?"))
        assertTrue(url.contains("provider=google"))
        assertTrue(url.contains("code_challenge=CHLG"))
        assertTrue(url.contains("code_challenge_method=s256"))
        assertTrue(url.contains("redirect_to=egetrainer%3A%2F%2Fauth-callback"))
    }
}
