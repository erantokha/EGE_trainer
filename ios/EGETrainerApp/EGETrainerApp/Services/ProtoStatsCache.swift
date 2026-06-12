import Foundation

/// Кэш статистики прототипов с прогревом — порт WFX1/WMB3 веба
/// (_TEACHER_MODAL_STATS_CACHE + warmTeacherModalStatsForStudent):
/// модалка рендерит бейджи сразу из кэша, прогрев идёт при раскрытии секции.
/// TTL 60 с — как TEACHER_PROTO_WARMUP_TTL_MS.
actor ProtoStatsCache {
    static let shared = ProtoStatsCache()

    private struct Key: Hashable {
        let scope: String   // "self" | studentId
        let topicId: String
    }

    private var cache: [Key: (rows: [String: ProtoLast3Stat], at: Date)] = [:]
    private var inFlight: Set<Key> = []
    private let ttl: TimeInterval = 60

    func get(scope: String, topicId: String) -> [String: ProtoLast3Stat]? {
        let key = Key(scope: scope, topicId: topicId)
        guard let hit = cache[key], Date().timeIntervalSince(hit.at) < ttl else { return nil }
        return hit.rows
    }

    func put(scope: String, topicId: String, rows: [String: ProtoLast3Stat]) {
        cache[Key(scope: scope, topicId: topicId)] = (rows, Date())
    }

    /// Загрузка статистики темы (с дедупликацией параллельных прогревов).
    /// teacher: proto_last3 (X/3) + question_stats c РЕАЛЬНЫМИ p_question_ids (дата);
    /// self: всё из proto_last3_for_self_v1.
    func load(studentId: String?, topicId: String,
              teacher: TeacherService, content: ContentService) async -> [String: ProtoLast3Stat] {
        let scope = studentId ?? "self"
        let key = Key(scope: scope, topicId: topicId)
        if let hit = cache[key], Date().timeIntervalSince(hit.at) < ttl { return hit.rows }
        guard !inFlight.contains(key) else {
            // другой прогрев уже идёт — подождём его результат (поллинг дешевле подписок)
            for _ in 0..<50 {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if let hit = cache[key], Date().timeIntervalSince(hit.at) < ttl { return hit.rows }
                if !inFlight.contains(key) { break }
            }
            return cache[key]?.rows ?? [:]
        }
        inFlight.insert(key)
        defer { inFlight.remove(key) }

        guard let topic = try? await content.topicEntry(id: topicId),
              let cards = try? await content.protoCards(topic: topic), !cards.isEmpty
        else { return [:] }
        let unicIds = cards.map(\.id)

        var map: [String: ProtoLast3Stat] = [:]
        if let studentId {
            if let rows = try? await teacher.protoLast3(studentId: studentId, unicIds: unicIds) {
                for r in rows { map[r.unicId] = r }
            }
            // дата — из question_stats по ВСЕМ id вариантов (как веб; не пустой список!)
            let allIds = cards.flatMap(\.protoIds)
            if let qstats = try? await teacher.questionStats(
                studentId: studentId, questionIds: allIds
            ) {
                for q in qstats {
                    guard let at = q.lastAttemptAt else { continue }
                    let base = ContentService.baseId(of: q.questionId)
                    var s = map[base] ?? ProtoLast3Stat(unicId: base)
                    s.lastAttemptAt = s.lastAttemptAt.map { max($0, at) } ?? at
                    map[base] = s
                }
            }
        } else {
            if let rows = try? await teacher.protoLast3Self(unicIds: unicIds) {
                for r in rows { map[r.unicId] = r }
            }
        }
        cache[key] = (map, Date())
        return map
    }
}
