package ru.egetrainer.core.models

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import ru.egetrainer.core.AppJson
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Тесты декодирования моделей на фикстурах реальных форм ответов
 * (источники форм: Swift-модели iOS-приложения и docs/supabase).
 * Гейт П-Т3 плана WAND_0_PLAN.md §9.
 */
class ModelDecodingTest {

    // MARK: AuthSession / Profile

    @Test
    fun `AuthSession decodes with expires_at`() {
        val json = """
            {"access_token":"at1","refresh_token":"rt1","expires_at":1765000000,
             "token_type":"bearer","user":{"id":"u1","email":"s@x.ru","aud":"authenticated"}}
        """.trimIndent()
        val s = AppJson.decodeFromString(AuthSession.serializer(), json).normalized()
        assertEquals("at1", s.accessToken)
        assertEquals(1765000000.0, s.expiresAt)
        assertEquals("u1", s.user.id)
    }

    @Test
    fun `AuthSession computes expires_at from expires_in when absent`() {
        val json = """
            {"access_token":"at2","refresh_token":"rt2","expires_in":3600,
             "user":{"id":"u2"}}
        """.trimIndent()
        val now = 1_700_000_000.0
        val s = AppJson.decodeFromString(AuthSession.serializer(), json).normalized(nowEpochSeconds = now)
        assertNotNull(s.expiresAt)
        assertTrue(abs(s.expiresAt!! - (now + 3600.0)) < 1.0)
    }

    @Test
    fun `Profile decodes and ignores unknown keys`() {
        val json = """
            {"id":"p1","email":"a@b.ru","role":"student","first_name":"Иван",
             "last_name":"Петров","student_grade":11,"profile_completed":true,
             "created_at":"2026-01-01","some_future_field":{"x":1}}
        """.trimIndent()
        val p = AppJson.decodeFromString(Profile.serializer(), json)
        assertEquals("Иван Петров", p.displayName)
        assertFalse(p.needsCompletion)
        assertFalse(p.isTeacher)
        assertEquals("Иван", p.hwStudentName)
    }

    @Test
    fun `Profile without role needs completion`() {
        val p = AppJson.decodeFromString(Profile.serializer(), """{"id":"p2","email":"x@y.ru"}""")
        assertTrue(p.needsCompletion)
        assertEquals("x", p.displayName)
    }

    // MARK: ContentModels

    @Test
    fun `TopicManifest decodes with snake answer_spec and number text`() {
        val json = """
            {"topic":"8.1","title":"Производные","types":[{
               "id":"8.1.1","title":"Тип 1",
               "defaults":{"difficulty":2,"normalize":["strip_spaces"]},
               "answer_spec":{"type":"string","format":"ege_decimal","normalize":["comma_to_dot"]},
               "prototypes":[
                 {"id":"8.1.1.1","stem":"Найдите...","answer":{"text":5},"params":{"a":2,"b":"х"}},
                 {"id":"8.1.1.2","stem":"Вычислите...","answer":{"text":"0,25","value":0.25}}
               ]}]}
        """.trimIndent()
        val m = AppJson.decodeFromString(TopicManifest.serializer(), json)
        val type = m.types!!.first()
        assertEquals("ege_decimal", type.answerSpec?.format)
        // числовой text "5" -> строка "5" (interpolationText parity)
        assertEquals("5", type.prototypes!![0].answer?.text)
        assertEquals("0,25", type.prototypes!![1].answer?.text)
        assertEquals(0.25, type.prototypes!![1].answer?.value)
    }

    @Test
    fun `TaskType supports camelCase answerSpec key`() {
        val json = """{"id":"1.1.1","answerSpec":{"type":"number"}}"""
        val t = AppJson.decodeFromString(TaskType.serializer(), json)
        assertEquals("number", t.answerSpec?.type)
    }

    @Test
    fun `CatalogEntry selectable logic`() {
        val topic = AppJson.decodeFromString(
            CatalogEntry.serializer(),
            """{"id":"1.1","parent":"sec1","path":"content/tasks/01/1_1.json"}"""
        )
        assertTrue(topic.isSelectableTopic)
        val hidden = AppJson.decodeFromString(
            CatalogEntry.serializer(),
            """{"id":"1.2","parent":"sec1","path":"p.json","hidden":true}"""
        )
        assertFalse(hidden.isSelectableTopic)
        val group = AppJson.decodeFromString(
            CatalogEntry.serializer(),
            """{"id":"sec1","type":"group","title":"Раздел 1"}"""
        )
        assertTrue(group.isSection)
    }

    // MARK: HomeworkModels

    @Test
    fun `Homework frozen_questions as jsonb array`() {
        val json = """
            {"homework_id":"hw1","title":"ДЗ",
             "frozen_questions":[{"topic_id":"1.1","question_id":"q1"}],
             "spec_json":{"fixed":[{"topic_id":"2.2","question_id":"q9"}]},
             "kind":"graded","is_active":true}
        """.trimIndent()
        val hw = AppJson.decodeFromString(Homework.serializer(), json)
        assertEquals(listOf(QuestionRef("1.1", "q1")), hw.questionRefs)
    }

    @Test
    fun `Homework frozen_questions as serialized string falls back correctly`() {
        val json = """
            {"homework_id":"hw2",
             "frozen_questions":"[{\"topic_id\":\"3.1\",\"question_id\":\"q7\"}]"}
        """.trimIndent()
        val hw = AppJson.decodeFromString(Homework.serializer(), json)
        assertEquals(listOf(QuestionRef("3.1", "q7")), hw.questionRefs)
    }

    @Test
    fun `Homework without frozen uses spec_json fixed`() {
        val json = """
            {"homework_id":"hw3","spec_json":{"fixed":[{"topic_id":"2.2","question_id":"q9"}],"shuffle":true}}
        """.trimIndent()
        val hw = AppJson.decodeFromString(Homework.serializer(), json)
        assertEquals("q9", hw.questionRefs.single().questionId)
        assertEquals(true, hw.specJson?.shuffle)
    }

    @Test
    fun `HomeworkArchivePage parses bare array and items object with key fallbacks`() {
        val bare = AppJson.parseToJsonElement(
            """[{"title":"ДЗ 1","hw_token":"tok1","finished_at":"2026-06-01","correct":3,"total":5}]"""
        )
        val items1 = HomeworkArchivePage.parse(bare)
        assertEquals("tok1", items1.single().token)
        assertTrue(items1.single().isSubmitted) // finished_at -> submittedAt fallback
        assertEquals(3, items1.single().correct)

        val wrapped = AppJson.parseToJsonElement(
            """{"items":[{"title":"ДЗ 2","link_token":"tok2","is_submitted":false,"created_at":"2026-06-02"}]}"""
        )
        val items2 = HomeworkArchivePage.parse(wrapped)
        assertEquals("tok2", items2.single().token)
        assertFalse(items2.single().isSubmitted)
        assertEquals("2026-06-02", items2.single().assignedAt)
    }

    @Test
    fun `HomeworkSummary and list item decode`() {
        val json = """
            {"items":[{"token":"t1","homework_id":"h1","is_submitted":true,
                       "submitted_at":"2026-06-01","correct":2,"total":2}],
             "total_count":11,"archive_count":1,"pending_count":8}
        """.trimIndent()
        val s = AppJson.decodeFromString(HomeworkSummary.serializer(), json)
        assertEquals(11, s.totalCount)
        assertEquals(8, s.pendingCount)
        assertTrue(s.items.single().isSubmitted)
        assertEquals("Домашнее задание", s.items.single().displayTitle)
    }

    @Test
    fun `StartAttemptResult resolves attempt id from either key`() {
        val a = AppJson.decodeFromString(StartAttemptResult.serializer(), """{"attempt_id":"a1"}""")
        assertEquals("a1", a.resolvedAttemptId)
        val b = AppJson.decodeFromString(StartAttemptResult.serializer(), """{"id":"a2","already_exists":true}""")
        assertEquals("a2", b.resolvedAttemptId)
    }

    @Test
    fun `HomeworkAttempt decode with payload`() {
        val json = """
            {"attempt_id":"at1","homework_id":"h1","finished_at":"2026-06-01T10:00:00Z",
             "total":2,"correct":1,
             "payload":{"title":"ДЗ","questions":[
                {"question_id":"q1","topic_id":"1.1","correct":true,"chosen_text":"5",
                 "correct_text":"5","time_ms":1200}]}}
        """.trimIndent()
        val a = AppJson.decodeFromString(HomeworkAttempt.serializer(), json)
        assertTrue(a.isFinished)
        assertEquals("at1", a.resolvedId)
        assertEquals(1, a.payload?.questions?.size)
    }

    // MARK: TeacherModels

    @Test
    fun `PickingScreen decodes sections topics states`() {
        val json = """
            {"screen":{"mode":"init","can_pick":true,"session_seed":"abcd1234",
                       "supported_filters":["unseen_low","stale","unstable","weak_spots"]},
             "student":{"days":30,"source":"all","student_id":"st1"},
             "sections":[{"section_id":"s1","title":"Раздел 1","sort_order":1,
                "filter_counts":{"stale":2,"unseen_low":5},
                "topics":[{"topic_id":"1.1","title":"Тема",
                   "coverage":{"total_proto_count":7,"covered_proto_count":3},
                   "progress":{"all_time_pct":66,"subtopic_last3_avg_pct":0.5},
                   "topic_state":{"is_stale":true,"is_not_seen":false}}]}]}
        """.trimIndent()
        val p = AppJson.decodeFromString(PickingScreen.serializer(), json)
        assertEquals("abcd1234", p.screen?.sessionSeed)
        assertEquals(1, p.sections?.size)
        val topic = p.sections!!.first().topics!!.first()
        assertEquals(true, topic.topicState?.isStale)
        assertEquals(3, topic.coverage?.coveredProtoCount)
        assertEquals(5, p.sections!!.first().filterCounts?.unseenLow)
    }

    @Test
    fun `ResolveBatchResult decodes picked and shortages`() {
        val json = """
            {"picked_questions":[
                {"question_id":"q1","topic_id":"1.1","proto_id":"1.1.1",
                 "scope_kind":"topic","scope_id":"1.1"}],
             "shortages":[{"scope_id":"2.1","is_shortage":true,"requested_n":5,"returned_n":2}]}
        """.trimIndent()
        val r = AppJson.decodeFromString(ResolveBatchResult.serializer(), json)
        assertEquals("topic", r.pickedQuestions?.single()?.scopeKind)
        assertEquals(2, r.shortages?.single()?.returnedN)
    }

    @Test
    fun `ProtoLast3Stat decodes teacher and self forms`() {
        val teacher = AppJson.decodeFromString(
            ProtoLast3Stat.serializer(),
            """{"unic_id":"8.1.1","last3_total":3,"last3_correct":2}"""
        )
        assertNull(teacher.lastAttemptAt)
        val self = AppJson.decodeFromString(
            ProtoLast3Stat.serializer(),
            """{"unic_id":"8.1.1","last3_total":3,"last3_correct":2,
                "total":15,"correct":11,"last_attempt_at":"2026-06-01"}"""
        )
        assertEquals(15, self.total)
        assertEquals("2026-06-01", self.lastAttemptAt)
    }

    @Test
    fun `consent models decode`() {
        val inc = AppJson.decodeFromString(
            IncomingTeacherRequest.serializer(),
            """{"request_id":"r1","teacher_id":"t1","teacher_email":"t@x.ru","status":"pending"}"""
        )
        assertEquals("r1", inc.id)
        val out = AppJson.decodeFromString(
            OutgoingStudentRequest.serializer(),
            """{"request_id":"r2","student_email":"s@x.ru","status":"pending"}"""
        )
        assertEquals("r2", out.id)
        val mt = AppJson.decodeFromString(
            MyTeacher.serializer(),
            """{"teacher_id":"t1","teacher_name":null,"teacher_email":"t@x.ru"}"""
        )
        assertEquals("t@x.ru", mt.displayName)
    }

    // MARK: AnalyticsModels

    @Test
    fun `AnalyticsScreen decodes and Counter pct rounds`() {
        val json = """
            {"overall":{"last3":{"total":3,"correct":2},"all_time":{"total":200,"correct":145},
                        "last_seen_at":"2026-06-10"},
             "student":{"days":30,"viewer_scope":"self","display_name":"Иван"},
             "sections":[{"section_id":"s1","title":"Р1","coverage":{"pct":40,"unics_total":10,"unics_attempted":4}}],
             "topics":[{"topic_id":"1.1","section_id":"s1","last3":{"total":3,"correct":1},
                        "derived":{"performance_state":"weak","freshness_state":"stale"},
                        "subtopic_last3_avg_pct":33.3}],
             "generated_at":"2026-06-12"}
        """.trimIndent()
        val a = AppJson.decodeFromString(AnalyticsScreen.serializer(), json)
        assertEquals(67, a.overall?.last3?.pct) // 2/3 -> 66.67 -> 67
        assertEquals(73, a.overall?.allTime?.pct) // 145/200 = 72.5 -> 73 (round half up)
        assertEquals("weak", a.topics?.single()?.derived?.performanceState)
        assertEquals("2/3", a.overall!!.last3!!.ratioText)
    }

    @Test
    fun `Counter pct null when no attempts`() {
        val c = AppJson.decodeFromString(Counter.serializer(), """{"total":0,"correct":0}""")
        assertNull(c.pct)
    }

    // MARK: негатив — терпимость к незнакомым полям во вложенных структурах

    @Test
    fun `unknown nested fields are ignored everywhere`() {
        val json = """
            {"homework_id":"h9","new_server_field":123,
             "spec_json":{"fixed":[],"future":{"a":1}},"kind":"session"}
        """.trimIndent()
        val hw = AppJson.decodeFromString(Homework.serializer(), json)
        assertEquals("session", hw.kind)
        assertTrue(hw.questionRefs.isEmpty())
    }

    @Test
    fun `raw json object fixture survives reserialization of params`() {
        val m = AppJson.decodeFromString(
            TopicManifest.serializer(),
            """{"types":[{"id":"t","prototypes":[{"id":"p","params":{"a":1,"s":"x","arr":[1,2]}}]}]}"""
        )
        val params: JsonObject? = m.types?.first()?.prototypes?.first()?.params?.let {
            AppJson.parseToJsonElement(AppJson.encodeToString(
                kotlinx.serialization.json.JsonObject.serializer(), JsonObject(it)
            )).jsonObject
        }
        assertEquals(3, params?.size)
    }
}
