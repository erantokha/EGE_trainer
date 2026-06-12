import Foundation
import SwiftUI

/// Глобальное состояние приложения: сессия + профиль + роль.
@MainActor
final class AppState: ObservableObject {
    enum Phase {
        case launching          // восстановление сессии при старте
        case signedOut
        case signedIn(Profile)
    }

    @Published var phase: Phase = .launching

    /// Несданные ДЗ — бейдж на табе «Мои ДЗ» (паритет красной точки сайдбара веба).
    @Published var pendingHomeworksCount = 0

    let auth = AuthService()
    let homework = HomeworkService()
    let student = StudentService()
    let teacher = TeacherService()
    let content = ContentService.shared

    var profile: Profile? {
        if case .signedIn(let p) = phase { return p }
        return nil
    }

    /// Восстановление сессии при запуске (сценарий C: пользователь остаётся залогинен).
    func bootstrap() async {
        guard let _ = await auth.restoreSession() else {
            phase = .signedOut
            return
        }
        do {
            let profile = try await auth.fetchMyProfile()
            phase = .signedIn(profile)
        } catch {
            // Сессия есть, но профиль не загрузился (сеть?) — не выкидываем на логин,
            // пробуем ещё раз; после второй неудачи остаёмся на signedOut.
            if let profile = try? await auth.fetchMyProfile() {
                phase = .signedIn(profile)
            } else {
                phase = .signedOut
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        _ = try await auth.signIn(email: email, password: password)
        let profile = try await auth.fetchMyProfile()
        phase = .signedIn(profile)
    }

    #if os(iOS)
    private let googleFlow = GoogleSignInFlow()

    /// Google-вход: PKCE через ASWebAuthenticationSession (зеркало
    /// signInWithGoogle веба). Профиль может требовать completion-шага —
    /// роутинг по profile.needsCompletion в RootView (как google_complete.html).
    func signInWithGoogle() async throws {
        let pkce = PKCEPair()
        let url = await SupabaseClient.shared.oauthAuthorizeURL(
            provider: "google",
            redirectTo: GoogleSignInFlow.redirectURL,
            codeChallenge: pkce.challenge
        )
        let code = try await googleFlow.authorize(url: url)
        _ = try await SupabaseClient.shared.exchangeOAuthCode(code, codeVerifier: pkce.verifier)
        let profile = try await auth.fetchMyProfile()
        phase = .signedIn(profile)
    }
    #endif

    func signOut() async {
        await auth.signOut()
        phase = .signedOut
    }

    func reloadProfile() async {
        if let profile = try? await auth.fetchMyProfile() {
            phase = .signedIn(profile)
        }
    }

    /// Обновить счётчик несданных ДЗ (вызывается с таба, после сдачи ДЗ
    /// и из «Мои ДЗ» — как syncNotif на вебе).
    func refreshHomeworkBadge() async {
        if let s = try? await homework.myHomeworksSummary() {
            pendingHomeworksCount = s.pendingCount
        }
    }
}
