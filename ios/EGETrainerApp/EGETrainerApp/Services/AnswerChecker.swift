import Foundation

/// Проверка свободного ответа — порт checkFree/normalize/parseNumber/compareNumber/matchText из tasks/hw.js.
enum AnswerChecker {

    static func check(spec: ResolvedAnswerSpec, rawInput: String) -> AnswerCheckResult {
        let chosen = rawInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let norm = normalize(chosen, rules: spec.normalize)

        if spec.type == "string" && spec.format == "ege_decimal" {
            let expected = spec.text ?? spec.value.map { formatNumber($0) } ?? ""
            return AnswerCheckResult(
                correct: norm == expected,
                chosenText: chosen,
                normalizedText: norm,
                correctText: expected
            )
        }

        if spec.type == "number" {
            let x = parseNumber(norm)
            let v = spec.value ?? Double(spec.text ?? "") ?? .nan
            let ok = compareNumber(x, v, tolerance: spec.tolerance)
            return AnswerCheckResult(
                correct: ok,
                chosenText: chosen,
                normalizedText: x.map { formatNumber($0) } ?? norm,
                correctText: formatNumber(v)
            )
        }

        // text matching (exact / regex)
        let ok = matchText(norm, accept: spec.accept ?? [])
        let correctText = (spec.accept ?? [])
            .compactMap { $0.regex ?? $0.exact }
            .joined(separator: " | ")
        return AnswerCheckResult(correct: ok, chosenText: chosen, normalizedText: norm, correctText: correctText)
    }

    /// Правила нормализации из контента: strip_spaces, unicode_minus_to_ascii, comma_to_dot.
    static func normalize(_ s: String, rules: [String]) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if rules.contains("strip_spaces") {
            t = t.components(separatedBy: .whitespacesAndNewlines).joined()
        }
        if rules.contains("unicode_minus_to_ascii") {
            for ch in ["\u{2212}", "\u{2012}", "\u{2013}", "\u{2014}"] {
                t = t.replacingOccurrences(of: ch, with: "-")
            }
        }
        if rules.contains("comma_to_dot") {
            t = t.replacingOccurrences(of: ",", with: ".")
        }
        return t
    }

    /// Число либо простая дробь "a/b" (как parseNumber в вебе).
    static func parseNumber(_ s: String) -> Double? {
        let trimmed = s.trimmingCharacters(in: .whitespaces)
        let parts = trimmed.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        if parts.count == 2,
           let a = Double(parts[0].trimmingCharacters(in: .whitespaces)),
           let b = Double(parts[1].trimmingCharacters(in: .whitespaces)), b != 0 {
            return a / b
        }
        return Double(trimmed)
    }

    static func compareNumber(_ x: Double?, _ v: Double, tolerance: Tolerance?) -> Bool {
        guard let x, x.isFinite else { return false }
        if let abs = tolerance?.abs, Swift.abs(x - v) <= abs { return true }
        if let rel = tolerance?.rel, Swift.abs(x - v) <= Swift.abs(v) * rel { return true }
        return Swift.abs(x - v) <= 1e-12
    }

    static func matchText(_ norm: String, accept: [AcceptPattern]) -> Bool {
        for a in accept {
            if let exact = a.exact, norm == exact { return true }
            if let pattern = a.regex {
                var options: NSRegularExpression.Options = []
                if (a.flags ?? "").contains("i") { options.insert(.caseInsensitive) }
                if let re = try? NSRegularExpression(pattern: pattern, options: options) {
                    let range = NSRange(norm.startIndex..., in: norm)
                    if re.firstMatch(in: norm, range: range) != nil { return true }
                }
            }
        }
        return false
    }

    /// 5.0 -> "5", 0.25 -> "0.25" (паритет с JS String(number)).
    static func formatNumber(_ n: Double) -> String {
        guard n.isFinite else { return "" }
        if n == n.rounded() && abs(n) < 1e15 { return String(Int64(n)) }
        return String(n)
    }
}
