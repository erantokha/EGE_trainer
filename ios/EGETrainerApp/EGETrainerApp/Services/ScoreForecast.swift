import Foundation

/// Прогноз ЕГЭ — порт buildStudentStatsModel + secondaryFromPrimaryExact из tasks/picker_stats.js:
/// подтема% = subtopic_last3_avg_pct; секция% = среднее по подтемам (null не входит);
/// первичный = Σ (секция%/100) по 12 секциям; вторичный — линейная интерполяция по таблице.
enum ScoreForecast {

    private static let secondaryByPrimary: [Int: Double] = [
        0: 0, 1: 6, 2: 11, 3: 17, 4: 22, 5: 27, 6: 34, 7: 40, 8: 46, 9: 52, 10: 58, 11: 64, 12: 70,
    ]

    struct Result {
        var primaryExact: Double     // 0...12
        var secondary: Int           // 0...100 (по таблице до 70 за первую часть)
        var sectionPctById: [String: Int]

        var primaryText: String {
            // как fmtPrimaryExact: 2.84 -> "2,84"
            String(format: "%.2f", primaryExact).replacingOccurrences(of: ".", with: ",")
        }
    }

    static func compute(topics: [TopicStat]) -> Result {
        // секция -> (сумма подтема-%, кол-во подтем с данными)
        var agg: [String: (sum: Double, n: Int)] = [:]
        for t in topics {
            guard let sid = t.sectionId, !sid.isEmpty else { continue }
            guard let raw = t.subtopicLast3AvgPct, raw.isFinite else { continue }
            let subPct = raw.rounded()
            var a = agg[sid] ?? (0, 0)
            a.sum += subPct
            a.n += 1
            agg[sid] = a
        }

        var sectionPctById: [String: Int] = [:]
        for (sid, a) in agg where a.n > 0 {
            sectionPctById[sid] = Int((a.sum / Double(a.n)).rounded())
        }

        let primaryExact = sectionPctById.values.reduce(0.0) { $0 + Double($1) / 100.0 }
        let secondary = secondaryFromPrimaryExact(primaryExact)
        return Result(primaryExact: primaryExact, secondary: secondary, sectionPctById: sectionPctById)
    }

    static func secondaryFromPrimaryExact(_ primaryExact: Double) -> Int {
        let p = max(0, min(12, primaryExact))
        let lo = Int(p.rounded(.down))
        let hi = min(12, lo + 1)
        let sLo = secondaryByPrimary[lo] ?? 0
        let sHi = secondaryByPrimary[hi] ?? 0
        let frac = p - Double(lo)
        return Int((sLo + (sHi - sLo) * frac).rounded())
    }

    /// «+N до цели» — до 70 вторичных (цель первой части, как на главной веба).
    static func deltaToGoal(secondary: Int, goal: Int = 70) -> Int {
        max(0, goal - secondary)
    }
}
