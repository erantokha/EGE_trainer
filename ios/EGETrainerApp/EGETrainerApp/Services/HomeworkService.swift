import Foundation

/// Домен ДЗ ученика (зеркало app/providers/homework.js).
struct HomeworkService {
    let client: SupabaseClient

    init(client: SupabaseClient = .shared) {
        self.client = client
    }

    /// Список ДЗ ученика (student_my_homeworks_summary).
    func myHomeworksSummary() async throws -> HomeworkSummary {
        try await client.rpc("student_my_homeworks_summary", params: [:], as: HomeworkSummary.self)
    }

    /// ДЗ по токену ссылки (get_homework_by_token).
    func homework(byToken token: String) async throws -> Homework {
        try await client.rpcSingleRow(
            "get_homework_by_token",
            params: ["p_token": .string(token)],
            as: Homework.self
        )
    }

    /// Начать/возобновить попытку (start_homework_attempt).
    func startAttempt(token: String, studentName: String) async throws -> StartAttemptResult {
        // student_key в RPC нормализуется на бэке; имя — как в вебе (trim + collapse spaces)
        let name = studentName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return try await client.rpcSingleRow(
            "start_homework_attempt",
            params: ["p_token": .string(token), "p_student_name": .string(name)],
            as: StartAttemptResult.self
        )
    }

    /// Сдать ДЗ (submit_homework_attempt_v2 — контракт submitHomeworkAttempt веба).
    func submitAttempt(
        attemptId: String,
        payload: AttemptPayload,
        total: Int,
        correct: Int,
        durationMs: Int
    ) async throws -> SubmitAttemptResult {
        let payloadData = try JSONEncoder().encode(payload)
        let payloadJson = try JSONDecoder().decode(JSONValue.self, from: payloadData)
        let result = try await client.rpcSingleRow(
            "submit_homework_attempt_v2",
            params: [
                "p_attempt_id": .string(attemptId),
                "p_payload": payloadJson,
                "p_total": .number(Double(total)),
                "p_correct": .number(Double(correct)),
                "p_duration_ms": .number(Double(durationMs)),
            ],
            as: SubmitAttemptResult.self
        )
        // WIOS.2: состояние ученика изменилось → витрина локального подбора устарела.
        await PickSnapshotCache.shared.invalidateAll()
        await AccordionScreenCache.shared.invalidateAll()
        return result
    }

    /// Последняя попытка текущего ученика по токену (get_homework_attempt_by_token).
    func attempt(byToken token: String) async throws -> HomeworkAttempt? {
        do {
            return try await client.rpcSingleRow(
                "get_homework_attempt_by_token",
                params: ["p_token": .string(token)],
                as: HomeworkAttempt.self
            )
        } catch SupabaseError.emptyResponse {
            return nil
        }
    }

    /// Архив ДЗ с пагинацией (student_my_homeworks_archive — как
    /// getStudentMyHomeworksArchive веба: p_offset/p_limit, веб начинает с offset=10).
    func archive(offset: Int, limit: Int = 50) async throws -> [HomeworkArchiveItem] {
        let page = try await client.rpc(
            "student_my_homeworks_archive",
            params: [
                "p_offset": .number(Double(offset)),
                "p_limit": .number(Double(limit)),
            ],
            as: HomeworkArchivePage.self
        )
        return page.items
    }

    /// Отчёт по попытке для учителя (get_homework_attempt_for_teacher).
    func attemptForTeacher(attemptId: String) async throws -> HomeworkAttempt {
        try await client.rpcSingleRow(
            "get_homework_attempt_for_teacher",
            params: ["p_attempt_id": .string(attemptId)],
            as: HomeworkAttempt.self
        )
    }
}
