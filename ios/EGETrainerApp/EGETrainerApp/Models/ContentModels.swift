import Foundation

// MARK: - content/tasks/index.json

/// Запись каталога тем (index.json или RPC catalog_index_like_v1).
struct CatalogEntry: Decodable, Identifiable {
    var id: String
    var title: String?
    var type: String?       // "group" у секций
    var parent: String?
    var path: String?       // content/tasks/<dir>/<topic>.json
    var enabled: Bool?
    var hidden: Bool?

    var isSection: Bool { type == "group" }
    var isSelectableTopic: Bool {
        parent != nil && enabled != false && hidden != true && path != nil
    }
}

// MARK: - Манифест темы (content/tasks/<dir>/<topic>.json)

struct TopicManifest: Decodable {
    var topic: String?
    var title: String?
    var types: [TaskType]?
}

struct TaskType: Decodable {
    var id: String?
    var title: String?
    var defaults: TypeDefaults?
    var answerSpec: AnswerSpecRaw?
    var stemTemplate: String?
    var stem: String?
    var figure: Figure?
    var prototypes: [Prototype]?

    enum CodingKeys: String, CodingKey {
        case id, title, defaults, stem, figure, prototypes
        case answerSpec = "answer_spec"
        case answerSpecCamel = "answerSpec"
        case stemTemplate = "stem_template"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        defaults = try c.decodeIfPresent(TypeDefaults.self, forKey: .defaults)
        answerSpec = try (c.decodeIfPresent(AnswerSpecRaw.self, forKey: .answerSpec)
            ?? c.decodeIfPresent(AnswerSpecRaw.self, forKey: .answerSpecCamel))
        stemTemplate = try c.decodeIfPresent(String.self, forKey: .stemTemplate)
        stem = try c.decodeIfPresent(String.self, forKey: .stem)
        figure = try c.decodeIfPresent(Figure.self, forKey: .figure)
        prototypes = try c.decodeIfPresent([Prototype].self, forKey: .prototypes)
    }
}

struct TypeDefaults: Decodable {
    var difficulty: Int?
    var normalize: [String]?
}

/// answer_spec из контента (поля могут перекрываться defaults).
struct AnswerSpecRaw: Decodable {
    var type: String?       // "string" | "number"
    var format: String?     // "ege_decimal" | null
    var tolerance: Tolerance?
    var accept: [AcceptPattern]?
    var normalize: [String]?
}

struct Tolerance: Decodable {
    var abs: Double?
    var rel: Double?
}

struct AcceptPattern: Decodable {
    var exact: String?
    var regex: String?
    var flags: String?
}

struct Prototype: Decodable {
    var id: String?
    var stem: String?
    var params: [String: JSONValue]?
    var figure: Figure?
    var answer: PrototypeAnswer?
    var difficulty: Int?
}

struct PrototypeAnswer: Decodable {
    var text: String?
    var value: Double?

    enum CodingKeys: String, CodingKey { case text, value }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // text иногда числовой в JSON
        if let s = try? c.decodeIfPresent(String.self, forKey: .text) {
            text = s
        } else if let n = try? c.decodeIfPresent(Double.self, forKey: .text) {
            text = JSONValue.number(n).interpolationText
        } else {
            text = nil
        }
        value = try? c.decodeIfPresent(Double.self, forKey: .value)
    }
}

struct Figure: Decodable, Equatable {
    var img: String?
    var alt: String?
}

// MARK: - Собранный вопрос для прохождения (зеркало buildQuestion из hw.js)

struct RunQuestion: Identifiable {
    var topicId: String
    var topicTitle: String
    var questionId: String
    var stem: String
    var figure: Figure?
    var difficulty: Int
    var spec: ResolvedAnswerSpec

    var id: String { questionId }
}

/// Спецификация ответа после слияния defaults + answer_spec + answer прототипа.
struct ResolvedAnswerSpec {
    var type: String          // "string" | "number" | прочее
    var format: String?
    var tolerance: Tolerance?
    var accept: [AcceptPattern]?
    var normalize: [String]
    var text: String?
    var value: Double?
}

/// Результат проверки ответа.
struct AnswerCheckResult {
    var correct: Bool
    var chosenText: String
    var normalizedText: String
    var correctText: String
}
