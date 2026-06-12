import Foundation

/// Динамическое JSON-значение для гибких мест контрактов
/// (params прототипов, payload RPC, spec_json и т.п.).
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let o = try? c.decode([String: JSONValue].self) {
            self = .object(o)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    var doubleValue: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s)
        default: return nil
        }
    }

    var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }

    /// Строковое представление для интерполяции в stem (как String(params[k]) в вебе).
    var interpolationText: String {
        switch self {
        case .string(let s): return s
        case .number(let n):
            // 5.0 -> "5", 0.25 -> "0.25" (паритет с JS String(number))
            if n == n.rounded() && abs(n) < 1e15 {
                return String(Int64(n))
            }
            return String(n)
        case .bool(let b): return b ? "true" : "false"
        case .null: return ""
        case .object, .array: return ""
        }
    }
}
