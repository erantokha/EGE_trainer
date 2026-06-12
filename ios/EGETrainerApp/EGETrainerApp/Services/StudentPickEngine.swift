import Foundation

/// Подбор задач на главной ученика — порт student-веток picker.js:
/// - без фильтра: клиентский random со спредом по базовым прототипам
///   (randomQuestions / randomQuestionsInSection с ротацией);
/// - с фильтром: self-гейт teacher_picking_resolve_batch_v1 c over-fetch
///   (want + 6, cap 40) и клиентской двухпроходной ротацией
///   pickByProtoRotation; бакеты обходим последовательно, накапливая
///   exclude (как один батч веба).
enum StudentPickEngine {
    struct Selection {
        var topicCounts: [String: Int] = [:]          // CHOICE_TOPICS
        var sectionCounts: [String: Int] = [:]        // CHOICE_SECTIONS
        var protoCounts: [String: ProtoPick] = [:]    // CHOICE_PROTOS (baseId -> тема+кол-во)
        var total: Int {
            topicCounts.values.reduce(0, +)
                + sectionCounts.values.reduce(0, +)
                + protoCounts.values.reduce(0) { $0 + $1.count }
        }
    }

    static func pick(
        selection: Selection,
        sections: [(section: CatalogEntry, topics: [CatalogEntry])],
        filterId: String?,
        student: StudentService,
        content: ContentService
    ) async throws -> [RunQuestion] {
        if let filterId, !filterId.isEmpty {
            return try await pickFiltered(
                selection: selection, sections: sections,
                filterId: filterId, student: student, content: content
            )
        }
        return try await pickClient(selection: selection, sections: sections, content: content)
    }

    // MARK: - Без фильтра (клиентский random + спред)

    private static func pickClient(
        selection: Selection,
        sections: [(section: CatalogEntry, topics: [CatalogEntry])],
        content: ContentService
    ) async throws -> [RunQuestion] {
        var out: [RunQuestion] = []
        var used = Set<String>()
        // proto-бакеты первыми (scope-приоритет proto > topic > section)
        for (baseId, pick) in selection.protoCounts.sorted(by: { $0.key < $1.key }) {
            guard let topic = try? await content.topicEntry(id: pick.topicId) else { continue }
            let qs = (try? await content.randomQuestionsForProto(
                topic: topic, baseId: baseId, count: pick.count, excluding: used)) ?? []
            qs.forEach { used.insert($0.questionId) }
            out.append(contentsOf: qs)
        }
        for pair in sections {
            for topic in pair.topics {
                let n = selection.topicCounts[topic.id] ?? 0
                guard n > 0 else { continue }
                let qs = (try? await content.randomQuestions(topic: topic, count: n, excluding: used)) ?? []
                qs.forEach { used.insert($0.questionId) }
                out.append(contentsOf: qs)
            }
            let secN = selection.sectionCounts[pair.section.id] ?? 0
            if secN > 0 {
                let qs = (try? await content.randomQuestionsInSection(
                    topics: pair.topics, count: secN, excluding: used)) ?? []
                qs.forEach { used.insert($0.questionId) }
                out.append(contentsOf: qs)
            }
        }
        return out
    }

    // MARK: - С фильтром (self-гейт resolve + ротация)

    /// ОДИН батч со всеми бакетами (аудит 2026-06-12: 12 последовательных
    /// RPC = 11,3 с, один батч = 0,9 с при том же составе; сервер сам
    /// исключает дубли между бакетами внутри вызова). Ротация по базовым
    /// прототипам — поверх ответа, по атрибуции scope_kind/scope_id.
    private static func pickFiltered(
        selection: Selection,
        sections: [(section: CatalogEntry, topics: [CatalogEntry])],
        filterId: String,
        student: StudentService,
        content: ContentService
    ) async throws -> [RunQuestion] {
        let seed = String(Int.random(in: 100_000...999_999))

        // bucket'ы: proto первыми, затем topic и section в порядке каталога
        var buckets: [(kind: String, id: String, want: Int)] = []
        for (baseId, pick) in selection.protoCounts.sorted(by: { $0.key < $1.key }) {
            buckets.append(("proto", baseId, pick.count))
        }
        for pair in sections {
            for topic in pair.topics {
                if let n = selection.topicCounts[topic.id], n > 0 {
                    buckets.append(("topic", topic.id, n))
                }
            }
            if let n = selection.sectionCounts[pair.section.id], n > 0 {
                buckets.append(("section", pair.section.id, n))
            }
        }
        guard !buckets.isEmpty else { return [] }

        // over-fetch как overN() веба: want + 6, cap 40 — на каждый бакет
        let requests = buckets.map {
            (scopeKind: $0.kind, scopeId: $0.id, n: min($0.want + 6, 40))
        }
        let candidates = await resolveLocalFirst(
            student: student,
            requests: requests,
            filterId: filterId,
            excludeQuestionIds: [],
            seed: seed
        )

        var usedIds = Set<String>()
        var usedBases = Set<String>()
        var pickedByBucket = rotate(candidates, buckets: buckets,
                                    usedIds: &usedIds, usedBases: &usedBases)

        // P4-4 (решение оператора): фильтр — приоритет, не сито. Дефицит
        // добирается вторым батчем БЕЗ фильтра с исключением взятых.
        let deficits = buckets.compactMap { b -> (kind: String, id: String, want: Int)? in
            let got = pickedByBucket["\(b.kind):\(b.id)"]?.count ?? 0
            return got < b.want ? (b.kind, b.id, b.want - got) : nil
        }
        if !deficits.isEmpty {
            let topupReqs = deficits.map {
                (scopeKind: $0.kind, scopeId: $0.id, n: min($0.want + 6, 40))
            }
            let topup = await resolveLocalFirst(
                student: student,
                requests: topupReqs,
                filterId: nil,
                excludeQuestionIds: Array(usedIds),
                seed: seed
            )
            let extra = rotate(topup,
                               buckets: deficits.map { ($0.kind, $0.id, $0.want) },
                               usedIds: &usedIds, usedBases: &usedBases)
            for (key, qs) in extra {
                pickedByBucket[key, default: []].append(contentsOf: qs)
            }
        }

        var refs: [QuestionRef] = []
        for bucket in buckets {
            let picked = pickedByBucket["\(bucket.kind):\(bucket.id)"] ?? []
            refs.append(contentsOf: picked.map {
                QuestionRef(topicId: $0.topicId ?? bucket.id, questionId: $0.questionId)
            })
        }
        return try await content.buildQuestions(refs: refs)
    }

    /// WIOS.2: локальный resolve от витрины (0 round-trip; default-окно, как
    /// серверный без p_complete); при отсутствии снимка/сбое движка —
    /// прозрачный fallback на прежний self-RPC.
    private static func resolveLocalFirst(
        student: StudentService,
        requests: [(scopeKind: String, scopeId: String, n: Int)],
        filterId: String?,
        excludeQuestionIds: [String],
        seed: String
    ) async -> [ResolvedQuestion] {
        if let sid = await student.selfUserId(),
           let snap = await PickSnapshotCache.shared.snapshot(for: sid, client: student.client),
           let local = try? PickFilteredEngine.resolveBatch(
               snapshot: snap,
               filterId: filterId,
               requests: requests.map { (kind: $0.scopeKind, id: Optional($0.scopeId), n: $0.n) },
               seed: seed,
               excludeQuestionIds: Set(excludeQuestionIds)
           ) {
            return local.pickedQuestions ?? []
        }
        return (try? await student.resolveFiltered(
            requests: requests,
            filterId: filterId,
            excludeQuestionIds: excludeQuestionIds,
            seed: seed
        )) ?? []
    }

    /// Двухпроходная ротация по базовым прототипам (pickByProtoRotation) с
    /// группировкой по бакетам атрибуции ответа.
    private static func rotate(
        _ candidates: [ResolvedQuestion],
        buckets: [(kind: String, id: String, want: Int)],
        usedIds: inout Set<String>,
        usedBases: inout Set<String>
    ) -> [String: [ResolvedQuestion]] {
        var byBucket: [String: [ResolvedQuestion]] = [:]
        for c in candidates {
            byBucket["\(c.scopeKind ?? ""):\(c.scopeId ?? "")", default: []].append(c)
        }
        var out: [String: [ResolvedQuestion]] = [:]
        for bucket in buckets {
            let key = "\(bucket.kind):\(bucket.id)"
            let cands = byBucket[key] ?? []
            var picked: [ResolvedQuestion] = []
            for c in cands where picked.count < bucket.want {
                guard !usedIds.contains(c.questionId) else { continue }
                let base = ContentService.baseId(of: c.questionId)
                if !usedBases.contains(base) {
                    usedBases.insert(base)
                    usedIds.insert(c.questionId)
                    picked.append(c)
                }
            }
            for c in cands where picked.count < bucket.want {
                guard !usedIds.contains(c.questionId) else { continue }
                usedIds.insert(c.questionId)
                picked.append(c)
            }
            out[key] = picked
        }
        return out
    }
}
