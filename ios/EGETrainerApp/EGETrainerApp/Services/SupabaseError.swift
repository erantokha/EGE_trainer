import Foundation

/// Единый формат ошибок сетевого слоя — человекочитаемые сообщения для UI,
/// без сырых JSON/RPC_ERROR (требование паритета с error-states веба).
enum SupabaseError: LocalizedError {
    case network(underlying: Error)
    case timeout
    case authRequired
    case invalidCredentials(message: String)
    case accessDenied
    case http(status: Int, message: String)
    case decoding(message: String)
    case emptyResponse
    case cancelled

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Действие отменено."
        case .network:
            return "Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз."
        case .timeout:
            return "Сервер не ответил вовремя. Попробуйте ещё раз."
        case .authRequired:
            return "Нужно войти в аккаунт."
        case .invalidCredentials(let message):
            return message
        case .accessDenied:
            return "Нет доступа к этим данным."
        case .http(let status, let message):
            return message.isEmpty ? "Ошибка сервера (\(status)). Попробуйте позже." : message
        case .decoding:
            return "Не удалось обработать ответ сервера."
        case .emptyResponse:
            return "Сервер вернул пустой ответ."
        }
    }

    /// Маппинг ошибок GoTrue в понятный пользователю текст.
    static func fromAuthBody(status: Int, body: Data) -> SupabaseError {
        struct AuthErr: Decodable {
            let msg: String?
            let message: String?
            let error_description: String?
            let error_code: String?
        }
        let parsed = try? JSONDecoder().decode(AuthErr.self, from: body)
        let raw = parsed?.msg ?? parsed?.message ?? parsed?.error_description ?? ""
        let code = parsed?.error_code ?? ""
        if status == 400 || status == 401 {
            if code == "invalid_credentials" || raw.lowercased().contains("invalid login") {
                return .invalidCredentials(message: "Неверный email или пароль.")
            }
            if raw.lowercased().contains("email not confirmed") {
                return .invalidCredentials(message: "Email не подтверждён. Проверьте почту.")
            }
        }
        let lower = raw.lowercased()
        if lower.contains("already registered") || lower.contains("user already")
            || lower.contains("email address is already") {
            // как маппинг в tasks/auth.js
            return .invalidCredentials(
                message: "Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сменить пароль».")
        }
        return .http(status: status, message: raw)
    }
}
