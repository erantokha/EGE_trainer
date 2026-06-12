import Foundation

/// Студенческая аналитика + consent-flow ученика + запись попыток тренировки.
struct StudentService {
    let client: SupabaseClient

    init(client: SupabaseClient = .shared) {
        self.client = client
    }

    /// student_analytics_screen_v1 — canonical layer-4 контракт статистики.
    /// scope: "self" (ученик о себе) | "teacher" (учитель об ученике, требуется studentId).
    func analytics(
        scope: String = "self",
        studentId: String? = nil,
        days: Int = 30,
        source: String = "all"
    ) async throws -> AnalyticsScreen {
        var params: [String: JSONValue] = [
            "p_viewer_scope": .string(scope),
            "p_days": .number(Double(days)),
            "p_source": .string(source),
            "p_mode": .string("init"),
        ]
        if let studentId {
            params["p_student_id"] = .string(studentId)
        }
        return try await client.rpc("student_analytics_screen_v1", params: params, as: AnalyticsScreen.self)
    }

    /// id текущего пользователя — для self-гейта teacher RPC (как readSessionFallback().user.id).
    func selfUserId() async -> String? {
        await client.currentSession?.user.id
    }

    /// Подбор задач с фильтром — self-гейт teacher_picking_resolve_batch_v1
    /// (тот же RPC, p_student_id = свой id; как student-ветки picker.js).
    /// requests: (scope_kind 'topic'|'section', scope_id, n) — n уже с over-fetch.
    func resolveFiltered(
        requests: [(scopeKind: String, scopeId: String, n: Int)],
        filterId: String?,
        excludeQuestionIds: [String],
        seed: String?
    ) async throws -> [ResolvedQuestion] {
        guard let sid = await selfUserId() else { throw SupabaseError.authRequired }
        let reqs: [JSONValue] = requests.map {
            .object([
                "scope_kind": .string($0.scopeKind),
                "scope_id": .string($0.scopeId),
                "n": .number(Double($0.n)),
            ])
        }
        let result = try await client.rpc("teacher_picking_resolve_batch_v1", params: [
            "p_student_id": .string(sid),
            "p_source": .string("all"),
            "p_filter_id": filterId.map { .string($0) } ?? .null,
            "p_selection": .object([:]),
            "p_requests": .array(reqs),
            "p_seed": seed.map { .string($0) } ?? .null,
            "p_exclude_question_ids": .array(excludeQuestionIds.map { .string($0) }),
        ], as: ResolveBatchResult.self)
        return result.pickedQuestions ?? []
    }

    /// Экран подбора с фильтром для самого ученика (self-гейт
    /// teacher_picking_screen_v2 — бейджи состояний тем как у учителя).
    func pickingScreenSelf(filterId: String?, days: Int = 30) async throws -> PickingScreen {
        guard let sid = await selfUserId() else { throw SupabaseError.authRequired }
        return try await client.rpc("teacher_picking_screen_v2", params: [
            "p_student_id": .string(sid),
            "p_mode": .string("init"),
            "p_days": .number(Double(days)),
            "p_source": .string("all"),
            "p_filter_id": filterId.map { .string($0) } ?? .null,
            "p_selection": .object([:]),
            "p_request": .object([:]),
            "p_seed": .null,
            "p_exclude_question_ids": .null,
        ], as: PickingScreen.self)
    }

    // MARK: - Тренировка: запись попытки (write_answer_events_v1, supabase-write.js)

    func writeTrainingAttempt(
        questions: [AttemptQuestion],
        startedAt: Date,
        finishedAt: Date,
        topicIds: [String],
        extraMeta: [String: JSONValue] = [:]
    ) async throws {
        let events: [JSONValue] = questions.map { q in
            .object([
                "question_id": .string(q.questionId ?? ""),
                "topic_id": .string(q.topicId ?? ""),
                "correct": .bool(q.correct ?? false),
                "chosen_text": .string(q.chosenText ?? ""),
                "normalized_text": .string(q.normalizedText ?? ""),
                "correct_text": .string(q.correctText ?? ""),
                "time_ms": .number(Double(q.timeMs ?? 0)),
                "difficulty": .number(Double(q.difficulty ?? 1)),
            ])
        }
        let total = questions.count
        let correct = questions.filter { $0.correct == true }.count
        let durationMs = Int(finishedAt.timeIntervalSince(startedAt) * 1000)
        let iso = ISO8601DateFormatter()

        var meta: [String: JSONValue] = [
            "mode": .string("test"),
            "topic_ids": .array(topicIds.map { .string($0) }),
            "total": .number(Double(total)),
            "correct": .number(Double(correct)),
            "duration_ms": .number(Double(durationMs)),
            "avg_ms": .number(Double(total > 0 ? durationMs / total : 0)),
            "client": .string("ios"),
        ]
        for (k, v) in extraMeta { meta[k] = v }

        try await client.rpcVoid("write_answer_events_v1", params: [
            "p_source": .string("test"),
            "p_attempt_ref": .string(UUID().uuidString.lowercased()),
            "p_events": .array(events),
            "p_attempt_started_at": .string(iso.string(from: startedAt)),
            "p_attempt_finished_at": .string(iso.string(from: finishedAt)),
            "p_attempt_meta": .object(meta),
        ])
        // WIOS.2: состояние ученика изменилось → витрина локального подбора устарела.
        await PickSnapshotCache.shared.invalidateAll()
        await AccordionScreenCache.shared.invalidateAll()
    }

    // MARK: - Consent (ученик)

    func incomingTeacherRequests() async throws -> [IncomingTeacherRequest] {
        try await client.rpc("list_incoming_teacher_requests", params: [:], as: [IncomingTeacherRequest].self)
    }

    func respondTeacherRequest(requestId: String, accept: Bool) async throws {
        try await client.rpcVoid("respond_teacher_request", params: [
            "p_request_id": .string(requestId),
            "p_accept": .bool(accept),
        ])
    }

    func myTeachers() async throws -> [MyTeacher] {
        try await client.rpc("list_my_teachers", params: [:], as: [MyTeacher].self)
    }

    func revokeTeacher(teacherId: String) async throws {
        try await client.rpcVoid("revoke_my_teacher", params: ["p_teacher_id": .string(teacherId)])
    }
}
