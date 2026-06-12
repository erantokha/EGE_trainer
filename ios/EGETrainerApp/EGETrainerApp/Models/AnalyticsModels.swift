import Foundation

// MARK: - student_analytics_screen_v1 (self / teacher scope)

struct AnalyticsScreen: Decodable {
    var overall: OverallStats?
    var student: AnalyticsStudent?
    var sections: [SectionStat]?
    var topics: [TopicStat]?
    var generatedAt: String?

    enum CodingKeys: String, CodingKey {
        case overall, student, sections, topics
        case generatedAt = "generated_at"
    }
}

struct Counter: Decodable {
    var total: Int
    var correct: Int

    var pct: Int? {
        guard total > 0 else { return nil }
        return Int((Double(correct) / Double(total) * 100).rounded())
    }

    var ratioText: String { "\(correct)/\(total)" }
}

struct OverallStats: Decodable {
    var last3: Counter?
    var last10: Counter?
    var period: Counter?
    var allTime: Counter?
    var lastSeenAt: String?

    enum CodingKeys: String, CodingKey {
        case last3, last10, period
        case allTime = "all_time"
        case lastSeenAt = "last_seen_at"
    }
}

struct AnalyticsStudent: Decodable {
    var days: Int?
    var grade: Int?
    var source: String?
    var studentId: String?
    var displayName: String?
    var lastSeenAt: String?
    var viewerScope: String?

    enum CodingKeys: String, CodingKey {
        case days, grade, source
        case studentId = "student_id"
        case displayName = "display_name"
        case lastSeenAt = "last_seen_at"
        case viewerScope = "viewer_scope"
    }
}

struct SectionStat: Decodable, Identifiable {
    var sectionId: String
    var title: String?
    var last10: Counter?
    var period: Counter?
    var allTime: Counter?
    var coverage: Coverage?
    var lastSeenAt: String?

    enum CodingKeys: String, CodingKey {
        case title, last10, period, coverage
        case sectionId = "section_id"
        case allTime = "all_time"
        case lastSeenAt = "last_seen_at"
    }

    var id: String { sectionId }
}

struct Coverage: Decodable {
    var pct: Int?
    var unicsTotal: Int?
    var unicsAttempted: Int?

    enum CodingKeys: String, CodingKey {
        case pct
        case unicsTotal = "unics_total"
        case unicsAttempted = "unics_attempted"
    }
}

struct TopicStat: Decodable, Identifiable {
    var topicId: String
    var sectionId: String?
    var subtopicId: String?
    var title: String?
    var topicOrder: Int?
    var last3: Counter?
    var last10: Counter?
    var period: Counter?
    var allTime: Counter?
    var coverage: Coverage?
    var derived: DerivedStates?
    var lastSeenAt: String?
    var subtopicLast3AvgPct: Double?

    enum CodingKeys: String, CodingKey {
        case title, last3, last10, period, coverage, derived
        case topicId = "topic_id"
        case sectionId = "section_id"
        case subtopicId = "subtopic_id"
        case topicOrder = "topic_order"
        case allTime = "all_time"
        case lastSeenAt = "last_seen_at"
        case subtopicLast3AvgPct = "subtopic_last3_avg_pct"
    }

    var id: String { topicId }
}

/// Производные состояния подтемы (бейджи «слабое», «давно не решал» и т.п.).
struct DerivedStates: Decodable {
    var sampleState: String?       // low | enough
    var coverageState: String?     // covered | partial | none
    var freshnessState: String?    // fresh | stale
    var performanceState: String?  // weak | mid | strong

    enum CodingKeys: String, CodingKey {
        case sampleState = "sample_state"
        case coverageState = "coverage_state"
        case freshnessState = "freshness_state"
        case performanceState = "performance_state"
    }
}
