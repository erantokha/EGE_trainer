import SwiftUI

/// Корневой роутер: восстановление сессии -> auth -> главная по роли
/// (зеркало tasks/home_router.js: student -> home_student, teacher -> home_teacher).
struct RootView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        #if DEBUG
        if let demo = ProcessInfo.processInfo.environment["E2E_DEMO"], !demo.isEmpty {
            return AnyView(DemoGalleryView(kind: demo))
        }
        #endif
        return AnyView(mainBody)
    }

    private var mainBody: some View {
        Group {
            switch app.phase {
            case .launching:
                VStack(spacing: 16) {
                    BrandLogo()
                    ProgressView()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.bg)
            case .signedOut:
                AuthView()
            case .signedIn(let profile):
                if profile.needsCompletion {
                    CompleteProfileView()
                } else if profile.isTeacher {
                    TeacherTabView()
                } else {
                    StudentTabView()
                }
            }
        }
        .task {
            if case .launching = app.phase {
                await app.bootstrap()
                await debugAutoLoginIfRequested()
            }
        }
    }

    /// DEBUG-хук для скриптовой приёмки в Simulator: simctl launch с
    /// SIMCTL_CHILD_E2E_EMAIL/_PASSWORD форсирует вход под этими кредами,
    /// даже если в Keychain есть другая сессия (в релизе выключено).
    private func debugAutoLoginIfRequested() async {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        guard let email = env["E2E_EMAIL"], let password = env["E2E_PASSWORD"],
              !email.isEmpty, !password.isEmpty else { return }
        if case .signedIn(let p) = app.phase {
            if p.email?.lowercased() == email.lowercased() { return }
            await app.signOut()
        }
        try? await app.signIn(email: email, password: password)
        #endif
    }
}

/// Логотип «EGE-trainer» (как на экране входа веба).
struct BrandLogo: View {
    var body: some View {
        HStack(spacing: 0) {
            Text("EGE")
                .font(.title.weight(.bold))
                .foregroundStyle(Theme.text)
            Text("-trainer")
                .font(.title.weight(.bold))
                .foregroundStyle(Theme.accent)
        }
    }
}
