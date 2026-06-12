import Foundation
#if os(iOS)
import AuthenticationServices
import UIKit

/// Вход через Google: ASWebAuthenticationSession + PKCE — эквивалент
/// signInWithOAuth({provider:'google'}) веба. Redirect-scheme перехватывается
/// самой сессией (регистрация в Info.plist не требуется).
///
/// ВАЖНО (post-wave, действие оператора): redirect-URL
/// `egetrainer://auth-callback` должен быть добавлен в Supabase Dashboard →
/// Auth → URL Configuration → Redirect URLs. До этого Supabase вернёт
/// ошибку redirect_to не из allow-list.
@MainActor
final class GoogleSignInFlow: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let redirectScheme = "egetrainer"
    static let redirectURL = "egetrainer://auth-callback"

    private var session: ASWebAuthenticationSession?

    /// Запускает OAuth-флоу; возвращает код авторизации из callback.
    func authorize(url: URL) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: Self.redirectScheme
            ) { callbackURL, error in
                if let error {
                    if case ASWebAuthenticationSessionError.canceledLogin = error {
                        continuation.resume(throwing: SupabaseError.cancelled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let callbackURL,
                      let comps = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                      let code = comps.queryItems?.first(where: { $0.name == "code" })?.value,
                      !code.isEmpty
                else {
                    // Supabase мог вернуть error_description в query
                    let desc = URLComponents(url: callbackURL ?? URL(string: "x://x")!,
                                             resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "error_description" })?.value
                    continuation.resume(throwing: SupabaseError.http(
                        status: 0,
                        message: desc ?? "Не удалось получить код авторизации Google."
                    ))
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: SupabaseError.http(
                    status: 0, message: "Не удалось открыть окно входа Google."))
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
#endif
