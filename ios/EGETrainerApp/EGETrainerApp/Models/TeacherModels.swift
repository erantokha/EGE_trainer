import Foundation

// MARK: - list_my_students

struct StudentListItem: Decodable, Identifiable, Hashable {
    var studentId: String
    var email: String?
    var firstName: String?
    var lastName: String?
    var studentGrade: Int?
    var linkedAt: String?

    enum CodingKeys: String, CodingKey {
        case email
        case studentId = "student_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case studentGrade = "student_grade"
        case linkedAt = "linked_at"
    }

    var id: String { studentId }

    var displayName: String {
        let name = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        if !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        return email ?? "Ученик"
    }
}

// MARK: - teacher_students_summary

struct StudentSummary: Decodable {
    var studentId: String
    var lastSeenAt: String?
    var activityTotal: Int?
    var last10Total: Int?
    var last10Correct: Int?
    var coveredTopicsAllTime: Int?

    enum CodingKeys: String, CodingKey {
        case studentId = "student_id"
        case lastSeenAt = "last_seen_at"
        case activityTotal = "activity_total"
        case last10Total = "last10_total"
        case last10Correct = "last10_correct"
        case coveredTopicsAllTime = "covered_topics_all_time"
    }
}

// MARK: - consent: запросы учителя (исходящие) и ученика (входящие)

struct OutgoingStudentRequest: Decodable, Identifiable {
    var requestId: String
    var studentEmail: String?
    var status: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case status
        case requestId = "request_id"
        case studentEmail = "student_email"
        case createdAt = "created_at"
    }

    var id: String { requestId }
}

struct IncomingTeacherRequest: Decodable, Identifiable {
    var requestId: String
    var teacherId: String?
    var teacherName: String?
    var teacherEmail: String?
    var createdAt: String?
    var status: String?

    enum CodingKeys: String, CodingKey {
        case status
        case requestId = "request_id"
        case teacherId = "teacher_id"
        case teacherName = "teacher_name"
        case teacherEmail = "teacher_email"
        case createdAt = "created_at"
    }

    var id: String { requestId }
}

struct MyTeacher: Decodable, Identifiable {
    var teacherId: String
    var teacherName: String?
    var teacherEmail: String?
    var linkedAt: String?

    enum CodingKeys: String, CodingKey {
        case teacherId = "teacher_id"
        case teacherName = "teacher_name"
        case teacherEmail = "teacher_email"
        case linkedAt = "linked_at"
    }

    var id: String { teacherId }
    var displayName: String { teacherName ?? teacherEmail ?? "Преподаватель" }
}

// MARK: - list_student_attempts

struct StudentAttemptRow: Decodable, Identifiable {
    var attemptId: String
    var homeworkId: String?
    var homeworkTitle: String?
    var total: Int?
    var correct: Int?
    var startedAt: String?
    var finishedAt: String?
    var durationMs: Int?

    enum CodingKeys: String, CodingKey {
        case total, correct
        case attemptId = "attempt_id"
        case homeworkId = "homework_id"
        case homeworkTitle = "homework_title"
        case startedAt = "started_at"
        case finishedAt = "finished_at"
        case durationMs = "duration_ms"
    }

    var id: String { attemptId }
}

// MARK: - teacher_picking_screen_v2

struct PickingScreen: Decodable {
    var screen: PickingScreenMeta?
    var sections: [PickSection]?
    var student: PickingStudent?

    struct PickingScreenMeta: Decodable {
        var mode: String?
        var canPick: Bool?
        var sessionSeed: String?
        var supportedFilters: [String]?

        enum CodingKeys: String, CodingKey {
            case mode
            case canPick = "can_pick"
            case sessionSeed = "session_seed"
            case supportedFilters = "supported_filters"
        }
    }

    struct PickingStudent: Decodable {
        var days: Int?
        var source: String?
        var studentId: String?

        enum CodingKeys: String, CodingKey {
            case days, source
            case studentId = "student_id"
        }
    }
}

struct PickSection: Decodable, Identifiable {
    var sectionId: String
    var title: String?
    var sortOrder: Int?
    var filterCounts: FilterCounts?
    var topics: [PickTopic]?

    enum CodingKeys: String, CodingKey {
        case title, topics
        case sectionId = "section_id"
        case sortOrder = "sort_order"
        case filterCounts = "filter_counts"
    }

    var id: String { sectionId }
}

struct PickTopic: Decodable, Identifiable {
    var topicId: String
    var title: String?
    var sortOrder: Int?
    var coverage: PickCoverage?
    var progress: PickProgress?
    var topicState: PickTopicState?
    var filterCounts: FilterCounts?

    enum CodingKeys: String, CodingKey {
        case title, coverage, progress
        case topicId = "topic_id"
        case sortOrder = "sort_order"
        case topicState = "topic_state"
        case filterCounts = "filter_counts"
    }

    var id: String { topicId }
}

struct PickCoverage: Decodable {
    var totalProtoCount: Int?
    var coveredProtoCount: Int?

    enum CodingKeys: String, CodingKey {
        case totalProtoCount = "total_proto_count"
        case coveredProtoCount = "covered_proto_count"
    }
}

struct PickProgress: Decodable {
    var allTimePct: Int?
    var lastSeenAt: String?
    var attemptCountTotal: Int?
    var correctCountTotal: Int?
    var subtopicLast3AvgPct: Double?

    enum CodingKeys: String, CodingKey {
        case allTimePct = "all_time_pct"
        case lastSeenAt = "last_seen_at"
        case attemptCountTotal = "attempt_count_total"
        case correctCountTotal = "correct_count_total"
        case subtopicLast3AvgPct = "subtopic_last3_avg_pct"
    }
}

struct PickTopicState: Decodable {
    var isStale: Bool?
    var isLowSeen: Bool?
    var isNotSeen: Bool?
    var isUnstable: Bool?

    enum CodingKeys: String, CodingKey {
        case isStale = "is_stale"
        case isLowSeen = "is_low_seen"
        case isNotSeen = "is_not_seen"
        case isUnstable = "is_unstable"
    }
}

struct FilterCounts: Decodable {
    var stale: Int?
    var unstable: Int?
    var unseenLow: Int?
    var weakSpots: Int?

    enum CodingKeys: String, CodingKey {
        case stale, unstable
        case unseenLow = "unseen_low"
        case weakSpots = "weak_spots"
    }
}

// MARK: - teacher_picking_resolve_batch_v1

// MARK: - Статистика прототипов (proto_last3_*, question_stats_for_teacher_*)

/// Бейдж «последние 3 попытки» по базовому прототипу (unic_id);
/// self-версия дополнительно отдаёт total/correct/last_attempt_at.
struct ProtoLast3Stat: Decodable {
    var unicId: String
    var last3Total: Int? = nil
    var last3Correct: Int? = nil
    var total: Int? = nil
    var correct: Int? = nil
    var lastAttemptAt: String? = nil

    enum CodingKeys: String, CodingKey {
        case unicId = "unic_id"
        case last3Total = "last3_total"
        case last3Correct = "last3_correct"
        case total, correct
        case lastAttemptAt = "last_attempt_at"
    }
}

struct QuestionStat: Decodable {
    var questionId: String
    var total: Int?
    var correct: Int?
    var last3Total: Int?
    var last3Correct: Int?
    var lastAttemptAt: String?

    enum CodingKeys: String, CodingKey {
        case questionId = "question_id"
        case total, correct
        case last3Total = "last3_total"
        case last3Correct = "last3_correct"
        case lastAttemptAt = "last_attempt_at"
    }
}

struct ResolveBatchResult: Decodable {
    var pickedQuestions: [ResolvedQuestion]?
    var shortages: [ResolveShortage]?

    enum CodingKeys: String, CodingKey {
        case pickedQuestions = "picked_questions"
        case shortages
    }
}

struct ResolveShortage: Decodable {
    var scopeId: String?
    var isShortage: Bool?
    var requestedN: Int?
    var returnedN: Int?
    var message: String?

    enum CodingKeys: String, CodingKey {
        case message
        case scopeId = "scope_id"
        case isShortage = "is_shortage"
        case requestedN = "requested_n"
        case returnedN = "returned_n"
    }
}

/// Вопрос из resolve-батча. question_id + topic_id достаточно для
/// создания ДЗ (frozen_questions) и резолва текста через ContentService.
struct ResolvedQuestion: Decodable, Identifiable, Hashable {
    var questionId: String
    var topicId: String?
    var protoId: String?
    var manifestPath: String?
    /// Атрибуция бакета из ответа батча (для клиентской ротации по бакетам).
    var scopeKind: String?
    var scopeId: String?

    enum CodingKeys: String, CodingKey {
        case questionId = "question_id"
        case topicId = "topic_id"
        case protoId = "proto_id"
        case manifestPath = "manifest_path"
        case scopeKind = "scope_kind"
        case scopeId = "scope_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        questionId = try c.decode(String.self, forKey: .questionId)
        topicId = try c.decodeIfPresent(String.self, forKey: .topicId)
        protoId = try c.decodeIfPresent(String.self, forKey: .protoId)
        manifestPath = try c.decodeIfPresent(String.self, forKey: .manifestPath)
        scopeKind = try c.decodeIfPresent(String.self, forKey: .scopeKind)
        scopeId = try c.decodeIfPresent(String.self, forKey: .scopeId)
    }

    init(questionId: String, topicId: String?, protoId: String? = nil, manifestPath: String? = nil,
         scopeKind: String? = nil, scopeId: String? = nil) {
        self.questionId = questionId
        self.topicId = topicId
        self.protoId = protoId
        self.manifestPath = manifestPath
        self.scopeKind = scopeKind
        self.scopeId = scopeId
    }

    var id: String { questionId }
}

// MARK: - создание ДЗ (REST insert)

struct HomeworkRow: Decodable {
    var id: String
    var title: String?
}

struct HomeworkLinkRow: Decodable {
    var id: String?
    var token: String?
}
