import Foundation

// MARK: - student_my_homeworks_summary

struct HomeworkSummary: Decodable {
    var items: [HomeworkListItem]
    var totalCount: Int
    var archiveCount: Int
    var pendingCount: Int

    enum CodingKeys: String, CodingKey {
        case items
        case totalCount = "total_count"
        case archiveCount = "archive_count"
        case pendingCount = "pending_count"
    }
}

struct HomeworkListItem: Decodable, Identifiable {
    var title: String?
    var token: String
    var assignedAt: String?
    var homeworkId: String
    var isSubmitted: Bool
    var submittedAt: String?
    var assignmentId: String?
    var correct: Int?
    var total: Int?

    enum CodingKeys: String, CodingKey {
        case title, token, correct, total
        case assignedAt = "assigned_at"
        case homeworkId = "homework_id"
        case isSubmitted = "is_submitted"
        case submittedAt = "submitted_at"
        case assignmentId = "assignment_id"
    }

    var id: String { assignmentId ?? token }
    var displayTitle: String { (title?.isEmpty == false ? title! : "Домашнее задание") }
}

// MARK: - student_my_homeworks_archive

/// Страница архива: RPC может вернуть массив напрямую или { items: [...] }
/// (веб обрабатывает обе формы — tasks/my_homeworks_archive.js).
struct HomeworkArchivePage: Decodable {
    var items: [HomeworkArchiveItem]

    init(from decoder: Decoder) throws {
        if var arr = try? decoder.unkeyedContainer() {
            var out: [HomeworkArchiveItem] = []
            while !arr.isAtEnd { out.append(try arr.decode(HomeworkArchiveItem.self)) }
            items = out
        } else {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decodeIfPresent([HomeworkArchiveItem].self, forKey: .items) ?? []
        }
    }

    enum CodingKeys: String, CodingKey { case items }
}

/// Элемент архива — поля с веб-фоллбэками (token|hw_token|link_token и т.п.).
struct HomeworkArchiveItem: Decodable, Identifiable {
    var title: String?
    var token: String?
    var assignedAt: String?
    var submittedAt: String?
    private var isSubmittedFlag: Bool?
    var correct: Int?
    var total: Int?

    var id: String { token ?? "\(title ?? "")-\(assignedAt ?? "")" }
    var isSubmitted: Bool { isSubmittedFlag ?? (submittedAt != nil) }
    var displayTitle: String { (title?.isEmpty == false ? title! : "Домашнее задание") }

    enum K: String, CodingKey {
        case title, token, correct, total
        case hwToken = "hw_token"
        case linkToken = "link_token"
        case assignedAt = "assigned_at"
        case createdAt = "created_at"
        case issuedAt = "issued_at"
        case submittedAt = "submitted_at"
        case finishedAt = "finished_at"
        case isSubmitted = "is_submitted"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        token = (try? c.decodeIfPresent(String.self, forKey: .token))
            ?? (try? c.decodeIfPresent(String.self, forKey: .hwToken))
            ?? (try? c.decodeIfPresent(String.self, forKey: .linkToken))
        assignedAt = (try? c.decodeIfPresent(String.self, forKey: .assignedAt))
            ?? (try? c.decodeIfPresent(String.self, forKey: .createdAt))
            ?? (try? c.decodeIfPresent(String.self, forKey: .issuedAt))
        submittedAt = (try? c.decodeIfPresent(String.self, forKey: .submittedAt))
            ?? (try? c.decodeIfPresent(String.self, forKey: .finishedAt))
        isSubmittedFlag = try? c.decodeIfPresent(Bool.self, forKey: .isSubmitted)
        correct = try? c.decodeIfPresent(Int.self, forKey: .correct)
        total = try? c.decodeIfPresent(Int.self, forKey: .total)
    }
}

// MARK: - get_homework_by_token

struct Homework: Decodable {
    var homeworkId: String
    var title: String?
    var description: String?
    var specJson: HomeworkSpec?
    var frozenQuestions: [QuestionRef]?
    var seed: String?
    var attemptsPerStudent: Int?
    var kind: String?      // "graded" | "session"
    var isActive: Bool?

    enum CodingKeys: String, CodingKey {
        case title, description, seed, kind
        case homeworkId = "homework_id"
        case specJson = "spec_json"
        case frozenQuestions = "frozen_questions"
        case attemptsPerStudent = "attempts_per_student"
        case isActive = "is_active"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        homeworkId = try c.decode(String.self, forKey: .homeworkId)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        specJson = try c.decodeIfPresent(HomeworkSpec.self, forKey: .specJson)
        seed = try c.decodeIfPresent(String.self, forKey: .seed)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        attemptsPerStudent = try c.decodeIfPresent(Int.self, forKey: .attemptsPerStudent)
        isActive = try c.decodeIfPresent(Bool.self, forKey: .isActive)
        // frozen_questions может прийти и как jsonb-массив, и как сериализованная строка
        if let refs = try? c.decodeIfPresent([QuestionRef].self, forKey: .frozenQuestions) {
            frozenQuestions = refs
        } else if let s = try? c.decodeIfPresent(String.self, forKey: .frozenQuestions),
                  let data = s.data(using: .utf8),
                  let refs = try? JSONDecoder().decode([QuestionRef].self, from: data) {
            frozenQuestions = refs
        } else {
            frozenQuestions = nil
        }
    }

    /// Итоговый список ссылок на задачи (frozen приоритетнее fixed — как в hw.js).
    var questionRefs: [QuestionRef] {
        if let frozen = frozenQuestions, !frozen.isEmpty { return frozen }
        return specJson?.fixed ?? []
    }
}

struct HomeworkSpec: Decodable {
    var fixed: [QuestionRef]?
    var shuffle: Bool?
    var contentVersion: String?

    enum CodingKeys: String, CodingKey {
        case fixed, shuffle
        case contentVersion = "content_version"
    }
}

struct QuestionRef: Codable, Hashable {
    var topicId: String
    var questionId: String

    enum CodingKeys: String, CodingKey {
        case topicId = "topic_id"
        case questionId = "question_id"
    }
}

// MARK: - start_homework_attempt

struct StartAttemptResult: Decodable {
    var attemptId: String?
    var alreadyExists: Bool?
    var id: String?

    enum CodingKeys: String, CodingKey {
        case id
        case attemptId = "attempt_id"
        case alreadyExists = "already_exists"
    }

    var resolvedAttemptId: String? { attemptId ?? id }
}

// MARK: - get_homework_attempt_by_token / get_homework_attempt_for_teacher

struct HomeworkAttempt: Decodable {
    var id: String?
    var attemptId: String?
    var homeworkId: String?
    var homeworkTitle: String?
    var studentId: String?
    var studentName: String?
    var payload: AttemptPayload?
    var total: Int?
    var correct: Int?
    var durationMs: Int?
    var startedAt: String?
    var finishedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, payload, total, correct
        case attemptId = "attempt_id"
        case homeworkId = "homework_id"
        case homeworkTitle = "homework_title"
        case studentId = "student_id"
        case studentName = "student_name"
        case durationMs = "duration_ms"
        case startedAt = "started_at"
        case finishedAt = "finished_at"
    }

    var resolvedId: String? { attemptId ?? id }
    var isFinished: Bool { finishedAt != nil }
}

struct AttemptPayload: Codable {
    var title: String?
    var homeworkId: String?
    var studentName: String?
    var questions: [AttemptQuestion]?

    enum CodingKeys: String, CodingKey {
        case title, questions
        case homeworkId = "homework_id"
        case studentName = "student_name"
    }
}

/// Один отвеченный вопрос внутри payload попытки.
struct AttemptQuestion: Codable, Identifiable {
    var questionId: String?
    var topicId: String?
    var correct: Bool?
    var chosenText: String?
    var correctText: String?
    var normalizedText: String?
    var timeMs: Int?
    var difficulty: Int?

    enum CodingKeys: String, CodingKey {
        case correct, difficulty
        case questionId = "question_id"
        case topicId = "topic_id"
        case chosenText = "chosen_text"
        case correctText = "correct_text"
        case normalizedText = "normalized_text"
        case timeMs = "time_ms"
    }

    var id: String { questionId ?? UUID().uuidString }
}

// MARK: - submit_homework_attempt_v2

struct SubmitAttemptResult: Decodable {
    var attemptId: String?
    var alreadySubmitted: Bool?
    var total: Int?
    var correct: Int?
    var durationMs: Int?
    var finishedAt: String?

    enum CodingKeys: String, CodingKey {
        case total, correct
        case attemptId = "attempt_id"
        case alreadySubmitted = "already_submitted"
        case durationMs = "duration_ms"
        case finishedAt = "finished_at"
    }
}
