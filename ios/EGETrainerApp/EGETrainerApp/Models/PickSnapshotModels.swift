import Foundation

// MARK: - student_picking_snapshot_v1 (WIOS.2)
// «Витрина» состояния ученика для локального фильтр-подбора.
// Контракт: docs/supabase/student_picking_snapshot_v1.sql,
// спека docs/navigation/picking_resolve_semantics_spec.md §10.

struct PickSnapshot: Decodable {
    var meta: PickSnapshotMeta
    var sections: [String]
    var protos: [PickSnapshotProto]
    var topics: [PickSnapshotTopic]
    /// question_id -> total из student_question_stats (только total>0)
    var qstats: [String: Int]
    var manifestPaths: [String]
    /// unic_id -> [[question_id, manifest_path_idx]]
    var questions: [String: [PickSnapshotQuestionRef]]

    enum CodingKeys: String, CodingKey {
        case meta, sections, protos, topics, qstats, questions
        case manifestPaths = "manifest_paths"
    }
}

struct PickSnapshotMeta: Decodable {
    var studentId: String
    var source: String
    var generatedAt: String
    var catalogVersion: String?

    enum CodingKeys: String, CodingKey {
        case studentId = "student_id"
        case source
        case generatedAt = "generated_at"
        case catalogVersion = "catalog_version"
    }
}

struct PickSnapshotProto: Decodable {
    var unicId: String
    var themeId: String
    var subtopicId: String
    var attemptCountTotal: Int
    var correctCountTotal: Int
    var uniqueQuestionIdsSeen: Int
    var lastAttemptAt: String?
    var accuracy: Double?
    var hasIndependentCorrect: Bool
    var isNotSeen: Bool
    var isLowSeen: Bool
    var isWeak: Bool
    var isStale: Bool
    var isUnstable: Bool
    var last3Total: Int?
    var last3Correct: Int?

    enum CodingKeys: String, CodingKey {
        case unicId = "unic_id"
        case themeId = "theme_id"
        case subtopicId = "subtopic_id"
        case attemptCountTotal = "attempt_count_total"
        case correctCountTotal = "correct_count_total"
        case uniqueQuestionIdsSeen = "unique_question_ids_seen"
        case lastAttemptAt = "last_attempt_at"
        case accuracy
        case hasIndependentCorrect = "has_independent_correct"
        case isNotSeen = "is_not_seen"
        case isLowSeen = "is_low_seen"
        case isWeak = "is_weak"
        case isStale = "is_stale"
        case isUnstable = "is_unstable"
        case last3Total = "last3_total"
        case last3Correct = "last3_correct"
    }
}

struct PickSnapshotTopic: Decodable {
    var subtopicId: String
    var themeId: String
    var isNotSeen: Bool
    var isLowSeen: Bool
    var isStale: Bool
    var isUnstable: Bool

    enum CodingKeys: String, CodingKey {
        case subtopicId = "subtopic_id"
        case themeId = "theme_id"
        case isNotSeen = "is_not_seen"
        case isLowSeen = "is_low_seen"
        case isStale = "is_stale"
        case isUnstable = "is_unstable"
    }
}

/// Элемент `questions{unic}`: гетерогенная пара [question_id, path_idx].
struct PickSnapshotQuestionRef: Decodable {
    var questionId: String
    var pathIdx: Int

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        questionId = try c.decode(String.self)
        pathIdx = try c.decode(Int.self)
    }
}
