// Deterministic behavior probe for AccordionScreenCache.
// Compile from ios/EGETrainerApp:
// swiftc -O -o /tmp/ios_accordion_cache_probe \
//   EGETrainerApp/Models/*.swift EGETrainerApp/Services/AccordionScreenCache.swift \
//   ../../reports/perf/ios_accordion_cache_probe.swift

import Foundation

actor CallCounter {
    private var count = 0

    func next() -> Int {
        count += 1
        return count
    }

    func value() -> Int { count }
}

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() {
        print("PASS \(message)")
    } else {
        print("FAIL \(message)")
        exit(1)
    }
}

func makePicking(studentId: String) -> PickingScreen {
    PickingScreen(
        screen: nil,
        sections: [],
        student: .init(days: 30, source: "all", studentId: studentId)
    )
}

func makeAnalytics(studentId: String) -> AnalyticsScreen {
    AnalyticsScreen(
        overall: nil,
        student: .init(
            days: 30, grade: nil, source: "all", studentId: studentId,
            displayName: nil, lastSeenAt: nil, viewerScope: "teacher"
        ),
        sections: [],
        topics: [],
        generatedAt: nil
    )
}

@main
struct IOSAccordionCacheProbe {
    static func main() async throws {
        let cache = AccordionScreenCache(ttl: 60)
        let pickingCalls = CallCounter()

        async let first = cache.picking(studentId: "A", filterId: nil) {
            _ = await pickingCalls.next()
            try await Task.sleep(nanoseconds: 100_000_000)
            return makePicking(studentId: "A")
        }
        async let duplicate = cache.picking(studentId: "A", filterId: nil) {
            _ = await pickingCalls.next()
            return makePicking(studentId: "duplicate")
        }
        let firstPair = try await (first, duplicate)
        let firstCallCount = await pickingCalls.value()
        require(firstCallCount == 1, "single-flight deduplicates identical picking requests")
        require(firstPair.0.student?.studentId == firstPair.1.student?.studentId,
                "single-flight callers receive the same payload")

        let cachedStarted = ContinuousClock.now
        let cached = try await cache.picking(studentId: "A", filterId: nil) {
            _ = await pickingCalls.next()
            return makePicking(studentId: "unexpected")
        }
        let cachedDuration = cachedStarted.duration(to: .now)
        let cachedMs = Double(cachedDuration.components.seconds) * 1_000
            + Double(cachedDuration.components.attoseconds) / 1_000_000_000_000_000
        require(cached.student?.studentId == "A", "repeat returns cached picking payload")
        let cachedCallCount = await pickingCalls.value()
        require(cachedCallCount == 1, "fresh repeat does not call loader")
        require(cachedMs < 10, "fresh repeat is immediate (<10 ms)")

        _ = try await cache.picking(studentId: "A", filterId: "stale") {
            _ = await pickingCalls.next()
            return makePicking(studentId: "A-stale")
        }
        _ = try await cache.picking(studentId: "B", filterId: nil) {
            _ = await pickingCalls.next()
            return makePicking(studentId: "B")
        }
        let isolatedCallCount = await pickingCalls.value()
        require(isolatedCallCount == 3, "student and filter keys are isolated")

        let analyticsCalls = CallCounter()
        async let analyticsFirst = cache.analytics(studentId: "A") {
            _ = await analyticsCalls.next()
            try await Task.sleep(nanoseconds: 100_000_000)
            return makeAnalytics(studentId: "A")
        }
        async let analyticsDuplicate = cache.analytics(studentId: "A") {
            _ = await analyticsCalls.next()
            return makeAnalytics(studentId: "duplicate")
        }
        _ = try await (analyticsFirst, analyticsDuplicate)
        let analyticsCallCount = await analyticsCalls.value()
        require(analyticsCallCount == 1, "single-flight deduplicates analytics requests")

        await cache.invalidateAll()
        let invalidatedPicking = await cache.cachedPicking(studentId: "A", filterId: nil)
        let invalidatedAnalytics = await cache.cachedAnalytics(studentId: "A")
        require(invalidatedPicking == nil, "invalidation clears picking")
        require(invalidatedAnalytics == nil, "invalidation clears analytics")
    }
}
