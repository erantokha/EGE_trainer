import Foundation

/// Контент задач: статические JSON продакшен-сайта (content/tasks/*).
/// Зеркало loadCatalog/ensureManifest/findProto/buildQuestion из tasks/hw.js.
actor ContentService {
    static let shared = ContentService()

    private var catalog: [CatalogEntry]?
    private var topicById: [String: CatalogEntry] = [:]
    private var manifestCache: [String: TopicManifest] = [:]
    private var manifestInflight: [String: Task<TopicManifest?, Error>] = [:]
    private var videoMap: [String: String]?

    private let urlSession: URLSession

    init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        urlSession = URLSession(configuration: cfg)
    }

    // MARK: - Каталог

    func loadCatalog() async throws -> [CatalogEntry] {
        if let catalog { return catalog }
        let url = SupabaseConfig.contentBaseURL.appendingPathComponent("content/tasks/index.json")
        let (data, resp) = try await urlSession.data(from: url)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw SupabaseError.http(status: (resp as? HTTPURLResponse)?.statusCode ?? 0,
                                     message: "Каталог задач недоступен")
        }
        let entries = try JSONDecoder().decode([CatalogEntry].self, from: data)
        catalog = entries
        topicById = [:]
        for e in entries where e.parent != nil {
            topicById[e.id] = e
        }
        return entries
    }

    /// Секции с вложенными темами для аккордеона тренировки.
    func sectionsWithTopics() async throws -> [(section: CatalogEntry, topics: [CatalogEntry])] {
        let entries = try await loadCatalog()
        let sections = entries.filter { $0.isSection }
        let topics = entries.filter { $0.isSelectableTopic }
        return sections.map { sec in
            (sec, topics.filter { $0.parent == sec.id }.sorted { compareId($0.id, $1.id) })
        }
        .sorted { compareId($0.section.id, $1.section.id) }
    }

    /// Сортировка id вида "1.10" по числовым сегментам.
    private func compareId(_ a: String, _ b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0
            let y = i < pb.count ? pb[i] : 0
            if x != y { return x < y }
        }
        return false
    }

    // MARK: - Манифесты

    func manifest(for topic: CatalogEntry) async throws -> TopicManifest? {
        guard let path = topic.path else { return nil }
        if let cached = manifestCache[path] { return cached }
        if let task = manifestInflight[path] { return try await task.value }
        let url = SupabaseConfig.contentBaseURL.appendingPathComponent(path)
        let session = urlSession
        let task = Task<TopicManifest?, Error> {
            let (data, resp) = try await session.data(from: url)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return try JSONDecoder().decode(TopicManifest.self, from: data)
        }
        manifestInflight[path] = task
        do {
            let man = try await task.value
            manifestInflight[path] = nil
            if let man { manifestCache[path] = man }
            return man
        } catch {
            manifestInflight[path] = nil
            throw error
        }
    }

    /// Поиск темы: точный id, затем по убывающим префиксам question_id
    /// (готча нерегулярной иерархии id — как в buildFixedQuestions hw.js).
    private func resolveTopic(topicId: String, questionId: String) async throws -> CatalogEntry? {
        _ = try await loadCatalog()
        if let t = topicById[topicId] { return t }
        let parts = questionId.split(separator: ".").map(String.init)
        if parts.count >= 2 {
            for len in stride(from: parts.count - 1, through: 2, by: -1) {
                let candidate = parts[0..<len].joined(separator: ".")
                if let t = topicById[candidate] { return t }
            }
        }
        return nil
    }

    // MARK: - Сборка вопросов

    /// frozen_questions/fixed refs -> готовые вопросы (порт buildFixedQuestions).
    /// Манифесты уникальных тем грузятся ПАРАЛЛЕЛЬНО (аудит 2026-06-12:
    /// последовательная загрузка 12 манифестов = 3,6 с, параллельная = 0,4 с),
    /// затем вопросы собираются из кэша.
    func buildQuestions(refs: [QuestionRef]) async throws -> [RunQuestion] {
        // 1) уникальные темы подборки
        var topicByRef: [String: CatalogEntry] = [:]
        var uniqueTopics: [String: CatalogEntry] = [:]
        for ref in refs {
            guard let topic = try await resolveTopic(topicId: ref.topicId, questionId: ref.questionId)
            else { continue }
            topicByRef[ref.questionId] = topic
            if let path = topic.path { uniqueTopics[path] = topic }
        }

        // 2) параллельный прогрев кэша манифестов (actor-reentrancy: сетевые
        //    await-ы перекрываются; пути уникальны — дублей запросов нет)
        await withTaskGroup(of: Void.self) { group in
            for topic in uniqueTopics.values where manifestCache[topic.path ?? ""] == nil {
                group.addTask { [weak self] in
                    _ = try? await self?.manifest(for: topic)
                }
            }
        }

        // 3) сборка из кэша
        var out: [RunQuestion] = []
        for ref in refs {
            guard let topic = topicByRef[ref.questionId],
                  let man = try await manifest(for: topic),
                  let found = findProto(in: man, questionId: ref.questionId)
            else { continue }
            out.append(buildQuestion(manifest: man, type: found.type, proto: found.proto))
        }
        return out
    }

    /// Случайные прототипы темы для тренировки — клиентский подбор со спредом
    /// «вширь»: двухпроходная ротация по базовым прототипам, как
    /// pickByProtoRotation в picker.js (проход 1 — только новые базы,
    /// проход 2 — добор любыми).
    func randomQuestions(topic: CatalogEntry, count: Int, excluding: Set<String> = []) async throws -> [RunQuestion] {
        guard let man = try await manifest(for: topic) else { return [] }
        var pool: [(TaskType, Prototype)] = []
        for type in man.types ?? [] {
            for proto in type.prototypes ?? [] where proto.id != nil && !excluding.contains(proto.id!) {
                pool.append((type, proto))
            }
        }
        pool.shuffle()
        var usedBases = Set<String>()
        var picked: [(TaskType, Prototype)] = []
        for item in pool where picked.count < count {
            let base = Self.baseId(of: item.1.id ?? "")
            if !usedBases.contains(base) {
                usedBases.insert(base)
                picked.append(item)
            }
        }
        if picked.count < count {
            let pickedIds = Set(picked.compactMap { $0.1.id })
            for item in pool where picked.count < count {
                if let id = item.1.id, !pickedIds.contains(id) {
                    picked.append(item)
                }
            }
        }
        return picked.map { buildQuestion(manifest: man, type: $0.0, proto: $0.1) }
    }

    /// Случайные задачи по ЦЕЛОЙ секции (счётчик на секции) — пул всех
    /// прототипов всех подтем секции + та же двухпроходная ротация по базам.
    func randomQuestionsInSection(topics: [CatalogEntry], count: Int,
                                  excluding: Set<String> = []) async throws -> [RunQuestion] {
        var manifests: [TopicManifest] = []
        await withTaskGroup(of: TopicManifest?.self) { group in
            for topic in topics {
                group.addTask { [weak self] in
                    try? await self?.manifest(for: topic)
                }
            }
            for await man in group {
                if let man { manifests.append(man) }
            }
        }

        var pool: [(TopicManifest, TaskType, Prototype)] = []
        for man in manifests {
            for type in man.types ?? [] {
                for proto in type.prototypes ?? [] where proto.id != nil && !excluding.contains(proto.id!) {
                    pool.append((man, type, proto))
                }
            }
        }
        pool.shuffle()
        var usedBases = Set<String>()
        var picked: [(TopicManifest, TaskType, Prototype)] = []
        for item in pool where picked.count < count {
            let base = Self.baseId(of: item.2.id ?? "")
            if !usedBases.contains(base) {
                usedBases.insert(base)
                picked.append(item)
            }
        }
        if picked.count < count {
            let pickedIds = Set(picked.compactMap { $0.2.id })
            for item in pool where picked.count < count {
                if let id = item.2.id, !pickedIds.contains(id) {
                    picked.append(item)
                }
            }
        }
        return picked.map { buildQuestion(manifest: $0.0, type: $0.1, proto: $0.2) }
    }

    /// Числовое сравнение id по сегментам ("1.10" < "2.1") — для порядка
    /// варианта по номерам (P6-1: без «Перемешать» задачи идут 1.x→2.x→…).
    nonisolated static func numericIdLess(_ a: String, _ b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0
            let y = i < pb.count ? pb[i] : 0
            if x != y { return x < y }
        }
        return false
    }

    /// Базовый id прототипа (без последнего числового сегмента) —
    /// baseIdFromProtoId из app/video_solutions.js / picker_common.js.
    nonisolated static func baseId(of id: String) -> String {
        let parts = id.split(separator: ".").map(String.init)
        if parts.count >= 4, Int(parts[parts.count - 1]) != nil {
            return parts.dropLast().joined(separator: ".")
        }
        return id
    }

    /// Тема каталога по id (для модалки прототипов с PickTopic учителя).
    func topicEntry(id: String) async throws -> CatalogEntry? {
        _ = try await loadCatalog()
        return topicById[id]
    }

    /// Карточки модалки прототипов — порт buildProtoModalCards (picker.js):
    /// группировка прототипов ВНУТРИ типа по базовому id; multi-группа
    /// получает заголовок по baseId, одиночная — по type.id.
    struct ProtoCard: Identifiable {
        var id: String          // baseId (unic) — ключ карточки
        var title: String
        var previewStem: String
        var previewFigure: Figure?  // рисунок первого варианта (порция №3: картинки в модалке)
        var topicId: String
        var cap: Int            // вариантов в группе
        var protoIds: [String]  // все id вариантов (для question_stats учителя)
    }

    func protoCards(topic: CatalogEntry) async throws -> [ProtoCard] {
        guard let man = try await manifest(for: topic) else { return [] }
        var cards: [ProtoCard] = []
        for type in man.types ?? [] {
            var groups: [String: [Prototype]] = [:]
            var order: [String] = []
            for proto in type.prototypes ?? [] {
                guard let pid = proto.id else { continue }
                let base = Self.baseId(of: pid)
                if groups[base] == nil { order.append(base) }
                groups[base, default: []].append(proto)
            }
            let multi = order.count > 1
            for base in order {
                let protos = groups[base] ?? []
                guard let first = protos.first else { continue }
                let q = buildQuestion(manifest: man, type: type, proto: first)
                cards.append(ProtoCard(
                    id: base,
                    title: "\(multi ? base : (type.id ?? base)) \(type.title ?? "")",
                    previewStem: q.stem,
                    previewFigure: q.figure,
                    topicId: man.topic ?? topic.id,
                    cap: protos.count,
                    protoIds: protos.compactMap(\.id)
                ))
            }
        }
        return cards
    }

    /// Случайные варианты конкретного базового прототипа (для счётчика модалки).
    func randomQuestionsForProto(topic: CatalogEntry, baseId: String, count: Int,
                                 excluding: Set<String> = []) async throws -> [RunQuestion] {
        guard let man = try await manifest(for: topic) else { return [] }
        var pool: [(TaskType, Prototype)] = []
        for type in man.types ?? [] {
            for proto in type.prototypes ?? [] {
                guard let pid = proto.id, !excluding.contains(pid),
                      Self.baseId(of: pid) == baseId else { continue }
                pool.append((type, proto))
            }
        }
        pool.shuffle()
        return pool.prefix(count).map { buildQuestion(manifest: man, type: $0.0, proto: $0.1) }
    }

    // MARK: - «Решить аналог» (порт pickAnalogQuestion из tasks/analog.js)

    /// Аналог: другой вариант того же ТИПА задания, исключая исходный вариант
    /// и уже решённые аналоги. nil — вариантов не осталось.
    func analogQuestion(topicId: String, baseQuestionId: String,
                        usedIds: Set<String>) async throws -> RunQuestion? {
        guard let topic = try await resolveTopic(topicId: topicId, questionId: baseQuestionId),
              let man = try await manifest(for: topic) else { return nil }
        // тип, содержащий исходный прототип
        guard let baseType = (man.types ?? []).first(where: { type in
            (type.prototypes ?? []).contains { $0.id == baseQuestionId }
        }) else { return nil }
        var exclude = usedIds
        exclude.insert(baseQuestionId)
        let candidates = (baseType.prototypes ?? []).filter {
            guard let id = $0.id else { return false }
            return !exclude.contains(id)
        }
        guard let picked = candidates.randomElement() else { return nil }
        return buildQuestion(manifest: man, type: baseType, proto: picked)
    }

    private func findProto(in man: TopicManifest, questionId: String) -> (type: TaskType, proto: Prototype)? {
        for type in man.types ?? [] {
            for proto in type.prototypes ?? [] where proto.id == questionId {
                return (type, proto)
            }
        }
        return nil
    }

    private func buildQuestion(manifest: TopicManifest, type: TaskType, proto: Prototype) -> RunQuestion {
        let params = proto.params ?? [:]
        let stemTpl = proto.stem ?? type.stemTemplate ?? type.stem ?? ""
        let stem = interpolate(stemTpl, params: params)
        let figure = proto.figure ?? type.figure

        // слияние defaults + answer_spec (зеркало computeAnswer)
        let defaults = type.defaults
        let spec = type.answerSpec
        var resolved = ResolvedAnswerSpec(
            type: spec?.type ?? "number",
            format: spec?.format,
            tolerance: spec?.tolerance,
            accept: spec?.accept,
            normalize: spec?.normalize ?? defaults?.normalize ?? [],
            text: nil,
            value: nil
        )
        if let answer = proto.answer {
            resolved.text = answer.text
            resolved.value = answer.value
        }

        return RunQuestion(
            topicId: manifest.topic ?? "",
            topicTitle: manifest.title ?? "",
            questionId: proto.id ?? "",
            stem: stem,
            figure: figure,
            difficulty: proto.difficulty ?? defaults?.difficulty ?? 1,
            spec: resolved
        )
    }

    private func interpolate(_ tpl: String, params: [String: JSONValue]) -> String {
        guard tpl.contains("${") else { return tpl }
        var result = ""
        var rest = Substring(tpl)
        while let start = rest.range(of: "${") {
            result += rest[..<start.lowerBound]
            rest = rest[start.upperBound...]
            if let end = rest.firstIndex(of: "}") {
                let key = String(rest[..<end])
                result += params[key]?.interpolationText ?? ""
                rest = rest[rest.index(after: end)...]
            } else {
                result += "${"
            }
        }
        result += rest
        return result
    }

    // MARK: - Картинки и видео

    /// Абсолютный URL картинки задачи (figure.img — относительный путь content/...).
    nonisolated func figureURL(_ figure: Figure?) -> URL? {
        guard let img = figure?.img, !img.isEmpty else { return nil }
        if img.hasPrefix("http") { return URL(string: img) }
        return SupabaseConfig.contentBaseURL.appendingPathComponent(img)
    }

    /// Карта видео-решений Rutube: proto_id -> url (content/video/rutube_map.json),
    /// фоллбэк по base_id (id без последнего сегмента) — как в app/video_solutions.js.
    func videoURL(forQuestionId qid: String) async -> URL? {
        if videoMap == nil {
            let url = SupabaseConfig.contentBaseURL.appendingPathComponent("content/video/rutube_map.json")
            if let (data, resp) = try? await urlSession.data(from: url),
               (resp as? HTTPURLResponse)?.statusCode == 200,
               let raw = try? JSONDecoder().decode([String: JSONValue].self, from: data) {
                var map: [String: String] = [:]
                for (k, v) in raw {
                    if let s = v.stringValue, !s.isEmpty {
                        map[k] = normalizeVideoURL(s)
                    } else if let obj = v.objectValue, let s = obj["url"]?.stringValue {
                        map[k] = normalizeVideoURL(s)
                    }
                }
                videoMap = map
            } else {
                videoMap = [:]
            }
        }
        guard let map = videoMap else { return nil }
        if let direct = map[qid], let u = URL(string: direct) { return u }
        // фоллбэк: совпадение по base (без последнего числового сегмента)
        let parts = qid.split(separator: ".").map(String.init)
        if parts.count >= 4, Int(parts[parts.count - 1]) != nil {
            let base = parts.dropLast().joined(separator: ".")
            if let u = map[base].flatMap({ URL(string: $0) }) { return u }
            for (k, v) in map where k.hasPrefix(base + ".") {
                _ = k
                return URL(string: v)
            }
        }
        return nil
    }

    private nonisolated func normalizeVideoURL(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("//") { s = "https:" + s }
        if !s.hasPrefix("http") { s = "https://" + s }
        return s
    }
}
