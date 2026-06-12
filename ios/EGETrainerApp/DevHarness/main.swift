// Интеграционный прогон сервисного слоя iOS-приложения против live Supabase.
// Компилируется на macOS вместе с Models/* и Services/* (без UI):
//   swiftc -o /tmp/ege_harness Models/*.swift Services/*.swift DevHarness/main.swift
// Креды тестовых аккаунтов читает из переменных окружения (см. .env.local репо):
//   EGE_STUDENT_EMAIL / EGE_STUDENT_PASSWORD / EGE_TEACHER_EMAIL / EGE_TEACHER_PASSWORD
// Скрипт максимально read-only; единственные записи указаны явно флагами ниже.

import Foundation

let WRITE_SUBMIT_HOMEWORK = ProcessInfo.processInfo.environment["EGE_WRITE_SUBMIT"] == "1"
let WRITE_CREATE_HOMEWORK = ProcessInfo.processInfo.environment["EGE_WRITE_CREATE"] == "1"

var passed = 0
var failed = 0

func check(_ name: String, _ condition: Bool, _ detail: String = "") {
    if condition {
        passed += 1
        print("  ✅ \(name)\(detail.isEmpty ? "" : " — \(detail)")")
    } else {
        failed += 1
        print("  ❌ \(name)\(detail.isEmpty ? "" : " — \(detail)")")
    }
}

func env(_ key: String) -> String? {
    ProcessInfo.processInfo.environment[key]
}

guard let studentEmail = env("EGE_STUDENT_EMAIL"),
      let studentPassword = env("EGE_STUDENT_PASSWORD"),
      let teacherEmail = env("EGE_TEACHER_EMAIL"),
      let teacherPassword = env("EGE_TEACHER_PASSWORD")
else {
    print("Задайте EGE_STUDENT_EMAIL/EGE_STUDENT_PASSWORD/EGE_TEACHER_EMAIL/EGE_TEACHER_PASSWORD")
    exit(2)
}

// MARK: Юнит-проверки AnswerChecker (порт checkFree)

print("\n== AnswerChecker ==")
do {
    let egeSpec = ResolvedAnswerSpec(type: "string", format: "ege_decimal", tolerance: nil, accept: nil,
                                     normalize: ["strip_spaces", "unicode_minus_to_ascii"], text: "0,0009", value: nil)
    check("ege_decimal точное совпадение", AnswerChecker.check(spec: egeSpec, rawInput: " 0,0009 ").correct)
    check("ege_decimal неверный ответ", !AnswerChecker.check(spec: egeSpec, rawInput: "0.0009").correct)
    let minusSpec = ResolvedAnswerSpec(type: "string", format: "ege_decimal", tolerance: nil, accept: nil,
                                       normalize: ["unicode_minus_to_ascii"], text: "-5", value: nil)
    check("unicode minus нормализуется", AnswerChecker.check(spec: minusSpec, rawInput: "\u{2212}5").correct)
    let numSpec = ResolvedAnswerSpec(type: "number", format: nil, tolerance: nil, accept: nil,
                                     normalize: ["comma_to_dot"], text: nil, value: 0.5)
    check("number дробь 1/2", AnswerChecker.check(spec: numSpec, rawInput: "1/2").correct)
    check("number запятая 0,5", AnswerChecker.check(spec: numSpec, rawInput: "0,5").correct)
    check("number неверное", !AnswerChecker.check(spec: numSpec, rawInput: "0,6").correct)
}

// MARK: ScoreForecast

print("\n== ScoreForecast ==")
do {
    check("вторичный из 12 первичных = 70", ScoreForecast.secondaryFromPrimaryExact(12) == 70)
    check("вторичный из 0 = 0", ScoreForecast.secondaryFromPrimaryExact(0) == 0)
    check("интерполяция 2.5 -> 14", ScoreForecast.secondaryFromPrimaryExact(2.5) == 14)
}

let runner = Task {
    // MARK: Сценарий D1: неверный пароль
    print("\n== Ошибки авторизации ==")
    let badClient = SupabaseClient(store: InMemorySessionStore())
    do {
        _ = try await badClient.signIn(email: studentEmail, password: "wrong-password-123")
        check("неверный пароль отклонён", false)
    } catch let e as SupabaseError {
        if case .invalidCredentials(let msg) = e {
            check("неверный пароль отклонён", true, msg)
        } else {
            check("неверный пароль отклонён (иной формат)", true, e.localizedDescription)
        }
    }

    // MARK: Ученик
    print("\n== Ученик: вход и данные ==")
    let stClient = SupabaseClient(store: InMemorySessionStore())
    let stAuth = AuthService(client: stClient)
    let stHomework = HomeworkService(client: stClient)
    let stStudent = StudentService(client: stClient)

    let stSession = try await stAuth.signIn(email: studentEmail, password: studentPassword)
    check("логин ученика", !stSession.accessToken.isEmpty, stSession.user.id)

    let refreshed = await stClient.refreshSession()
    check("refresh-токен работает (сценарий C)", refreshed != nil)

    let stProfile = try await stAuth.fetchMyProfile()
    check("профиль ученика, роль", stProfile.role == "student", stProfile.displayName)

    let summary = try await stHomework.myHomeworksSummary()
    check("список ДЗ", summary.totalCount > 0, "всего \(summary.totalCount), несданных \(summary.pendingCount)")

    guard let submitted = summary.items.first(where: { $0.isSubmitted }) else {
        check("есть сданное ДЗ", false); exit(1)
    }
    let hw = try await stHomework.homework(byToken: submitted.token)
    check("get_homework_by_token", hw.homeworkId == submitted.homeworkId, hw.title ?? "")
    check("refs из frozen_questions", !hw.questionRefs.isEmpty, "\(hw.questionRefs.count) шт.")

    // Контент: резолв question_id -> текст задачи с продакшен-сайта
    let content = ContentService.shared
    let questions = try await content.buildQuestions(refs: hw.questionRefs)
    check("контент: текст задачи собран", questions.count == hw.questionRefs.count,
          questions.first.map { String($0.stem.prefix(60)) + "..." } ?? "")
    if let q = questions.first {
        check("answer_spec у задачи", q.spec.text != nil || q.spec.value != nil,
              "type=\(q.spec.type) format=\(q.spec.format ?? "-")")
    }

    let attempt = try await stHomework.attempt(byToken: submitted.token)
    check("результат попытки по токену", attempt?.isFinished == true,
          "верно \(attempt?.correct ?? -1) из \(attempt?.total ?? -1)")
    check("payload с ответами", (attempt?.payload?.questions?.count ?? 0) > 0)

    let analytics = try await stStudent.analytics(scope: "self", days: 30, source: "all")
    check("аналитика self", (analytics.topics?.count ?? 0) > 0,
          "\(analytics.topics?.count ?? 0) подтем, \(analytics.sections?.count ?? 0) секций")
    let forecast = ScoreForecast.compute(topics: analytics.topics ?? [])
    check("прогноз ЕГЭ посчитан", forecast.secondary > 0,
          "первичные \(forecast.primaryText), вторичные \(forecast.secondary)")

    let teachers = try await stStudent.myTeachers()
    check("мои преподаватели", !teachers.isEmpty, teachers.first?.displayName ?? "")
    _ = try await stStudent.incomingTeacherRequests()
    check("входящие запросы читаются", true)

    let catalog = try await content.loadCatalog()
    check("каталог с прод-сайта", catalog.count > 50, "\(catalog.count) записей")
    let sections = try await content.sectionsWithTopics()
    check("секции каталога", sections.count == 12, "\(sections.count)")
    if let firstSection = sections.first {
        let random = try await content.randomQuestions(topic: firstSection.topics[0], count: 2)
        check("клиентский подбор тренировки", random.count == 2,
              random.first.map { String($0.stem.prefix(50)) } ?? "")
    }

    // Опциональная запись: сдача одного несданного QA-ДЗ (только с EGE_WRITE_SUBMIT=1)
    if WRITE_SUBMIT_HOMEWORK,
       let pending = summary.items.first(where: { !$0.isSubmitted }) {
        print("\n== Запись: сдача ДЗ «\(pending.displayTitle)» ==")
        let pendingHw = try await stHomework.homework(byToken: pending.token)
        let qs = try await content.buildQuestions(refs: pendingHw.questionRefs)
        let started = try await stHomework.startAttempt(token: pending.token, studentName: stProfile.hwStudentName)
        check("start_homework_attempt", started.resolvedAttemptId != nil,
              "attempt=\(started.resolvedAttemptId ?? "-") already=\(started.alreadyExists == true)")
        if let attemptId = started.resolvedAttemptId {
            let items: [AttemptQuestion] = qs.map { q in
                let res = AnswerChecker.check(spec: q.spec, rawInput: q.spec.text ?? AnswerChecker.formatNumber(q.spec.value ?? 0))
                return AttemptQuestion(questionId: q.questionId, topicId: q.topicId, correct: res.correct,
                                       chosenText: res.chosenText, correctText: res.correctText,
                                       normalizedText: res.normalizedText, timeMs: 1000, difficulty: q.difficulty)
            }
            let payload = AttemptPayload(title: pendingHw.title, homeworkId: pendingHw.homeworkId,
                                         studentName: stProfile.hwStudentName, questions: items)
            let result = try await stHomework.submitAttempt(
                attemptId: attemptId, payload: payload, total: items.count,
                correct: items.filter { $0.correct == true }.count, durationMs: 4000)
            check("submit_homework_attempt_v2", result.attemptId != nil,
                  "верно \(result.correct ?? -1) из \(result.total ?? -1)")
        }
    }

    // MARK: Учитель
    print("\n== Учитель: вход и данные ==")
    let teClient = SupabaseClient(store: InMemorySessionStore())
    let teAuth = AuthService(client: teClient)
    let teTeacher = TeacherService(client: teClient)
    let teStudentSvc = StudentService(client: teClient)
    let teHomework = HomeworkService(client: teClient)

    _ = try await teAuth.signIn(email: teacherEmail, password: teacherPassword)
    let teProfile = try await teAuth.fetchMyProfile()
    check("логин учителя, роль", teProfile.role == "teacher", teProfile.displayName)

    let students = try await teTeacher.listMyStudents()
    check("list_my_students", !students.isEmpty, "\(students.count) учеников")

    let summaries = try await teTeacher.studentsSummary()
    check("teacher_students_summary", !summaries.isEmpty, "\(summaries.count)")

    _ = try await teTeacher.outgoingRequests()
    check("исходящие pending-запросы читаются", true)

    guard let target = students.first(where: { $0.email == studentEmail }) ?? students.first else {
        check("есть ученик для проверки", false); exit(1)
    }

    let picking = try await teTeacher.pickingScreen(studentId: target.studentId)
    check("teacher_picking_screen_v2", (picking.sections?.count ?? 0) == 12,
          "\(picking.sections?.count ?? 0) секций, seed=\(picking.screen?.sessionSeed?.prefix(8) ?? "")")

    let teAnalytics = try await teStudentSvc.analytics(scope: "teacher", studentId: target.studentId)
    check("аналитика teacher-scope", (teAnalytics.topics?.count ?? 0) > 0)

    let attempts = try await teTeacher.studentAttempts(studentId: target.studentId)
    check("list_student_attempts", !attempts.isEmpty, "\(attempts.count) работ")

    if let firstAttempt = attempts.first {
        let report = try await teHomework.attemptForTeacher(attemptId: firstAttempt.attemptId)
        check("get_homework_attempt_for_teacher", report.payload?.questions != nil,
              report.homeworkTitle ?? "")
    }

    if let topicWithData = picking.sections?.first?.topics?.first {
        let resolved = try await teTeacher.resolveBatch(
            studentId: target.studentId,
            selection: [topicWithData.topicId: 2]
        )
        check("teacher_picking_resolve_batch_v1", !resolved.isEmpty,
              "\(resolved.count) задач: \(resolved.map(\.questionId).joined(separator: ", "))")
    }

    // MARK: WIOS.2 — parity локального движка против серверного resolve
    // Критерий (спека picking_resolve_semantics_spec.md): УПОРЯДОЧЕННЫЕ
    // последовательности question_id по бакетам совпадают (iOS-ротация
    // потребляет массив в порядке сервера). 10 прогонов: 2 окна × 5 фильтров.

    print("\n== PickFilteredEngine parity (WIOS.2) ==")
    do {
        let snap = try await teClient.rpc("student_picking_snapshot_v1", params: [
            "p_student_id": .string(target.studentId),
            "p_source": .string("all"),
        ], as: PickSnapshot.self)
        check("student_picking_snapshot_v1 декодится", !snap.protos.isEmpty,
              "protos=\(snap.protos.count) qstats=\(snap.qstats.count) unics=\(snap.questions.count)")

        let covered = snap.protos.first(where: { $0.attemptCountTotal > 0 }) ?? snap.protos[0]
        let untouched = snap.protos.first(where: { $0.isNotSeen }) ?? snap.protos[snap.protos.count - 1]

        func bucketKey(_ q: ResolvedQuestion) -> String { "\(q.scopeKind ?? "?"):\(q.scopeId ?? "")" }

        var parityRuns = 0
        var parityFails = 0
        for completeFlag in [false, true] {
            for filter in [nil, "unseen_low", "stale", "unstable", "weak_spots"] as [String?] {
                let seed = "wios2-parity-\(completeFlag ? "c" : "d")-\(filter ?? "none")"
                let reqTuples: [(kind: String, id: String?, n: Int)] = [
                    (kind: "proto", id: covered.unicId, n: 3),
                    (kind: "topic", id: covered.subtopicId, n: 4),
                    (kind: "section", id: covered.themeId, n: 6),
                    (kind: "global_all", id: nil, n: 1),
                    (kind: "proto", id: untouched.unicId, n: 2),
                ]
                let reqJson: [JSONValue] = reqTuples.map { t in
                    var o: [String: JSONValue] = [
                        "scope_kind": .string(t.kind),
                        "n": .number(Double(t.n)),
                    ]
                    if let id = t.id { o["scope_id"] = .string(id) }
                    return .object(o)
                }
                var params: [String: JSONValue] = [
                    "p_student_id": .string(target.studentId),
                    "p_source": .string("all"),
                    "p_filter_id": filter.map { .string($0) } ?? .null,
                    "p_selection": .object([:]),
                    "p_requests": .array(reqJson),
                    "p_seed": .string(seed),
                    "p_exclude_question_ids": .array([]),
                ]
                if completeFlag { params["p_complete"] = .bool(true) }
                let remote = try await teClient.rpc(
                    "teacher_picking_resolve_batch_v1", params: params, as: ResolveBatchResult.self
                )
                let local = try PickFilteredEngine.resolveBatch(
                    snapshot: snap, filterId: filter, requests: reqTuples,
                    seed: seed, complete: completeFlag
                )
                var rGroups: [String: [String]] = [:]
                var lGroups: [String: [String]] = [:]
                for q in remote.pickedQuestions ?? [] { rGroups[bucketKey(q), default: []].append(q.questionId) }
                for q in local.pickedQuestions ?? [] { lGroups[bucketKey(q), default: []].append(q.questionId) }
                parityRuns += 1
                if rGroups != lGroups {
                    parityFails += 1
                    print("  ✗ complete=\(completeFlag) filter=\(filter ?? "none"):")
                    for k in Set(rGroups.keys).union(lGroups.keys).sorted() where rGroups[k] != lGroups[k] {
                        print("    \(k): rpc=\(rGroups[k] ?? []) local=\(lGroups[k] ?? [])")
                    }
                }
            }
        }
        check("parity движок vs RPC (\(parityRuns) прогонов)", parityFails == 0,
              parityFails == 0 ? "0 расхождений" : "\(parityFails) расхождений")
    }

    // Опциональная запись: создание ДЗ (с EGE_WRITE_CREATE=1); назначаем тестовому ученику
    if WRITE_CREATE_HOMEWORK {
        print("\n== Запись: создание ДЗ ==")
        let resolved = try await teTeacher.resolveBatch(studentId: target.studentId, selection: ["1.1": 1, "2.1": 1])
        let refs = resolved.map { QuestionRef(topicId: $0.topicId ?? "", questionId: $0.questionId) }
        check("подбор для ДЗ", refs.count >= 1, "\(refs.count) задач")
        let created = try await teTeacher.createHomework(
            title: "iOS-smoke \(Int(Date().timeIntervalSince1970) % 100000)",
            questions: refs,
            assignToStudentId: target.studentId
        )
        check("создание ДЗ + ссылка + назначение", !created.token.isEmpty, created.url.absoluteString)
        // Проверяем глазами ученика: ДЗ открывается по токену
        let visible = try await stHomework.homework(byToken: created.token)
        check("ДЗ открывается учеником", visible.homeworkId == created.homeworkId)
    }

    // MARK: Доступы
    print("\n== Ошибки доступа ==")
    do {
        _ = try await teTeacher.studentAttempts(studentId: "00000000-0000-0000-0000-000000000000")
        check("чужой student_id отклонён", false, "RPC вернул данные")
    } catch {
        check("чужой student_id отклонён", true, (error as? SupabaseError)?.localizedDescription ?? "")
    }

    print("\n=== Итог: \(passed) OK, \(failed) FAIL ===")
    exit(failed == 0 ? 0 : 1)
}

// Держим main-поток до завершения async-задачи
RunLoop.main.run()
