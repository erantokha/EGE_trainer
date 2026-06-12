package ru.egetrainer.core.services

import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import ru.egetrainer.core.models.ProtoLast3Stat
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.ResolvedAnswerSpec
import ru.egetrainer.core.models.ResolvedQuestion
import ru.egetrainer.core.models.Tolerance
import ru.egetrainer.core.models.TopicStat
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Юниты чистой логики ядра — гейты П-Т5/П-Т6 (WAND_0_PLAN §9). */
class LogicTest {

    // MARK: AnswerChecker — кейсы 1-в-1 с iOS DevHarness + дополнения

    private fun egeSpec(text: String, normalize: List<String>) = ResolvedAnswerSpec(
        type = "string", format = "ege_decimal", normalize = normalize, text = text,
    )

    @Test
    fun `ege_decimal exact match with strip spaces`() {
        val spec = egeSpec("0,0009", listOf("strip_spaces", "unicode_minus_to_ascii"))
        assertTrue(AnswerChecker.check(spec, " 0,0009 ").correct)
        assertFalse(AnswerChecker.check(spec, "0.0009").correct)
    }

    @Test
    fun `unicode minus normalizes`() {
        val spec = egeSpec("-5", listOf("unicode_minus_to_ascii"))
        assertTrue(AnswerChecker.check(spec, "−5").correct)
    }

    @Test
    fun `number accepts fraction and comma decimal`() {
        val spec = ResolvedAnswerSpec(type = "number", normalize = listOf("comma_to_dot"), value = 0.5)
        assertTrue(AnswerChecker.check(spec, "1/2").correct)
        assertTrue(AnswerChecker.check(spec, "0,5").correct)
        assertFalse(AnswerChecker.check(spec, "0,6").correct)
    }

    @Test
    fun `number tolerance abs and rel`() {
        val abs = ResolvedAnswerSpec(type = "number", tolerance = Tolerance(abs = 0.01), normalize = emptyList(), value = 3.14)
        assertTrue(AnswerChecker.check(abs, "3.145").correct)
        assertFalse(AnswerChecker.check(abs, "3.16").correct)
        val rel = ResolvedAnswerSpec(type = "number", tolerance = Tolerance(rel = 0.1), normalize = emptyList(), value = 100.0)
        assertTrue(AnswerChecker.check(rel, "109").correct)
        assertFalse(AnswerChecker.check(rel, "115").correct)
    }

    @Test
    fun `text exact and regex with i flag`() {
        val spec = ResolvedAnswerSpec(
            type = "text",
            accept = listOf(
                ru.egetrainer.core.models.AcceptPattern(exact = "да"),
                ru.egetrainer.core.models.AcceptPattern(regex = "^верно$", flags = "i"),
            ),
            normalize = emptyList(),
        )
        assertTrue(AnswerChecker.check(spec, "да").correct)
        assertTrue(AnswerChecker.check(spec, "ВЕРНО").correct)
        assertFalse(AnswerChecker.check(spec, "нет").correct)
    }

    @Test
    fun `parseNumber rejects java-only suffixes and hex floats`() {
        // паритет с JS Number() / Swift Double(): "5d" -> NaN/nil (находка П-Т5)
        assertNull(AnswerChecker.parseNumber("5d"))
        assertNull(AnswerChecker.parseNumber("5f"))
        assertNull(AnswerChecker.parseNumber("0x1p3"))
        assertEquals(1000.0, AnswerChecker.parseNumber("1e3"))
        assertEquals(0.5, AnswerChecker.parseNumber(".5"))
        assertEquals(-2.5, AnswerChecker.parseNumber("-2.5"))
    }

    @Test
    fun `forecast subtopic rounding is half-up like js`() {
        // 62.5 -> 63 (Math.round веба), а не 62 (half-to-even; находка П-Т5)
        val topics = listOf(TopicStat(topicId = "1.1", sectionId = "s1", subtopicLast3AvgPct = 62.5))
        assertEquals(63, ScoreForecast.compute(topics).sectionPctById["s1"])
    }

    @Test
    fun `formatNumber parity with js`() {
        assertEquals("5", AnswerChecker.formatNumber(5.0))
        assertEquals("0.25", AnswerChecker.formatNumber(0.25))
        assertEquals("-12", AnswerChecker.formatNumber(-12.0))
    }

    // MARK: ScoreForecast — спот-чек таблицы и границ

    @Test
    fun `secondary from primary table and interpolation`() {
        assertEquals(70, ScoreForecast.secondaryFromPrimaryExact(12.0))
        assertEquals(0, ScoreForecast.secondaryFromPrimaryExact(0.0))
        assertEquals(14, ScoreForecast.secondaryFromPrimaryExact(2.5)) // 11 + (17-11)*0.5
        assertEquals(6, ScoreForecast.secondaryFromPrimaryExact(1.0))
        assertEquals(70, ScoreForecast.secondaryFromPrimaryExact(15.0)) // clamp сверху
        assertEquals(0, ScoreForecast.secondaryFromPrimaryExact(-1.0)) // clamp снизу
    }

    @Test
    fun `compute aggregates section pct and formats primary text`() {
        val topics = listOf(
            TopicStat(topicId = "1.1", sectionId = "s1", subtopicLast3AvgPct = 100.0),
            TopicStat(topicId = "1.2", sectionId = "s1", subtopicLast3AvgPct = 50.0),
            TopicStat(topicId = "2.1", sectionId = "s2", subtopicLast3AvgPct = 80.0),
            TopicStat(topicId = "3.1", sectionId = "s3", subtopicLast3AvgPct = null), // не входит
        )
        val r = ScoreForecast.compute(topics)
        assertEquals(75, r.sectionPctById["s1"]) // (100+50)/2
        assertEquals(80, r.sectionPctById["s2"])
        assertNull(r.sectionPctById["s3"])
        assertEquals(1.55, r.primaryExact, 1e-9) // 0.75 + 0.8
        assertEquals("1,55", r.primaryText)
    }

    // MARK: ContentService — baseId / numericIdLess / interpolate

    @Test
    fun `baseId drops last numeric segment only for 4plus segments`() {
        assertEquals("8.1.1", ContentService.baseId("8.1.1.1"))
        assertEquals("3.2.1", ContentService.baseId("3.2.1"))   // 3 сегмента — не трогаем
        assertEquals("1.1", ContentService.baseId("1.1"))
        assertEquals("8.1.1.x", ContentService.baseId("8.1.1.x")) // не числовой хвост
        assertEquals("12.4.3.10", ContentService.baseId("12.4.3.10.2"))
    }

    @Test
    fun `numericIdLess compares by numeric segments`() {
        assertTrue(ContentService.numericIdLess("1.10", "2.1"))
        assertTrue(ContentService.numericIdLess("1.2", "1.10"))
        assertFalse(ContentService.numericIdLess("2.1", "1.10"))
        assertFalse(ContentService.numericIdLess("1.1", "1.1"))
    }

    @Test
    fun `interpolate substitutes params with js string semantics`() {
        val svc = ContentService()
        val params = mapOf(
            "a" to JsonPrimitive(5.0),
            "b" to JsonPrimitive("x"),
            "c" to JsonPrimitive(0.25),
        )
        assertEquals(
            "Найдите 5x при 0.25",
            svc.interpolate("Найдите \${a}\${b} при \${c}", params)
        )
        assertEquals("без шаблона", svc.interpolate("без шаблона", params))
        assertEquals("нет ключа: ", svc.interpolate("нет ключа: \${zzz}", params))
    }

    // MARK: StudentPickEngine.rotate — двухпроходная ротация по базам

    private fun rq(qid: String, kind: String, scope: String) = ResolvedQuestion(
        questionId = qid, topicId = scope, protoId = null, manifestPath = null,
        scopeKind = kind, scopeId = scope,
    )

    @Test
    fun `rotate pass1 avoids duplicate bases then pass2 tops up`() {
        // 4 кандидата темы 1.1: две базы (1.1.1.x, 1.1.2.x)
        val cands = listOf(
            rq("1.1.1.1", "topic", "1.1"),
            rq("1.1.1.2", "topic", "1.1"),
            rq("1.1.2.1", "topic", "1.1"),
            rq("1.1.2.2", "topic", "1.1"),
        )
        val used = mutableSetOf<String>()
        val bases = mutableSetOf<String>()
        // want=2 при 2 базах: проход 1 должен взять ПО ОДНОМУ варианту каждой базы
        val out = StudentPickEngine.rotate(
            cands, listOf(Triple("topic", "1.1", 2)), used, bases
        )
        val picked = out["topic:1.1"]!!
        assertEquals(2, picked.size)
        assertEquals(
            setOf("1.1.1", "1.1.2"),
            picked.map { ContentService.baseId(it.questionId) }.toSet(),
        )
        // want=4: добор вторым проходом любыми оставшимися вариантами
        val used2 = mutableSetOf<String>()
        val bases2 = mutableSetOf<String>()
        val out2 = StudentPickEngine.rotate(
            cands, listOf(Triple("topic", "1.1", 4)), used2, bases2
        )
        assertEquals(4, out2["topic:1.1"]!!.size)
    }

    @Test
    fun `rotate groups by bucket attribution and respects used ids`() {
        val cands = listOf(
            rq("1.1.1.1", "topic", "1.1"),
            rq("2.1.1.1", "section", "s2"),
        )
        val used = mutableSetOf("1.1.1.1") // уже взят другим бакетом
        val bases = mutableSetOf<String>()
        val out = StudentPickEngine.rotate(
            cands,
            listOf(Triple("topic", "1.1", 1), Triple("section", "s2", 1)),
            used, bases,
        )
        assertTrue(out["topic:1.1"]!!.isEmpty())
        assertEquals("2.1.1.1", out["section:s2"]!!.single().questionId)
    }

    // MARK: TrainingDraftStore — TTL 12 ч

    @Test
    fun `draft roundtrip and ttl expiry`() {
        var now = 1_000_000L
        val store = TrainingDraftStore(InMemoryKeyValueStore(), clock = { now })
        val draft = TrainingDraftStore.Draft(
            refs = listOf(QuestionRef("1.1", "1.1.1.1")),
            answers = mapOf("1.1|1.1.1.1" to "42"),
            mode = "list", shuffle = true, savedAtMs = now,
        )
        store.save(draft)
        assertEquals(draft, store.load())

        now += 12 * 3600 * 1000 + 1 // за TTL
        assertNull(store.load())
        assertNull(store.load()) // и очищен
    }

    @Test
    fun `draft with empty refs is dropped`() {
        val store = TrainingDraftStore(InMemoryKeyValueStore(), clock = { 0L })
        store.save(TrainingDraftStore.Draft(refs = emptyList(), savedAtMs = 0L))
        assertNull(store.load())
    }

    // MARK: ProtoStatsCache — TTL 60 с + дедупликация конкурентных прогревов

    private fun cacheWith(
        calls: AtomicInteger,
        clock: () -> Long,
        slowMs: Long = 0,
    ) = ProtoStatsCache(
        protoCardsProvider = { topicId ->
            calls.incrementAndGet()
            if (slowMs > 0) delay(slowMs)
            listOf(
                ContentService.ProtoCard(
                    id = "$topicId.1", title = "t", previewStem = "s", previewFigure = null,
                    topicId = topicId, cap = 2, protoIds = listOf("$topicId.1.1", "$topicId.1.2"),
                )
            )
        },
        teacherLast3 = { _, _ -> emptyList() },
        teacherQuestionStats = { _, _ -> emptyList() },
        selfLast3 = { unicIds -> unicIds.map { ProtoLast3Stat(unicId = it, last3Total = 3, last3Correct = 2) } },
        clock = clock,
    )

    @Test
    fun `concurrent loads of same key deduplicate to one provider call`() = runTest {
        val calls = AtomicInteger(0)
        val cache = cacheWith(calls, clock = { 1000L }, slowMs = 300)
        val a = async { cache.load(null, "1.1") }
        val b = async { cache.load(null, "1.1") }
        val ra = a.await()
        val rb = b.await()
        assertEquals(1, calls.get(), "ожидался один сетевой прогрев")
        assertEquals(ra.keys, rb.keys)
        assertEquals(2, ra["1.1.1"]?.last3Correct)
    }

    @Test
    fun `ttl 60s expires cache`() = runTest {
        var now = 0L
        val calls = AtomicInteger(0)
        val cache = cacheWith(calls, clock = { now })
        cache.load(null, "1.1")
        assertEquals(1, calls.get())
        now = 59_000
        cache.load(null, "1.1") // ещё свежо
        assertEquals(1, calls.get())
        now = 61_000
        cache.load(null, "1.1") // протухло — новый прогрев
        assertEquals(2, calls.get())
    }
}
