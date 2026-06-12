import Foundation

/// Черновик незавершённой тренировки — iOS-эквивалент tasks_session_v1
/// (trainer.js): набор замороженных refs + введённые ответы. Позволяет
/// продолжить тренировку после перезапуска приложения.
enum TrainingDraftStore {
    struct Draft: Codable {
        var refs: [QuestionRef]
        var answers: [String: String]   // "topicId|questionId" -> ответ
        var mode: String                // "list" | "test"
        var shuffle: Bool
        var savedAt: Date
    }

    private static let key = "training_draft_v1"
    private static let maxAge: TimeInterval = 12 * 3600 // как REPORT_MAX_AGE_MS веба

    static func save(_ draft: Draft) {
        if let data = try? JSONEncoder().encode(draft) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func load() -> Draft? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let draft = try? JSONDecoder().decode(Draft.self, from: data)
        else { return nil }
        guard Date().timeIntervalSince(draft.savedAt) <= maxAge, !draft.refs.isEmpty else {
            clear()
            return nil
        }
        return draft
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
