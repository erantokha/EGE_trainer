package ru.egetrainer.harness

import kotlinx.coroutines.runBlocking
import ru.egetrainer.core.models.AttemptPayload
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.ResolvedAnswerSpec
import ru.egetrainer.core.models.ResolvedQuestion
import ru.egetrainer.core.services.AnswerChecker
import ru.egetrainer.core.services.AuthService
import ru.egetrainer.core.services.ContentService
import ru.egetrainer.core.services.HomeworkService
import ru.egetrainer.core.services.InMemorySessionStore
import ru.egetrainer.core.services.ResolveRequest
import ru.egetrainer.core.services.RutubeUtil
import ru.egetrainer.core.services.ScoreForecast
import ru.egetrainer.core.services.StudentPickEngine
import ru.egetrainer.core.services.StudentService
import ru.egetrainer.core.services.SupabaseClient
import ru.egetrainer.core.services.SupabaseError
import ru.egetrainer.core.services.TeacherService
import java.io.File
import kotlin.system.exitProcess

/**
 * Интеграционный прогон сервисного слоя против live Supabase — порт
 * ios/EGETrainerApp/DevHarness/main.swift (поимённое покрытие проверок iOS
 * + блочная структура по контракту WAND_0_PLAN.md §9).
 *
 * Запуск: ./gradlew :harness:run [--args="--selftest | --block <unit|auth|content|pick|write>"]
 * Креды: env EGE_STUDENT_EMAIL/... (фоллбэк E2E_* из .env.local в корне репо).
 * Write-проверки строго за флагами EGE_WRITE_SUBMIT=1 / EGE_WRITE_CREATE=1.
 */

var passed = 0
var failed = 0

fun check(name: String, condition: Boolean, detail: String = "") {
    val suffix = if (detail.isEmpty()) "" else " — $detail"
    if (condition) {
        passed += 1
        println("OK $name$suffix")
    } else {
        failed += 1
        println("FAIL $name$suffix")
    }
}

data class Creds(
    val studentEmail: String,
    val studentPassword: String,
    val teacherEmail: String,
    val teacherPassword: String,
)

fun loadCreds(): Creds? {
    fun env(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { System.getenv(it)?.takeIf { v -> v.isNotEmpty() } }

    // фоллбэк: .env.local в корне репозитория (как у Playwright e2e)
    val fileVals = mutableMapOf<String, String>()
    var dir: File? = File(System.getProperty("user.dir")).absoluteFile
    repeat(5) {
        val f = File(dir, ".env.local")
        if (f.isFile) {
            f.readLines().forEach { line ->
                val idx = line.indexOf('=')
                if (idx > 0 && !line.trimStart().startsWith("#")) {
                    fileVals[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
                }
            }
            return@repeat
        }
        dir = dir?.parentFile
    }
    fun anyOf(vararg keys: String): String? =
        env(*keys) ?: keys.firstNotNullOfOrNull { fileVals[it]?.takeIf { v -> v.isNotEmpty() } }

    val se = anyOf("EGE_STUDENT_EMAIL", "E2E_STUDENT_EMAIL") ?: return null
    val sp = anyOf("EGE_STUDENT_PASSWORD", "E2E_STUDENT_PASSWORD") ?: return null
    val te = anyOf("EGE_TEACHER_EMAIL", "E2E_TEACHER_EMAIL") ?: return null
    val tp = anyOf("EGE_TEACHER_PASSWORD", "E2E_TEACHER_PASSWORD") ?: return null
    return Creds(se, sp, te, tp)
}

// MARK: Блок unit — AnswerChecker + ScoreForecast (кейсы 1-в-1 с iOS DevHarness)

fun runUnitBlock() {
    println("== unit ==")
    val egeSpec = ResolvedAnswerSpec(
        type = "string", format = "ege_decimal",
        normalize = listOf("strip_spaces", "unicode_minus_to_ascii"), text = "0,0009",
    )
    check("unit.checker.ege_exact", AnswerChecker.check(egeSpec, " 0,0009 ").correct)
    check("unit.checker.ege_wrong", !AnswerChecker.check(egeSpec, "0.0009").correct)
    val minusSpec = ResolvedAnswerSpec(
        type = "string", format = "ege_decimal",
        normalize = listOf("unicode_minus_to_ascii"), text = "-5",
    )
    check("unit.checker.unicode_minus", AnswerChecker.check(minusSpec, "−5").correct)
    val numSpec = ResolvedAnswerSpec(type = "number", normalize = listOf("comma_to_dot"), value = 0.5)
    check("unit.checker.fraction", AnswerChecker.check(numSpec, "1/2").correct)
    check("unit.checker.comma_decimal", AnswerChecker.check(numSpec, "0,5").correct)
    check("unit.checker.wrong_number", !AnswerChecker.check(numSpec, "0,6").correct)
    val intSpec = ResolvedAnswerSpec(type = "number", normalize = emptyList(), value = 5.0)
    check("unit.checker.integer", AnswerChecker.check(intSpec, "5").correct)
    check("unit.checker.tolerance_abs", AnswerChecker.compareNumber(3.145, 3.14, ru.egetrainer.core.models.Tolerance(abs = 0.01)))
    check(
        "unit.checker.text_exact",
        AnswerChecker.matchText("да", listOf(ru.egetrainer.core.models.AcceptPattern(exact = "да")))
    )
    check(
        "unit.checker.text_regex_i",
        AnswerChecker.matchText("ВЕРНО", listOf(ru.egetrainer.core.models.AcceptPattern(regex = "^верно$", flags = "i")))
    )

    check("unit.forecast.p12_70", ScoreForecast.secondaryFromPrimaryExact(12.0) == 70)
    check("unit.forecast.p0_0", ScoreForecast.secondaryFromPrimaryExact(0.0) == 0)
    check("unit.forecast.interp_2_5_14", ScoreForecast.secondaryFromPrimaryExact(2.5) == 14)
    check("unit.forecast.p1_6", ScoreForecast.secondaryFromPrimaryExact(1.0) == 6)
    check("unit.forecast.clamp_hi", ScoreForecast.secondaryFromPrimaryExact(20.0) == 70)
}

// MARK: Блок auth

suspend fun runAuthBlock(creds: Creds): Pair<SupabaseClient, SupabaseClient> {
    println("== auth ==")
    // Сценарий D1: неверный пароль
    val badClient = SupabaseClient(InMemorySessionStore())
    try {
        badClient.signIn(creds.studentEmail, "wrong-password-123")
        check("auth.bad_password", false, "вход с неверным паролем не отклонён")
    } catch (e: SupabaseError.InvalidCredentials) {
        check("auth.bad_password", true, e.userMessage)
    } catch (e: SupabaseError) {
        check("auth.bad_password", true, "иной формат: ${e.userMessage}")
    }

    val stClient = SupabaseClient(InMemorySessionStore())
    val stSession = stClient.signIn(creds.studentEmail, creds.studentPassword)
    check("auth.student.signin", stSession.accessToken.isNotEmpty(), stSession.user.id)

    val refreshed = stClient.refreshSession()
    check("auth.refresh", refreshed != null, "refresh-токен работает (сценарий C)")

    val stProfile = AuthService(stClient).fetchMyProfile()
    check("auth.profile", stProfile.role == "student", stProfile.displayName)

    val teClient = SupabaseClient(InMemorySessionStore())
    val teSession = teClient.signIn(creds.teacherEmail, creds.teacherPassword)
    check("auth.teacher.signin", teSession.accessToken.isNotEmpty(), teSession.user.id)

    return Pair(stClient, teClient)
}

// MARK: Блок content

suspend fun runContentBlock(content: ContentService) {
    println("== content ==")
    val catalog = content.loadCatalog()
    check(
        "content.index",
        catalog.size > 50 && catalog.count { it.isSection } >= 10,
        "${catalog.size} записей, секций: ${catalog.count { it.isSection }}"
    )

    val sections = content.sectionsWithTopics()
    check("content.sections_12", sections.size == 12, "${sections.size}")

    val firstTopic = sections.firstOrNull()?.second?.firstOrNull()
    val man = firstTopic?.let { content.manifest(it) }
    check(
        "content.manifest",
        man?.types.orEmpty().isNotEmpty(),
        "тема ${firstTopic?.id}: типов ${man?.types?.size ?: 0}, прототипов ${man?.types.orEmpty().sumOf { it.prototypes?.size ?: 0 }}"
    )

    val qs = firstTopic?.let { content.randomQuestions(it, 2) } ?: emptyList()
    val q = qs.firstOrNull()
    check(
        "content.build",
        q != null && q.stem.isNotEmpty() && (q.spec.text != null || q.spec.value != null),
        q?.let { "${it.questionId}: ${it.stem.take(50)}..." } ?: "не собрано"
    )
    val withFigure = sections.asSequence()
        .flatMap { it.second.asSequence() }
        .take(15)
        .toList()
    var figureURL: String? = null
    for (t in withFigure) {
        val m = content.manifest(t) ?: continue
        val proto = m.types.orEmpty().asSequence()
            .flatMap { (it.prototypes ?: emptyList()).asSequence().map { p -> Pair(it, p) } }
            .firstOrNull { (type, p) -> (p.figure ?: type.figure)?.img != null }
        if (proto != null) {
            figureURL = content.figureURL(proto.second.figure ?: proto.first.figure)
            break
        }
    }
    check(
        "content.figure_url",
        figureURL?.startsWith("https://ege-trainer.ru/") == true,
        figureURL ?: "картинка не найдена в первых темах"
    )

    val videoMap = content.videoMapSnapshot()
    if (videoMap.isEmpty()) {
        check("content.video", false, "rutube_map.json пуст/недоступен")
    } else {
        val (key, _) = videoMap.entries.first()
        val direct = content.videoURL(key)
        val embed = direct?.let { RutubeUtil.embedURL(it) }
        check(
            "content.video",
            embed?.contains("play/embed") == true,
            "ключей: ${videoMap.size}; $key -> $embed"
        )
    }
}

// MARK: Блок pick

suspend fun runPickBlock(stClient: SupabaseClient, content: ContentService) {
    println("== pick ==")
    // юнит: спред — проход 1 не дублирует базы
    val cands = listOf(
        ResolvedQuestion("1.1.1.1", "1.1", scopeKind = "topic", scopeId = "1.1"),
        ResolvedQuestion("1.1.1.2", "1.1", scopeKind = "topic", scopeId = "1.1"),
        ResolvedQuestion("1.1.2.1", "1.1", scopeKind = "topic", scopeId = "1.1"),
    )
    val rotated = StudentPickEngine.rotate(
        cands, listOf(Triple("topic", "1.1", 2)), mutableSetOf(), mutableSetOf()
    )["topic:1.1"].orEmpty()
    check(
        "pick.spread",
        rotated.map { ContentService.baseId(it.questionId) }.toSet().size == 2,
        "want=2 при 2 базах -> базы ${rotated.map { ContentService.baseId(it.questionId) }}"
    )

    val student = StudentService(stClient)
    val sections = content.sectionsWithTopics()
    val firstSection = sections.first()
    val firstTopic = firstSection.second.first()
    val cards = content.protoCards(firstTopic)
    val protoBase = cards.firstOrNull()?.id

    // живой resolve-батч: ОДИН вызов, 3 бакета разных scope_kind
    val requests = buildList {
        if (protoBase != null) add(ResolveRequest("proto", protoBase, 2))
        add(ResolveRequest("topic", firstTopic.id, 3))
        add(ResolveRequest("section", firstSection.first.id, 3))
    }
    val resolved = student.resolveFiltered(requests, filterId = null, excludeQuestionIds = emptyList(), seed = "424242")
    val kinds = resolved.mapNotNull { it.scopeKind }.toSet()
    val allAttributed = resolved.all { it.scopeKind != null && it.scopeId != null }
    check(
        "pick.resolve.batch",
        resolved.isNotEmpty() && allAttributed && kinds.containsAll(requests.map { it.scopeKind }.toSet()),
        "ОДИН RPC-вызов, бакетов=${requests.size} (${requests.joinToString { it.scopeKind + ":" + it.scopeId }}), " +
            "вернулось ${resolved.size}, scope_kinds в ответе: $kinds"
    )

    // живой фильтрованный подбор через движок (фильтр = приоритет, добор без фильтра).
    // Эталон корректности: итог >0, без дублей, и НЕ ХУЖЕ того, что даёт
    // фильтрованный батч сам по себе (= добор сработал). Дефицит при
    // исчерпании кандидатов сервера — ЧЕСТНЫЙ shortage (паритет веба/iOS),
    // не ошибка движка.
    val secondTopic = firstSection.second.getOrNull(1) ?: firstTopic
    val selection = StudentPickEngine.Selection(
        topicCounts = mapOf(firstTopic.id to 2, secondTopic.id to 2),
    )
    val filterOnly = run {
        val reqs = listOf(
            ResolveRequest("topic", firstTopic.id, 8),
            ResolveRequest("topic", secondTopic.id, 8),
        )
        val cand = student.resolveFiltered(reqs, "unseen_low", emptyList(), "424243")
        StudentPickEngine.rotate(
            cand,
            listOf(Triple("topic", firstTopic.id, 2), Triple("topic", secondTopic.id, 2)),
            mutableSetOf(), mutableSetOf(),
        ).values.sumOf { it.size }
    }
    val picked = StudentPickEngine.pick(selection, sections, "unseen_low", student, content)
    val noDups = picked.map { it.questionId }.toSet().size == picked.size
    check(
        "pick.filtered",
        picked.isNotEmpty() && noDups && picked.size >= filterOnly && picked.size <= selection.total,
        "фильтр unseen_low дал $filterOnly, с добором без фильтра ${picked.size} из ${selection.total}" +
            (if (picked.size < selection.total) " (остаток — исчерпание кандидатов сервера: честный shortage)" else "")
    )
}

// MARK: Блоки student / teacher / access (полный прогон)

suspend fun runStudentBlock(stClient: SupabaseClient, content: ContentService) {
    println("== student ==")
    val stHomework = HomeworkService(stClient)
    val stStudent = StudentService(stClient)

    val summary = stHomework.myHomeworksSummary()
    check("hw.summary", summary.totalCount > 0, "всего ${summary.totalCount}, несданных ${summary.pendingCount}")

    val submitted = summary.items.firstOrNull { it.isSubmitted }
    if (submitted == null) {
        check("hw.by_token", false, "нет сданного ДЗ у тестового ученика")
        return
    }
    val hw = stHomework.homework(byToken = submitted.token)
    check("hw.by_token", hw.homeworkId == submitted.homeworkId, hw.title ?: "")
    check("hw.refs", hw.questionRefs.isNotEmpty(), "${hw.questionRefs.size} шт. из frozen_questions")

    val questions = content.buildQuestions(hw.questionRefs)
    check(
        "content.build.hw",
        questions.size == hw.questionRefs.size,
        questions.firstOrNull()?.stem?.take(60)?.plus("...") ?: ""
    )
    questions.firstOrNull()?.let { q ->
        check(
            "content.answer_spec",
            q.spec.text != null || q.spec.value != null,
            "type=${q.spec.type} format=${q.spec.format ?: "-"}"
        )
    }

    val attempt = stHomework.attempt(byToken = submitted.token)
    check("hw.attempt_by_token", attempt?.isFinished == true, "верно ${attempt?.correct ?: -1} из ${attempt?.total ?: -1}")
    check("hw.attempt_payload", (attempt?.payload?.questions?.size ?: 0) > 0)

    val archive = stHomework.archive(offset = 0, limit = 10)
    check("hw.archive", archive.isNotEmpty(), "архив: ${archive.size} строк (offset=0, limit=10)")

    val analytics = stStudent.analytics(scope = "self", days = 30, source = "all")
    check(
        "analytics.self",
        (analytics.topics?.size ?: 0) > 0,
        "${analytics.topics?.size ?: 0} подтем, ${analytics.sections?.size ?: 0} секций"
    )
    val forecast = ScoreForecast.compute(analytics.topics.orEmpty())
    check("forecast.computed", forecast.secondary > 0, "первичные ${forecast.primaryText}, вторичные ${forecast.secondary}")

    val pickingSelf = stStudent.pickingScreenSelf(filterId = null)
    check("picking.self_gate", (pickingSelf.sections?.size ?: 0) == 12, "self-гейт teacher_picking_screen_v2: ${pickingSelf.sections?.size} секций")

    val teachers = stStudent.myTeachers()
    check("consent.my_teachers", teachers.isNotEmpty(), teachers.firstOrNull()?.displayName ?: "")
    stStudent.incomingTeacherRequests()
    check("consent.incoming_readable", true)
}

suspend fun runTeacherBlock(
    teClient: SupabaseClient,
    stClient: SupabaseClient,
    content: ContentService,
    creds: Creds,
    writeSubmit: Boolean,
    writeCreate: Boolean,
) {
    println("== teacher ==")
    val teAuth = AuthService(teClient)
    val teTeacher = TeacherService(teClient)
    val teStudentSvc = StudentService(teClient)
    val teHomework = HomeworkService(teClient)

    val teProfile = teAuth.fetchMyProfile()
    check("teacher.profile", teProfile.role == "teacher", teProfile.displayName)

    val students = teTeacher.listMyStudents()
    check("teacher.students", students.isNotEmpty(), "${students.size} учеников")

    val summaries = teTeacher.studentsSummary()
    check("teacher.summary", summaries.isNotEmpty(), "${summaries.size}")

    teTeacher.outgoingRequests()
    check("consent.outgoing_readable", true)

    val target = students.firstOrNull { it.email == creds.studentEmail } ?: students.firstOrNull()
    if (target == null) {
        check("teacher.target_student", false, "нет ученика для проверки")
        return
    }

    val picking = teTeacher.pickingScreen(target.studentId)
    check(
        "teacher.picking_screen",
        (picking.sections?.size ?: 0) == 12,
        "${picking.sections?.size ?: 0} секций, seed=${picking.screen?.sessionSeed?.take(8) ?: ""}"
    )

    val teAnalytics = teStudentSvc.analytics(scope = "teacher", studentId = target.studentId)
    check("analytics.teacher", (teAnalytics.topics?.size ?: 0) > 0)

    val protoStats = run {
        val sections = content.sectionsWithTopics()
        val topic = sections.first().second.first()
        val cards = content.protoCards(topic)
        val unicIds = cards.map { it.id }.take(20)
        val rows = teTeacher.protoLast3(target.studentId, unicIds)
        Pair(unicIds.size, rows.size)
    }
    check("teacher.proto_last3", protoStats.first > 0, "запрошено ${protoStats.first} unic, строк ${protoStats.second}")

    val selfStats = run {
        val sections = content.sectionsWithTopics()
        val topic = sections.first().second.first()
        val cards = content.protoCards(topic)
        // self-RPC зовётся ПОД ТОКЕНОМ УЧЕНИКА (scope auth.uid())
        TeacherService(stClient).protoLast3Self(cards.map { it.id }.take(20))
    }
    check("student.proto_last3_self", true, "self-строк ${selfStats.size} (RPC отвечает под токеном ученика)")

    val attempts = teTeacher.studentAttempts(target.studentId)
    check("teacher.attempts", attempts.isNotEmpty(), "${attempts.size} работ")

    attempts.firstOrNull()?.let { firstAttempt ->
        val report = teHomework.attemptForTeacher(firstAttempt.attemptId)
        check("teacher.attempt_report", report.payload?.questions != null, report.homeworkTitle ?: "")
    }

    val topicWithData = picking.sections?.firstOrNull()?.topics?.firstOrNull()
    if (topicWithData != null) {
        val resolved = teTeacher.resolveBatch(target.studentId, mapOf(topicWithData.topicId to 2))
        check(
            "teacher.resolve_batch",
            resolved.isNotEmpty(),
            "${resolved.size} задач: ${resolved.joinToString { it.questionId }}"
        )
    }

    // MARK: write (строго за флагами)
    if (writeSubmit) {
        println("== write.submit ==")
        val stHomework = HomeworkService(stClient)
        val stProfile = AuthService(stClient).fetchMyProfile()
        val summary = stHomework.myHomeworksSummary()
        val pending = summary.items.firstOrNull { !it.isSubmitted }
        if (pending == null) {
            check("write.submit", false, "нет несданного ДЗ")
        } else {
            val pendingHw = stHomework.homework(byToken = pending.token)
            val qs = content.buildQuestions(pendingHw.questionRefs)
            val started = stHomework.startAttempt(pending.token, stProfile.hwStudentName)
            check(
                "write.start_attempt",
                started.resolvedAttemptId != null,
                "attempt=${started.resolvedAttemptId ?: "-"} already=${started.alreadyExists == true}"
            )
            val attemptId = started.resolvedAttemptId
            if (attemptId != null) {
                val items = qs.map { q ->
                    val res = AnswerChecker.check(q.spec, q.spec.text ?: AnswerChecker.formatNumber(q.spec.value ?: 0.0))
                    AttemptQuestion(
                        questionId = q.questionId, topicId = q.topicId, correct = res.correct,
                        chosenText = res.chosenText, correctText = res.correctText,
                        normalizedText = res.normalizedText, timeMs = 1000, difficulty = q.difficulty,
                    )
                }
                val payload = AttemptPayload(
                    title = pendingHw.title, homeworkId = pendingHw.homeworkId,
                    studentName = stProfile.hwStudentName, questions = items,
                )
                val result = stHomework.submitAttempt(
                    attemptId = attemptId, payload = payload, total = items.size,
                    correct = items.count { it.correct == true }, durationMs = 4000,
                )
                check("write.submit", result.attemptId != null, "верно ${result.correct ?: -1} из ${result.total ?: -1}")
            }
        }
    }

    if (writeCreate) {
        println("== write.create ==")
        val resolved = teTeacher.resolveBatch(target.studentId, mapOf("1.1" to 1, "2.1" to 1))
        val refs = resolved.map { QuestionRef(topicId = it.topicId ?: "", questionId = it.questionId) }
        check("write.create_pick", refs.isNotEmpty(), "${refs.size} задач")
        val created = teTeacher.createHomework(
            title = "android-smoke ${System.currentTimeMillis() % 100000}",
            questions = refs,
            assignToStudentId = target.studentId,
        )
        check("write.create", created.token.isNotEmpty(), created.url)
        // Проверяем глазами ученика: ДЗ открывается по токену
        val visible = HomeworkService(stClient).homework(byToken = created.token)
        check("write.create_visible", visible.homeworkId == created.homeworkId)
    }
}

suspend fun runAccessBlock(teClient: SupabaseClient) {
    println("== access ==")
    try {
        TeacherService(teClient).studentAttempts("00000000-0000-0000-0000-000000000000")
        check("access.denied_foreign_student", false, "RPC вернул данные")
    } catch (e: SupabaseError) {
        check("access.denied_foreign_student", true, e.userMessage)
    }
}

fun main(args: Array<String>) {
    if (args.contains("--selftest")) {
        println("HARNESS_SELFTEST_OK")
        return
    }

    val blockIdx = args.indexOf("--block")
    val block = if (blockIdx >= 0) args.getOrNull(blockIdx + 1) else null

    if (block == "unit") {
        runUnitBlock()
        println("TOTAL ok=$passed fail=$failed")
        exitProcess(if (failed == 0) 0 else 1)
    }

    val creds = loadCreds()
    if (creds == null) {
        println("Задайте EGE_STUDENT_EMAIL/EGE_STUDENT_PASSWORD/EGE_TEACHER_EMAIL/EGE_TEACHER_PASSWORD (или E2E_* в .env.local)")
        exitProcess(2)
    }

    val writeSubmit = System.getenv("EGE_WRITE_SUBMIT") == "1"
    val writeCreate = System.getenv("EGE_WRITE_CREATE") == "1"

    runBlocking {
        val content = ContentService.shared
        when (block) {
            null -> {
                runUnitBlock()
                val (stClient, teClient) = runAuthBlock(creds)
                runContentBlock(content)
                runStudentBlock(stClient, content)
                runPickBlock(stClient, content)
                runTeacherBlock(teClient, stClient, content, creds, writeSubmit, writeCreate)
                runAccessBlock(teClient)
            }
            "auth" -> runAuthBlock(creds)
            "content" -> runContentBlock(content)
            "pick" -> {
                val (stClient, _) = runAuthBlock(creds)
                runPickBlock(stClient, content)
            }
            "pickdiag" -> {
                val (stClient, _) = runAuthBlock(creds)
                val student = StudentService(stClient)
                val sections = content.sectionsWithTopics()
                val t1 = sections.first().second[0]
                val t2 = sections.first().second.getOrNull(1) ?: t1
                val reqs = listOf(ResolveRequest("topic", t1.id, 8), ResolveRequest("topic", t2.id, 8))
                val cand = student.resolveFiltered(reqs, "unseen_low", emptyList(), "424242")
                println("DIAG filtered: всего=${cand.size} " +
                    "по бакетам=${cand.groupBy { "${it.scopeKind}:${it.scopeId}" }.mapValues { it.value.size }}")
                val usedIds = mutableSetOf<String>(); val usedBases = mutableSetOf<String>()
                val rot = StudentPickEngine.rotate(cand,
                    listOf(Triple("topic", t1.id, 2), Triple("topic", t2.id, 2)), usedIds, usedBases)
                println("DIAG rotate: ${rot.mapValues { it.value.map { q -> q.questionId } }}")
                val deficits = listOf(Triple("topic", t1.id, 2), Triple("topic", t2.id, 2)).mapNotNull { (k, i, w) ->
                    val got = rot["$k:$i"]?.size ?: 0
                    if (got < w) Triple(k, i, w - got) else null
                }
                println("DIAG deficits: $deficits")
                if (deficits.isNotEmpty()) {
                    val topup = student.resolveFiltered(
                        deficits.map { ResolveRequest(it.first, it.second, minOf(it.third + 6, 40)) },
                        null, usedIds.toList(), "424242")
                    println("DIAG topup: всего=${topup.size} " +
                        "по бакетам=${topup.groupBy { "${it.scopeKind}:${it.scopeId}" }.mapValues { it.value.size }} " +
                        "ids=${topup.map { it.questionId }}")
                    val extra = StudentPickEngine.rotate(topup, deficits, usedIds, usedBases)
                    println("DIAG extra: ${extra.mapValues { it.value.map { q -> q.questionId } }}")
                }
                val refs = (rot.values.flatten()).map { QuestionRef(it.topicId ?: "", it.questionId) }
                println("DIAG refs=${refs.size} built=${content.buildQuestions(refs).size}")
            }
            "write" -> {
                val (stClient, teClient) = runAuthBlock(creds)
                runTeacherBlock(
                    teClient, stClient, content, creds,
                    writeSubmit = true, writeCreate = true,
                )
            }
            else -> {
                println("Неизвестный блок: $block (доступно: unit|auth|content|pick|write)")
                exitProcess(2)
            }
        }
    }

    println("TOTAL ok=$passed fail=$failed")
    exitProcess(if (failed == 0) 0 else 1)
}
