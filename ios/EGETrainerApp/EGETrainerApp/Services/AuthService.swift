import Foundation

/// Авторизация и профиль (зеркало auth-flow веба: login -> profiles.role -> роутинг по роли).
struct AuthService {
    let client: SupabaseClient

    init(client: SupabaseClient = .shared) {
        self.client = client
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        try await client.signIn(
            email: email.trimmingCharacters(in: .whitespaces).lowercased(),
            password: password
        )
    }

    func signOut() async {
        await client.signOut()
    }

    func restoreSession() async -> AuthSession? {
        await client.restoreSession()
    }

    /// Профиль текущего пользователя (RLS отдаёт только свою строку).
    func fetchMyProfile() async throws -> Profile {
        let rows = try await client.select(
            "profiles",
            query: [URLQueryItem(name: "select", value: "*")],
            as: [Profile].self
        )
        guard let profile = rows.first else { throw SupabaseError.emptyResponse }
        return profile
    }

    /// update_my_profile — контракт tasks/profile.js и google_complete.js:
    /// p_first_name / p_last_name / p_role / p_teacher_type / p_student_grade.
    func updateMyProfile(firstName: String, lastName: String, role: String,
                         teacherType: String?, studentGrade: Int?) async throws {
        try await client.rpcVoid("update_my_profile", params: [
            "p_first_name": .string(firstName),
            "p_last_name": .string(lastName),
            "p_role": .string(role),
            "p_teacher_type": role == "teacher" ? (teacherType.map { .string($0) } ?? .null) : .null,
            "p_student_grade": role == "student" ? (studentGrade.map { .number(Double($0)) } ?? .null) : .null,
        ])
    }

    /// delete_my_account — удаление аккаунта (как tasks/profile.js: чистит попытки,
    /// связи и пользователя auth.users).
    func deleteMyAccount() async throws {
        try await client.rpcVoid("delete_my_account", params: [:])
        await client.signOut()
    }

    // MARK: - Регистрация / сброс (red-zone WIOS.1 §5.7, одобрено оператором)

    /// URL веб-callback подтверждения почты (как callback в tasks/auth.js).
    private var emailCallbackURL: URL {
        SupabaseConfig.siteBaseURL.appendingPathComponent("tasks/auth_callback.html")
    }

    /// Регистрация (signUpWithPassword веба): meta = role/имя/класс|тип.
    /// Возвращает true, если сессия выдана сразу (без email-confirm).
    func signUp(email: String, password: String, role: String,
                firstName: String, lastName: String,
                teacherType: String?, studentGrade: Int?) async throws -> Bool {
        var meta: [String: JSONValue] = [
            "role": .string(role),
            "first_name": .string(firstName),
            "last_name": .string(lastName),
            "teacher_type": .null,
            "student_grade": .null,
        ]
        if role == "teacher", let teacherType { meta["teacher_type"] = .string(teacherType) }
        if role == "student", let studentGrade { meta["student_grade"] = .number(Double(studentGrade)) }
        return try await client.signUp(
            email: email.trimmingCharacters(in: .whitespaces).lowercased(),
            password: password,
            meta: meta,
            emailRedirectTo: emailCallbackURL
        )
    }

    func resendSignupEmail(email: String) async throws {
        try await client.resendSignupEmail(
            email: email.trimmingCharacters(in: .whitespaces).lowercased(),
            emailRedirectTo: emailCallbackURL
        )
    }

    /// Письмо сброса пароля; смена пароля завершается на вебе (auth_reset.html).
    func sendPasswordReset(email: String) async throws {
        try await client.sendPasswordReset(
            email: email.trimmingCharacters(in: .whitespaces).lowercased(),
            redirectTo: SupabaseConfig.siteBaseURL.appendingPathComponent("tasks/auth_reset.html")
        )
    }
}
