import Foundation

/// Teacher-домен: ученики, consent, подбор, создание/назначение ДЗ.
struct TeacherService {
    let client: SupabaseClient

    init(client: SupabaseClient = .shared) {
        self.client = client
    }

    // MARK: - Мои ученики

    func listMyStudents() async throws -> [StudentListItem] {
        try await client.rpc("list_my_students", params: [:], as: [StudentListItem].self)
    }

    // MARK: - Статистика прототипов для модалки (WMB1/WMB3 контракты)

    /// proto_last3_for_teacher_v1 — последние 3 попытки по базовым прототипам.
    func protoLast3(studentId: String, unicIds: [String]) async throws -> [ProtoLast3Stat] {
        try await client.rpc("proto_last3_for_teacher_v1", params: [
            "p_student_id": .string(studentId),
            "p_unic_ids": .array(unicIds.map { .string($0) }),
        ], as: [ProtoLast3Stat].self)
    }

    /// proto_last3_for_self_v1 — то же для самого ученика (+ all-time и дата).
    func protoLast3Self(unicIds: [String]) async throws -> [ProtoLast3Stat] {
        try await client.rpc("proto_last3_for_self_v1", params: [
            "p_unic_ids": .array(unicIds.map { .string($0) }),
        ], as: [ProtoLast3Stat].self)
    }

    /// question_stats_for_teacher_v2 (фоллбэк v1) — per-вопросная статистика.
    /// Сигнатура ТОЛЬКО p_student_id + p_question_ids (как rpcTry веба;
    /// p_topic_id у функции нет — проверено против прода).
    func questionStats(studentId: String, questionIds: [String]) async throws -> [QuestionStat] {
        let params: [String: JSONValue] = [
            "p_student_id": .string(studentId),
            "p_question_ids": .array(questionIds.map { .string($0) }),
        ]
        do {
            return try await client.rpc("question_stats_for_teacher_v2", params: params, as: [QuestionStat].self)
        } catch {
            return try await client.rpc("question_stats_for_teacher_v1", params: params, as: [QuestionStat].self)
        }
    }

    // MARK: - Session-ссылки (WS.1, create_session_link)

    struct SessionLink {
        var token: String
        var url: URL
    }

    /// create_session_link: shareable-ссылка на подборку (mode 'list'|'test').
    /// Запись не идемпотентна — без ретраев (как task_session.js).
    func createSessionLink(mode: String, shuffle: Bool, frozenQuestions: [QuestionRef]) async throws -> SessionLink {
        struct Created: Decodable {
            var token: String?
            var homeworkId: String?
            enum CodingKeys: String, CodingKey {
                case token
                case homeworkId = "homework_id"
            }
        }
        let frozen: [JSONValue] = frozenQuestions.map {
            .object(["topic_id": .string($0.topicId), "question_id": .string($0.questionId)])
        }
        let created = try await client.rpcSingleRow("create_session_link", params: [
            "p_mode": .string(mode),
            "p_shuffle": .bool(shuffle),
            "p_spec_json": .object([:]),
            "p_frozen_questions": .array(frozen),
        ], as: Created.self)
        guard let token = created.token, !token.isEmpty else {
            throw SupabaseError.emptyResponse
        }
        let page = mode == "test" ? "tasks/trainer.html" : "tasks/list.html"
        var comps = URLComponents(
            url: SupabaseConfig.siteBaseURL.appendingPathComponent(page),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "session", value: token)]
        return SessionLink(token: token, url: comps.url!)
    }

    func studentsSummary(days: Int = 30, source: String = "all") async throws -> [StudentSummary] {
        try await client.rpc("teacher_students_summary", params: [
            "p_days": .number(Double(days)),
            "p_source": .string(source),
        ], as: [StudentSummary].self)
    }

    /// Пригласить ученика по email (pending-запрос, consent-модель).
    func inviteStudent(email: String) async throws {
        try await client.rpcVoid("teacher_invite_student", params: [
            "p_email": .string(email.trimmingCharacters(in: .whitespaces).lowercased()),
        ])
    }

    func outgoingRequests() async throws -> [OutgoingStudentRequest] {
        try await client.rpc("list_my_student_requests", params: [:], as: [OutgoingStudentRequest].self)
    }

    func cancelRequest(requestId: String) async throws {
        try await client.rpcVoid("cancel_student_request", params: ["p_request_id": .string(requestId)])
    }

    func removeStudent(studentId: String) async throws {
        try await client.rpcVoid("remove_student", params: ["p_student_id": .string(studentId)])
    }

    /// Выполненные работы ученика (list_student_attempts).
    func studentAttempts(studentId: String) async throws -> [StudentAttemptRow] {
        try await client.rpc(
            "list_student_attempts",
            params: ["p_student_id": .string(studentId)],
            as: [StudentAttemptRow].self
        )
    }

    // MARK: - Подбор задач (teacher_picking_screen_v2 / resolve_batch)

    func pickingScreen(
        studentId: String,
        days: Int = 30,
        source: String = "all",
        filterId: String? = nil,
        seed: String? = nil
    ) async throws -> PickingScreen {
        try await client.rpc("teacher_picking_screen_v2", params: [
            "p_student_id": .string(studentId),
            "p_mode": .string("init"),
            "p_days": .number(Double(days)),
            "p_source": .string(source),
            "p_filter_id": filterId.map { .string($0) } ?? .null,
            "p_selection": .object([:]),
            "p_request": .object([:]),
            "p_seed": seed.map { .string($0) } ?? .null,
            "p_exclude_question_ids": .null,
        ], as: PickingScreen.self)
    }

    /// Обобщённый resolve: смешанные бакеты proto/topic/section
    /// (как pickQuestionsViaTeacherScreenResolveBatch веба), с shortage.
    func resolveRequests(
        studentId: String,
        requests: [(kind: String, id: String, n: Int)],
        filterId: String? = nil,
        excludeQuestionIds: [String] = [],
        seed: String? = nil
    ) async throws -> ResolveBatchResult {
        let reqs: [JSONValue] = requests.map {
            .object([
                "scope_kind": .string($0.kind),
                "scope_id": .string($0.id),
                "n": .number(Double($0.n)),
            ])
        }
        return try await client.rpc("teacher_picking_resolve_batch_v1", params: [
            "p_student_id": .string(studentId),
            "p_source": .string("all"),
            "p_filter_id": filterId.map { .string($0) } ?? .null,
            "p_selection": .object([:]),
            "p_requests": .array(reqs),
            "p_seed": seed.map { .string($0) } ?? .null,
            "p_exclude_question_ids": .array(excludeQuestionIds.map { .string($0) }),
        ], as: ResolveBatchResult.self)
    }

    /// WIOS.2: локальный resolve от витрины выбранного ученика (гейт
    /// self-or-teacher на сервере, кеш per-student); при отсутствии снимка или
    /// сбое движка — прозрачный fallback на серверный RPC. Default-окно.
    private func resolveRequestsLocalFirst(
        studentId: String,
        requests: [(kind: String, id: String, n: Int)],
        filterId: String?,
        excludeQuestionIds: [String] = [],
        seed: String
    ) async throws -> ResolveBatchResult {
        if let snap = await PickSnapshotCache.shared.snapshot(for: studentId, client: client),
           let local = try? PickFilteredEngine.resolveBatch(
               snapshot: snap,
               filterId: filterId,
               requests: requests.map { (kind: $0.kind, id: Optional($0.id), n: $0.n) },
               seed: seed,
               excludeQuestionIds: Set(excludeQuestionIds)
           ) {
            return local
        }
        return try await resolveRequests(
            studentId: studentId, requests: requests, filterId: filterId,
            excludeQuestionIds: excludeQuestionIds, seed: seed
        )
    }

    /// Resolve с добором (P4-4): сначала по фильтру, дефицит каждого бакета
    /// добирается вторым батчем без фильтра с исключением взятых.
    func resolvePickedWithTopUp(
        studentId: String,
        requests: [(kind: String, id: String, n: Int)],
        filterId: String?
    ) async throws -> [ResolvedQuestion] {
        // WIOS.2: единый явный seed на сессию подбора (раньше seed=nil выводил
        // сервер; локальному движку нужен явный — шлём его же и в fallback-RPC).
        let seed = String(Int.random(in: 100_000...999_999))
        let result = try await resolveRequestsLocalFirst(
            studentId: studentId, requests: requests, filterId: filterId, seed: seed
        )
        var picked = result.pickedQuestions ?? []
        guard filterId != nil else { return picked }

        var got: [String: Int] = [:]
        for q in picked {
            got["\(q.scopeKind ?? ""):\(q.scopeId ?? "")", default: 0] += 1
        }
        let deficits = requests.compactMap { r -> (kind: String, id: String, n: Int)? in
            let need = r.n - (got["\(r.kind):\(r.id)"] ?? 0)
            return need > 0 ? (r.kind, r.id, need) : nil
        }
        if !deficits.isEmpty {
            let topup = try? await resolveRequestsLocalFirst(
                studentId: studentId,
                requests: deficits,
                filterId: nil,
                excludeQuestionIds: picked.map(\.questionId),
                seed: seed
            )
            picked += topup?.pickedQuestions ?? []
        }
        return picked
    }

    /// Батч-подбор задач по выбранным темам: topic_id -> count.
    func resolveBatch(
        studentId: String,
        selection: [String: Int],
        source: String = "all",
        filterId: String? = nil,
        seed: String? = nil
    ) async throws -> [ResolvedQuestion] {
        // WIOS.2: явный seed (раньше nil выводил сервер) + локальный путь от
        // витрины при source='all' (снимок строится только под 'all').
        let resolveSeed = (seed?.isEmpty == false) ? seed! : String(Int.random(in: 100_000...999_999))
        let topicRequests = selection.sorted { $0.key < $1.key }
            .map { (kind: "topic", id: $0.key, n: $0.value) }
        if source == "all" {
            if let result = try? await resolveRequestsLocalFirst(
                studentId: studentId, requests: topicRequests,
                filterId: filterId, seed: resolveSeed
            ) {
                return result.pickedQuestions ?? []
            }
        }
        let requests: [JSONValue] = topicRequests.map {
            .object([
                "scope_kind": .string($0.kind),
                "scope_id": .string($0.id),
                "n": .number(Double($0.n)),
            ])
        }
        // p_complete не передаём (веб шлёт его только при true — обратная совместимость)
        let result = try await client.rpc("teacher_picking_resolve_batch_v1", params: [
            "p_student_id": .string(studentId),
            "p_source": .string(source),
            "p_filter_id": filterId.map { .string($0) } ?? .null,
            "p_selection": .object([:]),
            "p_requests": .array(requests),
            "p_seed": .string(resolveSeed),
            "p_exclude_question_ids": .array([]),
        ], as: ResolveBatchResult.self)
        return result.pickedQuestions ?? []
    }

    // MARK: - Создание и назначение ДЗ (hw_create.js flow)

    struct CreatedHomework {
        var homeworkId: String
        var token: String
        var url: URL
    }

    /// Полный флоу: insert homeworks -> insert homework_links -> (опц.) assign RPC.
    func createHomework(
        title: String,
        description: String? = nil,
        shuffle: Bool = false,
        questions: [QuestionRef],
        assignToStudentId: String? = nil
    ) async throws -> CreatedHomework {
        guard let session = await client.currentSession else { throw SupabaseError.authRequired }
        let ownerId = session.user.id

        let refsJson: JSONValue = .array(questions.map {
            .object(["topic_id": .string($0.topicId), "question_id": .string($0.questionId)])
        })

        // 1) homeworks row (как createHomework в homework.js; description/shuffle —
        //    те же колонки/spec_json, что getDescriptionValue()/#shuffle hw_create.js)
        let hwRows = try await client.insert("homeworks", values: [
            "owner_id": .string(ownerId),
            "title": .string(title.trimmingCharacters(in: .whitespaces)),
            "description": description.flatMap { $0.isEmpty ? nil : JSONValue.string($0) } ?? .null,
            "spec_json": .object([
                "v": .number(1),
                "fixed": refsJson,
                "shuffle": .bool(shuffle),
                "generated": .null,
            ]),
            "frozen_questions": refsJson,
            "attempts_per_student": .number(1),
            "is_active": .bool(true),
        ], as: [HomeworkRow].self)
        guard let hw = hwRows.first else { throw SupabaseError.emptyResponse }

        // 2) homework_links row с токеном — 16 случайных байт hex (makeToken из hw_create.js)
        let token = Self.makeToken()
        _ = try await client.insert("homework_links", values: [
            "owner_id": .string(ownerId),
            "homework_id": .string(hw.id),
            "token": .string(token),
            "expires_at": .null,
            "is_active": .bool(true),
        ], as: [HomeworkLinkRow].self)

        // 3) назначение ученику (assign_homework_to_student)
        if let studentId = assignToStudentId {
            try await client.rpcVoid("assign_homework_to_student", params: [
                "p_homework_id": .string(hw.id),
                "p_student_id": .string(studentId),
                "p_token": .string(token),
            ])
        }

        var comps = URLComponents(
            url: SupabaseConfig.siteBaseURL.appendingPathComponent("tasks/hw.html"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "token", value: token)]
        return CreatedHomework(homeworkId: hw.id, token: token, url: comps.url!)
    }

    static func makeToken() -> String {
        (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }
}
