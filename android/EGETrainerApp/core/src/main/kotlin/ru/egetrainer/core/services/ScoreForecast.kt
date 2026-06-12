package ru.egetrainer.core.services

import ru.egetrainer.core.models.TopicStat
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Прогноз ЕГЭ — порт buildStudentStatsModel + secondaryFromPrimaryExact из tasks/picker_stats.js:
 * подтема% = subtopic_last3_avg_pct; секция% = среднее по подтемам (null не входит);
 * первичный = Σ (секция%/100) по 12 секциям; вторичный — линейная интерполяция по таблице.
 */
object ScoreForecast {

    private val secondaryByPrimary: Map<Int, Double> = mapOf(
        0 to 0.0, 1 to 6.0, 2 to 11.0, 3 to 17.0, 4 to 22.0, 5 to 27.0, 6 to 34.0,
        7 to 40.0, 8 to 46.0, 9 to 52.0, 10 to 58.0, 11 to 64.0, 12 to 70.0,
    )

    data class Result(
        val primaryExact: Double,            // 0...12
        val secondary: Int,                  // 0...100 (по таблице до 70 за первую часть)
        val sectionPctById: Map<String, Int>,
    ) {
        /** как fmtPrimaryExact: 2.84 -> "2,84" */
        val primaryText: String
            get() = String.format(Locale.ROOT, "%.2f", primaryExact).replace('.', ',')
    }

    fun compute(topics: List<TopicStat>): Result {
        // секция -> (сумма подтема-%, кол-во подтем с данными)
        data class Agg(var sum: Double = 0.0, var n: Int = 0)
        val agg = mutableMapOf<String, Agg>()
        for (t in topics) {
            val sid = t.sectionId?.takeIf { it.isNotEmpty() } ?: continue
            val raw = t.subtopicLast3AvgPct?.takeIf { it.isFinite() } ?: continue
            // half-up как JS Math.round / Swift .rounded() (НЕ Math.rint —
            // тот даёт half-to-even и расходится с вебом на .5; находка П-Т5)
            val subPct = kotlin.math.floor(raw + 0.5)
            val a = agg.getOrPut(sid) { Agg() }
            a.sum += subPct
            a.n += 1
        }

        val sectionPctById = mutableMapOf<String, Int>()
        for ((sid, a) in agg) {
            if (a.n > 0) sectionPctById[sid] = (a.sum / a.n).roundToInt()
        }

        val primaryExact = sectionPctById.values.sumOf { it / 100.0 }
        return Result(
            primaryExact = primaryExact,
            secondary = secondaryFromPrimaryExact(primaryExact),
            sectionPctById = sectionPctById,
        )
    }

    fun secondaryFromPrimaryExact(primaryExact: Double): Int {
        val p = max(0.0, min(12.0, primaryExact))
        val lo = kotlin.math.floor(p).toInt()
        val hi = min(12, lo + 1)
        val sLo = secondaryByPrimary[lo] ?: 0.0
        val sHi = secondaryByPrimary[hi] ?: 0.0
        val frac = p - lo
        return (sLo + (sHi - sLo) * frac).roundToInt()
    }

    /** «+N до цели» — до 70 вторичных (цель первой части, как на главной веба). */
    fun deltaToGoal(secondary: Int, goal: Int = 70): Int = max(0, goal - secondary)
}
