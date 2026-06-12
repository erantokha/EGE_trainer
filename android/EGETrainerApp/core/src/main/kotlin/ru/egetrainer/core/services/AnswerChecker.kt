package ru.egetrainer.core.services

import ru.egetrainer.core.models.AcceptPattern
import ru.egetrainer.core.models.AnswerCheckResult
import ru.egetrainer.core.models.ResolvedAnswerSpec
import ru.egetrainer.core.models.Tolerance
import kotlin.math.abs

/** Проверка свободного ответа — порт checkFree/normalize/parseNumber/compareNumber/matchText из tasks/hw.js. */
object AnswerChecker {

    fun check(spec: ResolvedAnswerSpec, rawInput: String): AnswerCheckResult {
        val chosen = rawInput.trim()
        val norm = normalize(chosen, spec.normalize)

        if (spec.type == "string" && spec.format == "ege_decimal") {
            val expected = spec.text ?: spec.value?.let { formatNumber(it) } ?: ""
            return AnswerCheckResult(
                correct = norm == expected,
                chosenText = chosen,
                normalizedText = norm,
                correctText = expected,
            )
        }

        if (spec.type == "number") {
            val x = parseNumber(norm)
            val v = spec.value ?: spec.text?.toDoubleOrNull() ?: Double.NaN
            val ok = compareNumber(x, v, spec.tolerance)
            return AnswerCheckResult(
                correct = ok,
                chosenText = chosen,
                normalizedText = x?.let { formatNumber(it) } ?: norm,
                correctText = formatNumber(v),
            )
        }

        // text matching (exact / regex)
        val ok = matchText(norm, spec.accept ?: emptyList())
        val correctText = (spec.accept ?: emptyList())
            .mapNotNull { it.regex ?: it.exact }
            .joinToString(" | ")
        return AnswerCheckResult(correct = ok, chosenText = chosen, normalizedText = norm, correctText = correctText)
    }

    /** Правила нормализации из контента: strip_spaces, unicode_minus_to_ascii, comma_to_dot. */
    fun normalize(s: String, rules: List<String>): String {
        var t = s.trim()
        if (rules.contains("strip_spaces")) {
            t = t.filterNot { it.isWhitespace() }
        }
        if (rules.contains("unicode_minus_to_ascii")) {
            for (ch in charArrayOf('−', '‒', '–', '—')) {
                t = t.replace(ch, '-')
            }
        }
        if (rules.contains("comma_to_dot")) {
            t = t.replace(',', '.')
        }
        return t
    }

    /** Число либо простая дробь "a/b" (как parseNumber в вебе). */
    fun parseNumber(s: String): Double? {
        val trimmed = s.trim()
        val parts = trimmed.split("/", limit = 2)
        if (parts.size == 2) {
            val a = parseDecimal(parts[0].trim())
            val b = parseDecimal(parts[1].trim())
            if (a != null && b != null && b != 0.0) return a / b
        }
        return parseDecimal(trimmed)
    }

    /**
     * Парс десятичного числа с семантикой JS Number()/Swift Double():
     * Java toDoubleOrNull дополнительно принимает суффиксы d/f и hex-флоты
     * ("5d", "0x1p3") — отсекаем их (находка П-Т5).
     */
    private fun parseDecimal(s: String): Double? {
        if (s.isEmpty()) return null
        if (!DECIMAL_RE.matches(s)) return null
        return s.toDoubleOrNull()
    }

    private val DECIMAL_RE = Regex("""[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?""")

    fun compareNumber(x: Double?, v: Double, tolerance: Tolerance?): Boolean {
        if (x == null || !x.isFinite()) return false
        tolerance?.abs?.let { if (abs(x - v) <= it) return true }
        tolerance?.rel?.let { if (abs(x - v) <= abs(v) * it) return true }
        return abs(x - v) <= 1e-12
    }

    fun matchText(norm: String, accept: List<AcceptPattern>): Boolean {
        for (a in accept) {
            if (a.exact != null && norm == a.exact) return true
            val pattern = a.regex ?: continue
            val options = if ((a.flags ?: "").contains("i")) setOf(RegexOption.IGNORE_CASE) else emptySet()
            val re = runCatching { Regex(pattern, options) }.getOrNull() ?: continue
            if (re.containsMatchIn(norm)) return true
        }
        return false
    }

    /** 5.0 -> "5", 0.25 -> "0.25" (паритет с JS String(number)). */
    fun formatNumber(n: Double): String {
        if (!n.isFinite()) return ""
        if (n == Math.rint(n) && abs(n) < 1e15) return n.toLong().toString()
        return n.toString()
    }
}
