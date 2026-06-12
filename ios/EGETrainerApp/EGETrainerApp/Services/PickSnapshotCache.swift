import Foundation

/// WIOS.2 — кеш «витрины» (student_picking_snapshot_v1) для локального
/// фильтр-подбора: per-student, TTL 60с (stale-while-revalidate), негативный
/// кеш сбоев 5 мин (RPC недоступен/сеть — не молотим запросами), single-flight.
///
/// ВАЖНО (отличие от веба-MPA): в приложении попытки решаются в том же
/// процессе → после записи попытки/сдачи ДЗ кеш обязательно инвалидируется
/// (хуки в StudentService.writeTrainingAttempt / HomeworkService.submitAttempt).
actor PickSnapshotCache {
    static let shared = PickSnapshotCache()

    private var entries: [String: (snap: PickSnapshot, at: Date)] = [:]
    private var failAt: [String: Date] = [:]
    private var inflight: [String: Task<PickSnapshot?, Never>] = [:]

    private let ttl: TimeInterval = 60
    private let failTtl: TimeInterval = 300

    /// Снимок для studentId (self ученика или выбранный ученик учителя —
    /// гейт self-or-teacher на сервере). Протухший отдаётся сразу, обновление
    /// уходит в фон; первый запрос ждёт сеть; после сбоя — null до failTtl.
    func snapshot(for studentId: String, client: SupabaseClient = .shared) async -> PickSnapshot? {
        let sid = studentId.trimmingCharacters(in: .whitespaces)
        guard !sid.isEmpty else { return nil }
        if let e = entries[sid] {
            if Date().timeIntervalSince(e.at) > ttl { _ = fetchTask(sid, client: client) }
            return e.snap
        }
        if let f = failAt[sid], Date().timeIntervalSince(f) < failTtl { return nil }
        return await fetchTask(sid, client: client).value
    }

    /// Запустить загрузку заранее, не блокируя вызывающий экран ожиданием сети.
    func prewarm(for studentId: String, client: SupabaseClient = .shared) {
        let sid = studentId.trimmingCharacters(in: .whitespaces)
        guard !sid.isEmpty else { return }
        if let e = entries[sid] {
            if Date().timeIntervalSince(e.at) > ttl { _ = fetchTask(sid, client: client) }
            return
        }
        if let f = failAt[sid], Date().timeIntervalSince(f) < failTtl { return }
        _ = fetchTask(sid, client: client)
    }

    /// Сбросить кеш (после записи попытки/сдачи ДЗ состояние ученика изменилось).
    func invalidateAll() {
        entries.removeAll()
        failAt.removeAll()
    }

    private func fetchTask(_ sid: String, client: SupabaseClient) -> Task<PickSnapshot?, Never> {
        if let t = inflight[sid] { return t }
        let t = Task { () -> PickSnapshot? in
            let snap: PickSnapshot? = try? await client.rpc(
                "student_picking_snapshot_v1",
                params: ["p_student_id": .string(sid), "p_source": .string("all")],
                as: PickSnapshot.self
            )
            self.store(sid: sid, snap: snap)
            return snap
        }
        inflight[sid] = t
        return t
    }

    private func store(sid: String, snap: PickSnapshot?) {
        inflight[sid] = nil
        if let snap {
            entries[sid] = (snap, Date())
            failAt[sid] = nil
        } else {
            failAt[sid] = Date()
        }
    }
}
