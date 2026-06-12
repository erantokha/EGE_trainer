import Foundation
import CryptoKit

/// WIOS.2 — ЛОКАЛЬНЫЙ движок фильтр-подбора: Swift-порт серверного
/// teacher_picking_resolve_batch_v1 от «витрины» student_picking_snapshot_v1.
/// Источник истины семантики — docs/navigation/picking_resolve_semantics_spec.md
/// (зеркало JS-порта app/core/pick_filtered.js, parity 31/0 против прода).
/// При изменении серверного resolve обновлять спеку и ОБА порта.
///
/// Паритет: множество И ПОРЯДОК строк payload-массива — iOS-ротация потребляет
/// массив в порядке сервера (request_order, section_id, topic_id, pick_rank,
/// question_id). «Сейчас» для stale-лестниц = snapshot.meta.generatedAt.
enum PickFilteredEngine {
    static let allowedFilters: Set<String> = ["unseen_low", "stale", "unstable", "weak_spots"]
    private static let dayMs: Double = 86_400_000
    private static let indexLock = NSLock()
    private static var cachedIndexes: [String: SnapshotIndex] = [:]
    private static var cachedIndexOrder: [String] = []
    private static let cachedIndexLimit = 8

    enum EngineError: Error {
        case badSnapshot
        case seedRequired
        case badFilter
        case sourceMismatch
    }

    // MARK: - md5 (паритет с Postgres md5(text) в UTF-8)

    static func md5Hex(_ s: String) -> String {
        Insecure.MD5.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Публичный API

    /// Аналог RPC: requests = (kind, id, n); selection в iOS всегда пуст, но
    /// параметры исключений поддержаны (selectionProtoIds / excludedTopicIds).
    static func resolveBatch(
        snapshot: PickSnapshot,
        filterId rawFilter: String?,
        requests rawRequests: [(kind: String, id: String?, n: Int)],
        seed rawSeed: String,
        excludeQuestionIds: Set<String> = [],
        complete: Bool = false,
        selectionProtoIds: Set<String> = [],
        excludedTopicIds: Set<String> = []
    ) throws -> ResolveBatchResult {
        guard !snapshot.protos.isEmpty else { throw EngineError.badSnapshot }
        let seed = rawSeed.trimmingCharacters(in: .whitespaces)
        guard !seed.isEmpty else { throw EngineError.seedRequired }
        let filterId = rawFilter?.trimmingCharacters(in: .whitespaces).lowercased()
        let filter: String? = (filterId?.isEmpty ?? true) ? nil : filterId
        if let f = filter, !allowedFilters.contains(f) { throw EngineError.badFilter }

        let idx = snapshotIndex(snapshot)
        let reqs = parseRequests(rawRequests)

        var rows: [Row] = []
        var shortages: [ResolveShortage] = []

        for req in reqs {
            let selected = selectProtos(
                req: req, idx: idx, filter: filter, seed: seed, complete: complete,
                selectionProtoIds: selectionProtoIds, excludedTopicIds: excludedTopicIds
            )
            let picked = pickQuestions(
                req: req, selected: selected, idx: idx, filter: filter, seed: seed,
                complete: complete, exclude: excludeQuestionIds
            )
            rows.append(contentsOf: picked)

            let requestedN = req.kind == "global_all" ? idx.sections.count : req.n
            let returnedN = picked.count
            let label = filter.flatMap { Self.filterLabels[$0] }
            let isShort = returnedN < requestedN
            shortages.append(ResolveShortage(
                scopeId: req.id,
                isShortage: isShort,
                requestedN: requestedN,
                returnedN: returnedN,
                message: isShort
                    ? (label != nil
                        ? "Подобрано \(returnedN) из \(requestedN) по фильтру \"\(label!)\"."
                        : "Подобрано \(returnedN) из \(requestedN).")
                    : nil
            ))
        }

        // порядок массива как у сервера: (request_order, section_id, topic_id, pick_rank, question_id)
        rows.sort {
            if $0.order != $1.order { return $0.order < $1.order }
            if $0.sectionId != $1.sectionId { return $0.sectionId < $1.sectionId }
            if $0.topicId != $1.topicId { return $0.topicId < $1.topicId }
            if $0.pickRank != $1.pickRank { return $0.pickRank < $1.pickRank }
            return $0.questionId < $1.questionId
        }

        let picked = rows.map {
            ResolvedQuestion(
                questionId: $0.questionId, topicId: $0.topicId, protoId: $0.protoId,
                manifestPath: $0.manifestPath, scopeKind: $0.scopeKind, scopeId: $0.scopeId
            )
        }
        return ResolveBatchResult(pickedQuestions: picked, shortages: shortages)
    }

    static let filterLabels: [String: String] = [
        "unseen_low": "Не решал / мало решал",
        "stale": "Давно решал",
        "unstable": "Нестабильно решает",
        "weak_spots": "Слабые места",
    ]

    // MARK: - Вход

    private struct Request { var order: Int; var kind: String; var id: String?; var n: Int }

    private static func parseRequests(_ raw: [(kind: String, id: String?, n: Int)]) -> [Request] {
        var out: [Request] = []
        for (i, r) in raw.enumerated() {
            let kind = r.kind.trimmingCharacters(in: .whitespaces).lowercased()
            let id = r.id?.trimmingCharacters(in: .whitespaces)
            let order = i + 1 // ordinality по исходному массиву (спека §2)
            guard ["proto", "topic", "section", "global_all"].contains(kind) else { continue }
            if kind == "global_all" {
                out.append(Request(order: order, kind: kind, id: nil, n: 1))
            } else if let id, !id.isEmpty, r.n > 0 {
                out.append(Request(order: order, kind: kind, id: id, n: r.n))
            }
        }
        return out
    }

    // MARK: - Индекс снимка

    private struct ProtoRow {
        let p: PickSnapshotProto
        let lastStr: String?  // ISO-строка: лексикографическое сравнение = паритет с timestamptz
        let lastMs: Double?   // для stale-лестницы (точности секунд достаточно)
    }

    private struct SnapshotIndex {
        var byUnic: [String: ProtoRow] = [:]
        var bySubtopic: [String: [ProtoRow]] = [:]
        var byTheme: [String: [ProtoRow]] = [:]
        var topicFlags: [String: PickSnapshotTopic] = [:]
        var qstats: [String: Int]
        var questions: [String: [PickSnapshotQuestionRef]]
        var manifestPaths: [String]
        var sections: [String]
        var nowMs: Double

        init(snapshot: PickSnapshot) {
            qstats = snapshot.qstats
            questions = snapshot.questions
            manifestPaths = snapshot.manifestPaths
            sections = snapshot.sections
            nowMs = PickFilteredEngine.parseIsoMs(snapshot.meta.generatedAt)
                ?? Date().timeIntervalSince1970 * 1000
            for p in snapshot.protos {
                let row = ProtoRow(
                    p: p,
                    lastStr: p.lastAttemptAt,
                    lastMs: p.lastAttemptAt.flatMap(PickFilteredEngine.parseIsoMs)
                )
                byUnic[p.unicId] = row
                bySubtopic[p.subtopicId, default: []].append(row)
                byTheme[p.themeId, default: []].append(row)
            }
            for t in snapshot.topics { topicFlags[t.subtopicId] = t }
        }
    }

    /// Snapshot неизменяем в рамках generated_at. Как и JS-порт, повторно
    /// используем его индекс между resolve, включая filter top-up.
    private static func snapshotIndex(_ snapshot: PickSnapshot) -> SnapshotIndex {
        let key = "\(snapshot.meta.studentId)|\(snapshot.meta.source)|\(snapshot.meta.generatedAt)|\(snapshot.meta.catalogVersion ?? "")"
        indexLock.lock()
        if let cached = cachedIndexes[key] {
            indexLock.unlock()
            return cached
        }
        indexLock.unlock()

        let built = SnapshotIndex(snapshot: snapshot)
        indexLock.lock()
        if cachedIndexes[key] == nil {
            cachedIndexOrder.append(key)
            if cachedIndexOrder.count > cachedIndexLimit {
                cachedIndexes[cachedIndexOrder.removeFirst()] = nil
            }
        }
        cachedIndexes[key] = built
        indexLock.unlock()
        return built
    }

    /// ISO-времена Postgres ('2026-06-08T03:21:45.123456+00:00'): дробную часть
    /// отбрасываем (нужна точность секунд для лестницы 30/60/90 дней).
    static func parseIsoMs(_ s: String) -> Double? {
        var base = s
        if let dot = base.firstIndex(of: ".") {
            let tail = base[dot...]
            if let tz = tail.dropFirst().firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
                base = String(base[..<dot]) + String(base[tz...])
            } else {
                base = String(base[..<dot])
            }
        }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: base) { return d.timeIntervalSince1970 * 1000 }
        return nil
    }

    // MARK: - Фильтр-предикат (спека §5)

    private static func matches(_ filter: String?, _ r: ProtoRow) -> Bool {
        guard let f = filter else { return true }
        switch f {
        case "unseen_low": return r.p.isNotSeen || r.p.isLowSeen
        case "stale": return r.p.isStale
        case "unstable": return r.p.isUnstable
        case "weak_spots": return r.p.isWeak
        default: return false
        }
    }

    // MARK: - Ключи сортировки (спека §7)

    private enum Key {
        case int(Int)
        case dbl(Double)
        case ascNullsLast(String?)
        case descNullsLast(String?)
        case str(String)

        /// -1 / 0 / 1
        func cmp(_ other: Key) -> Int {
            switch (self, other) {
            case let (.int(a), .int(b)): return a == b ? 0 : (a < b ? -1 : 1)
            case let (.dbl(a), .dbl(b)): return a == b ? 0 : (a < b ? -1 : 1)
            case let (.str(a), .str(b)): return a == b ? 0 : (a < b ? -1 : 1)
            case let (.ascNullsLast(a), .ascNullsLast(b)):
                switch (a, b) {
                case (nil, nil): return 0
                case (nil, _): return 1
                case (_, nil): return -1
                case let (x?, y?): return x == y ? 0 : (x < y ? -1 : 1)
                }
            case let (.descNullsLast(a), .descNullsLast(b)):
                switch (a, b) {
                case (nil, nil): return 0
                case (nil, _): return 1
                case (_, nil): return -1
                case let (x?, y?): return x == y ? 0 : (x > y ? -1 : 1)
                }
            default: return 0
            }
        }
    }

    private static func staleBucket(_ lastMs: Double?, nowMs: Double) -> Int {
        guard let last = lastMs else { return 9 }
        if last < nowMs - 90 * dayMs { return 0 }
        if last < nowMs - 60 * dayMs { return 1 }
        if last < nowMs - 30 * dayMs { return 2 }
        return 9
    }

    /// Окно default (complete=false). topicAware: section/global_all.
    private static func defaultKeys(
        _ r: ProtoRow, filter: String?, kind: String, order: Int, seed: String,
        idx: SnapshotIndex, topicAware: Bool, globalTheme: Bool
    ) -> [Key] {
        let p = r.p
        let weak = filter == "weak_spots"
        var ladder = 0
        if filter == "unseen_low" {
            if !topicAware {
                ladder = p.isNotSeen ? 1 : (p.isLowSeen ? 2 : 99)
            } else {
                let t = idx.topicFlags[p.subtopicId]
                if t?.isNotSeen == true && p.isNotSeen { ladder = 1 }
                else if p.isNotSeen { ladder = 2 }
                else if t?.isLowSeen == true && p.isLowSeen { ladder = 3 }
                else if p.isLowSeen { ladder = 4 }
                else { ladder = 99 }
            }
        } else if filter == "stale" {
            if !topicAware { ladder = 1 }
            else {
                let t = idx.topicFlags[p.subtopicId]
                ladder = (t?.isStale == true && p.isStale) ? 1 : (p.isStale ? 2 : 99)
            }
        } else if filter == "unstable" {
            if !topicAware { ladder = 1 }
            else {
                let t = idx.topicFlags[p.subtopicId]
                ladder = (t?.isUnstable == true && p.isUnstable) ? 1 : (p.isUnstable ? 2 : 99)
            }
        }
        let md = md5Hex(
            "\(seed)|proto|\(filter ?? "none")|\(kind)|\(order)|\(globalTheme ? "\(p.themeId)|" : "")\(p.unicId)"
        )
        return [
            .int(weak ? (p.isNotSeen ? 1 : 0) : 0),
            .dbl(weak ? (p.accuracy ?? 1.0) : 0),
            .ascNullsLast(weak ? r.lastStr : nil),
            .int(ladder),
            .int(filter == "stale" ? staleBucket(r.lastMs, nowMs: idx.nowMs) : 0),
            .dbl(filter == "unstable" ? (p.accuracy ?? 1.0) : 0),
            .descNullsLast(filter == "unstable" ? r.lastStr : nil),
            .int(filter == "unstable" ? -p.attemptCountTotal : 0), // desc
            .str(md),
        ]
    }

    /// Окно complete (complete=true) — лестница-градиент.
    private static func completeKeys(
        _ r: ProtoRow, filter: String?, kind: String, order: Int, seed: String,
        idx: SnapshotIndex, globalTheme: Bool
    ) -> [Key] {
        let p = r.p
        let weak = filter == "weak_spots"
        var key4 = 0
        if filter == "unstable" || filter == "stale" {
            key4 = p.hasIndependentCorrect ? 0 : (p.isNotSeen ? 1 : 2)
        } else if filter == "unseen_low" {
            key4 = p.isNotSeen ? 0 : (p.isLowSeen ? 1 : 2)
        }
        let md = md5Hex(
            "\(seed)|complete|\(filter ?? "none")|\(kind)|\(order)|\(globalTheme ? "\(p.themeId)|" : "")\(p.unicId)"
        )
        return [
            .int(weak ? (p.isNotSeen ? 1 : 0) : 0),
            .dbl(weak ? (p.accuracy ?? 1.0) : 0),
            .ascNullsLast(weak ? r.lastStr : nil),
            .int(key4),
            .dbl((filter == "unstable" && p.hasIndependentCorrect) ? (p.accuracy ?? 1.0) : 0),
            .ascNullsLast((filter == "stale" && p.hasIndependentCorrect) ? r.lastStr : nil),
            .int(filter == "unseen_low" ? p.uniqueQuestionIdsSeen : 0),
            .str(md),
        ]
    }

    private static func less(_ a: [Key], _ b: [Key]) -> Bool {
        for (x, y) in zip(a, b) {
            let c = x.cmp(y)
            if c != 0 { return c < 0 }
        }
        return false
    }

    // MARK: - Отбор прототипов (спека §6–7)

    private struct Selected {
        var row: ProtoRow
        var pickRank: Int
        var questionLimit: Int
    }

    private static func selectProtos(
        req: Request, idx: SnapshotIndex, filter: String?, seed: String, complete: Bool,
        selectionProtoIds: Set<String>, excludedTopicIds: Set<String>
    ) -> [Selected] {
        if req.kind == "proto" {
            guard let id = req.id, let row = idx.byUnic[id] else { return [] }
            // под complete явный клик по прототипу игнорирует фильтр
            if !complete && !matches(filter, row) { return [] }
            return [Selected(row: row, pickRank: 1, questionLimit: req.n)]
        }

        var candidates: [ProtoRow]
        switch req.kind {
        case "topic":
            candidates = (idx.bySubtopic[req.id ?? ""] ?? [])
                .filter { !selectionProtoIds.contains($0.p.unicId) }
        case "section":
            candidates = (idx.byTheme[req.id ?? ""] ?? [])
                .filter { !excludedTopicIds.contains($0.p.subtopicId) && !selectionProtoIds.contains($0.p.unicId) }
        default: // global_all
            candidates = idx.byUnic.values
                .filter { !excludedTopicIds.contains($0.p.subtopicId) && !selectionProtoIds.contains($0.p.unicId) }
        }
        if !complete { candidates = candidates.filter { matches(filter, $0) } }
        guard !candidates.isEmpty else { return [] }

        let topicAware = req.kind != "topic"
        let globalTheme = req.kind == "global_all"
        func keysOf(_ r: ProtoRow) -> [Key] {
            complete
                ? completeKeys(r, filter: filter, kind: req.kind, order: req.order, seed: seed,
                               idx: idx, globalTheme: globalTheme)
                : defaultKeys(r, filter: filter, kind: req.kind, order: req.order, seed: seed,
                              idx: idx, topicAware: topicAware, globalTheme: globalTheme)
        }

        if req.kind == "global_all" {
            // партиция по теме, rank=1 на каждую тему
            var byTheme: [String: [ProtoRow]] = [:]
            for c in candidates { byTheme[c.p.themeId, default: []].append(c) }
            var out: [Selected] = []
            for (_, arr) in byTheme {
                if let best = arr.min(by: { less(keysOf($0), keysOf($1)) }) {
                    out.append(Selected(row: best, pickRank: 1, questionLimit: 1))
                }
            }
            return out
        }

        let sorted = candidates
            .map { (row: $0, keys: keysOf($0)) }
            .sorted { less($0.keys, $1.keys) }
        var out: [Selected] = []
        for (i, item) in sorted.enumerated() {
            let rank = i + 1
            if !complete && rank > req.n { break } // default: потолок top-N
            out.append(Selected(row: item.row, pickRank: rank, questionLimit: 1))
        }
        return out
    }

    // MARK: - Стадия вопросов (спека §8)

    private struct Row {
        var order: Int
        var questionId: String
        var protoId: String
        var topicId: String
        var sectionId: String
        var manifestPath: String
        var scopeKind: String
        var scopeId: String?
        var pickRank: Int
    }

    private static func pickQuestions(
        req: Request, selected: [Selected], idx: SnapshotIndex, filter: String?,
        seed: String, complete: Bool, exclude: Set<String>
    ) -> [Row] {
        struct Cand {
            var qid: String
            var pathIdx: Int
            var sel: Selected
            var seenKey: Int
            var md: String
            var rn: Int = 0
        }

        var all: [Cand] = []
        for sel in selected {
            let unic = sel.row.p.unicId
            let scopeForMd5 = req.id ?? sel.row.p.themeId // coalesce(scope_id, section_id)
            var cands: [Cand] = []
            for ref in idx.questions[unic] ?? [] {
                guard !exclude.contains(ref.questionId) else { continue }
                cands.append(Cand(
                    qid: ref.questionId,
                    pathIdx: ref.pathIdx,
                    sel: sel,
                    seenKey: (idx.qstats[ref.questionId] ?? 0) == 0 ? 0 : 1,
                    md: md5Hex("\(seed)|question|\(filter ?? "none")|\(req.kind)|\(scopeForMd5)|\(req.order)|\(ref.questionId)")
                ))
            }
            cands.sort { $0.seenKey != $1.seenKey ? $0.seenKey < $1.seenKey : $0.md < $1.md }
            for i in cands.indices { cands[i].rn = i + 1 }
            all.append(contentsOf: cands)
        }

        var chosen: [Cand]
        if complete && (req.kind == "topic" || req.kind == "section") {
            // even-distribution: глобальный round-robin по запросу
            chosen = Array(
                all.sorted {
                    if $0.rn != $1.rn { return $0.rn < $1.rn }
                    if $0.sel.pickRank != $1.sel.pickRank { return $0.sel.pickRank < $1.sel.pickRank }
                    let ma = md5Hex("\(seed)|evendist|\(req.order)|\($0.sel.row.p.unicId)|\($0.qid)")
                    let mb = md5Hex("\(seed)|evendist|\(req.order)|\($1.sel.row.p.unicId)|\($1.qid)")
                    return ma < mb
                }
                .prefix(req.n)
            )
        } else {
            chosen = all.filter { $0.rn <= $0.sel.questionLimit }
        }

        return chosen.map {
            Row(
                order: req.order,
                questionId: $0.qid,
                protoId: $0.sel.row.p.unicId,
                topicId: $0.sel.row.p.subtopicId,
                sectionId: $0.sel.row.p.themeId,
                manifestPath: ($0.pathIdx >= 0 && $0.pathIdx < idx.manifestPaths.count)
                    ? idx.manifestPaths[$0.pathIdx] : "",
                scopeKind: req.kind,
                scopeId: req.id,
                pickRank: $0.sel.pickRank
            )
        }
    }
}
