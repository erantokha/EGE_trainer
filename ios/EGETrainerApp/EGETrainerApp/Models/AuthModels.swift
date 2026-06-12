import Foundation

/// Сессия Supabase Auth (ответ /auth/v1/token).
struct AuthSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: TimeInterval // unix seconds
    var user: AuthUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case expiresIn = "expires_in"
        case user
    }

    init(accessToken: String, refreshToken: String, expiresAt: TimeInterval, user: AuthUser) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.user = user
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        user = try c.decode(AuthUser.self, forKey: .user)
        if let at = try c.decodeIfPresent(TimeInterval.self, forKey: .expiresAt) {
            expiresAt = at
        } else {
            let expIn = (try c.decodeIfPresent(TimeInterval.self, forKey: .expiresIn)) ?? 3600
            expiresAt = Date().timeIntervalSince1970 + expIn
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresAt, forKey: .expiresAt)
        try c.encode(user, forKey: .user)
    }

    var isExpiringSoon: Bool {
        expiresAt - Date().timeIntervalSince1970 < 60
    }
}

struct AuthUser: Codable, Equatable {
    var id: String
    var email: String?
}

/// Строка таблицы profiles (читается под RLS своим токеном).
struct Profile: Codable, Equatable {
    var id: String
    var email: String?
    var role: String?            // "student" | "teacher"
    var firstName: String?
    var lastName: String?
    var studentGrade: Int?
    var teacherType: String?
    var profileCompleted: Bool?

    enum CodingKeys: String, CodingKey {
        case id, email, role
        case firstName = "first_name"
        case lastName = "last_name"
        case studentGrade = "student_grade"
        case teacherType = "teacher_type"
        case profileCompleted = "profile_completed"
    }

    var isTeacher: Bool { role == "teacher" }

    /// Профиль требует completion-шага (как редирект на google_complete.html):
    /// нет валидной роли либо явный profile_completed=false после OAuth-signup.
    var needsCompletion: Bool {
        let r = (role ?? "").trimmingCharacters(in: .whitespaces)
        if r != "student" && r != "teacher" { return true }
        return profileCompleted == false
    }

    var displayName: String {
        let name = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        if !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        if let email, let local = email.split(separator: "@").first { return String(local) }
        return "Пользователь"
    }

    /// Имя для start_homework_attempt — как inferNameFromUser в вебе.
    var hwStudentName: String {
        if let f = firstName, !f.trimmingCharacters(in: .whitespaces).isEmpty { return f }
        if let email, let local = email.split(separator: "@").first { return String(local) }
        return "Ученик"
    }
}
