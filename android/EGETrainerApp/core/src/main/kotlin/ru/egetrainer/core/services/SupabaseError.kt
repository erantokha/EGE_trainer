package ru.egetrainer.core.services

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import ru.egetrainer.core.AppJson

/**
 * Единый формат ошибок сетевого слоя — человекочитаемые сообщения для UI,
 * без сырых JSON/RPC_ERROR (зеркало SupabaseError.swift, тексты 1-в-1).
 */
sealed class SupabaseError(val userMessage: String, cause: Throwable? = null) :
    Exception(userMessage, cause) {

    class Network(cause: Throwable? = null) :
        SupabaseError("Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.", cause)

    class Timeout :
        SupabaseError("Сервер не ответил вовремя. Попробуйте ещё раз.")

    class AuthRequired :
        SupabaseError("Нужно войти в аккаунт.")

    class InvalidCredentials(message: String) :
        SupabaseError(message)

    class AccessDenied :
        SupabaseError("Нет доступа к этим данным.")

    class Http(val status: Int, val serverMessage: String) :
        SupabaseError(
            if (serverMessage.isEmpty()) "Ошибка сервера ($status). Попробуйте позже."
            else serverMessage
        )

    class Decoding(val detail: String) :
        SupabaseError("Не удалось обработать ответ сервера.")

    class EmptyResponse :
        SupabaseError("Сервер вернул пустой ответ.")

    class Cancelled :
        SupabaseError("Действие отменено.")

    companion object {
        /** Маппинг ошибок GoTrue в понятный пользователю текст (зеркало fromAuthBody). */
        fun fromAuthBody(status: Int, body: ByteArray): SupabaseError {
            val obj = runCatching {
                AppJson.parseToJsonElement(body.decodeToString()) as? JsonObject
            }.getOrNull()

            fun str(key: String): String? =
                (obj?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content

            val raw = str("msg") ?: str("message") ?: str("error_description") ?: ""
            val code = str("error_code") ?: ""
            val lower = raw.lowercase()

            if (status == 400 || status == 401) {
                if (code == "invalid_credentials" || lower.contains("invalid login")) {
                    return InvalidCredentials("Неверный email или пароль.")
                }
                if (lower.contains("email not confirmed")) {
                    return InvalidCredentials("Email не подтверждён. Проверьте почту.")
                }
            }
            if (lower.contains("already registered") || lower.contains("user already") ||
                lower.contains("email address is already")
            ) {
                // как маппинг в tasks/auth.js
                return InvalidCredentials(
                    "Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сменить пароль»."
                )
            }
            return Http(status, raw)
        }
    }
}
