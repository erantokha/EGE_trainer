import Foundation

/// Кеш payload аккордеона и аналитики: быстрый возврат к уже открытому ученику,
/// TTL и single-flight для защиты от дублей при одновременной загрузке.
actor AccordionScreenCache {
    static let shared = AccordionScreenCache()

    private struct PickingKey: Hashable {
        let studentId: String
        let filterId: String?
    }

    private var pickingEntries: [PickingKey: (value: PickingScreen, at: Date)] = [:]
    private var analyticsEntries: [String: (value: AnalyticsScreen, at: Date)] = [:]
    private var pickingInflight: [PickingKey: Task<PickingScreen, Error>] = [:]
    private var analyticsInflight: [String: Task<AnalyticsScreen, Error>] = [:]
    private let ttl: TimeInterval

    init(ttl: TimeInterval = 60) {
        self.ttl = ttl
    }

    func cachedPicking(studentId: String, filterId: String?) -> PickingScreen? {
        pickingEntries[PickingKey(studentId: studentId, filterId: filterId)]?.value
    }

    func cachedAnalytics(studentId: String) -> AnalyticsScreen? {
        analyticsEntries[studentId]?.value
    }

    func picking(
        studentId: String,
        filterId: String?,
        load: @escaping () async throws -> PickingScreen
    ) async throws -> PickingScreen {
        let key = PickingKey(studentId: studentId, filterId: filterId)
        if let entry = pickingEntries[key], Date().timeIntervalSince(entry.at) < ttl {
            return entry.value
        }
        if let task = pickingInflight[key] { return try await task.value }

        let task = Task { try await load() }
        pickingInflight[key] = task
        do {
            let value = try await task.value
            pickingEntries[key] = (value, Date())
            pickingInflight[key] = nil
            return value
        } catch {
            pickingInflight[key] = nil
            throw error
        }
    }

    func analytics(
        studentId: String,
        load: @escaping () async throws -> AnalyticsScreen
    ) async throws -> AnalyticsScreen {
        if let entry = analyticsEntries[studentId], Date().timeIntervalSince(entry.at) < ttl {
            return entry.value
        }
        if let task = analyticsInflight[studentId] { return try await task.value }

        let task = Task { try await load() }
        analyticsInflight[studentId] = task
        do {
            let value = try await task.value
            analyticsEntries[studentId] = (value, Date())
            analyticsInflight[studentId] = nil
            return value
        } catch {
            analyticsInflight[studentId] = nil
            throw error
        }
    }

    func invalidateAll() {
        pickingEntries.removeAll()
        analyticsEntries.removeAll()
    }
}
