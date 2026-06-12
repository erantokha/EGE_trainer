// Read-only latency probe for the iOS picking pipeline.
// Compile from ios/EGETrainerApp:
// swiftc -O -o /tmp/ios_picking_latency_probe \
//   EGETrainerApp/Models/*.swift EGETrainerApp/Services/*.swift \
//   ../../reports/perf/ios_picking_latency_probe.swift

import Foundation

func env(_ key: String) -> String? {
    ProcessInfo.processInfo.environment[key]
}

func timed<T>(_ label: String, _ operation: () async throws -> T) async rethrows -> T {
    let started = Date()
    let value = try await operation()
    let ms = Date().timeIntervalSince(started) * 1_000
    print(String(format: "%-42@ %8.1f ms", label as NSString, ms))
    return value
}

func measured<T>(_ operation: () async throws -> T) async rethrows -> (value: T, ms: Double) {
    let started = Date()
    let value = try await operation()
    return (value, Date().timeIntervalSince(started) * 1_000)
}

// ProtoPick normally lives beside the SwiftUI picker sheet, which is intentionally
// excluded from this service-layer command-line probe.
struct ProtoPick: Equatable {
    var topicId: String
    var count: Int
}

@main
struct IOSPickingLatencyProbe {
static func main() async throws {
    guard let studentEmail = env("EGE_STUDENT_EMAIL"),
          let studentPassword = env("EGE_STUDENT_PASSWORD")
    else {
        print("Set EGE_STUDENT_EMAIL and EGE_STUDENT_PASSWORD")
        exit(2)
    }

    let client = SupabaseClient(store: InMemorySessionStore())
    let auth = AuthService(client: client)
    let student = StudentService(client: client)

    _ = try await timed("auth.signIn") {
        try await auth.signIn(email: studentEmail, password: studentPassword)
    }

    let catalogContent = ContentService()
    let sections = try await timed("content.sectionsWithTopics cold") {
        try await catalogContent.sectionsWithTopics()
    }
    guard let firstTopic = sections.first?.topics.first else {
        print("Catalog has no selectable topics")
        exit(1)
    }

    let topicSelection = StudentPickEngine.Selection(topicCounts: [firstTopic.id: 3])
    let allSectionsSelection = StudentPickEngine.Selection(
        sectionCounts: Dictionary(uniqueKeysWithValues: sections.map { ($0.section.id, 1) })
    )

    print("\n== StudentPickEngine: no filter ==")
    let noFilterContent = ContentService()
    _ = try await timed("no-filter topic cold") {
        try await StudentPickEngine.pick(
            selection: topicSelection, sections: sections, filterId: nil,
            student: student, content: noFilterContent
        )
    }
    _ = try await timed("no-filter topic warm") {
        try await StudentPickEngine.pick(
            selection: topicSelection, sections: sections, filterId: nil,
            student: student, content: noFilterContent
        )
    }
    let noFilterAllContent = ContentService()
    _ = try await timed("no-filter 12 sections cold") {
        try await StudentPickEngine.pick(
            selection: allSectionsSelection, sections: sections, filterId: nil,
            student: student, content: noFilterAllContent
        )
    }
    _ = try await timed("no-filter 12 sections warm") {
        try await StudentPickEngine.pick(
            selection: allSectionsSelection, sections: sections, filterId: nil,
            student: student, content: noFilterAllContent
        )
    }

    print("\n== Snapshot and local engine ==")
    guard let studentId = await student.selfUserId() else {
        print("No self user id")
        exit(1)
    }
    let directSnapshot: PickSnapshot = try await timed("snapshot RPC direct") {
        try await client.rpc(
            "student_picking_snapshot_v1",
            params: ["p_student_id": .string(studentId), "p_source": .string("all")],
            as: PickSnapshot.self
        )
    }
    print("snapshot: protos=\(directSnapshot.protos.count) topics=\(directSnapshot.topics.count) qstats=\(directSnapshot.qstats.count) question-groups=\(directSnapshot.questions.count) manifests=\(directSnapshot.manifestPaths.count)")
    for i in 1...3 {
        _ = try await timed("local resolve empty/index run \(i)") {
            try PickFilteredEngine.resolveBatch(
                snapshot: directSnapshot, filterId: "weak_spots",
                requests: [], seed: "latency-probe"
            )
        }
    }
    let oneTopicRequest = [(kind: "topic", id: Optional(firstTopic.id), n: 7)]
    for i in 1...3 {
        _ = try await timed("local resolve one topic run \(i)") {
            try PickFilteredEngine.resolveBatch(
                snapshot: directSnapshot, filterId: "weak_spots",
                requests: oneTopicRequest, seed: "latency-probe"
            )
        }
    }
    let requests = sections.map { (kind: "section", id: Optional($0.section.id), n: 7) }
    for i in 1...5 {
        _ = try await timed("local resolve 12 sections run \(i)") {
            try PickFilteredEngine.resolveBatch(
                snapshot: directSnapshot, filterId: "weak_spots",
                requests: requests, seed: "latency-probe"
            )
        }
    }

    print("\n== StudentPickEngine: filtered ==")
    await PickSnapshotCache.shared.invalidateAll()
    let filteredContent = ContentService()
    _ = try await timed("filtered topic cold snapshot+content") {
        try await StudentPickEngine.pick(
            selection: topicSelection, sections: sections, filterId: "weak_spots",
            student: student, content: filteredContent
        )
    }
    _ = try await timed("filtered topic warm") {
        try await StudentPickEngine.pick(
            selection: topicSelection, sections: sections, filterId: "weak_spots",
            student: student, content: filteredContent
        )
    }
    let filteredAllContent = ContentService()
    _ = try await timed("filtered 12 sections warm snapshot") {
        try await StudentPickEngine.pick(
            selection: allSectionsSelection, sections: sections, filterId: "weak_spots",
            student: student, content: filteredAllContent
        )
    }
    _ = try await timed("filtered 12 sections warm all") {
        try await StudentPickEngine.pick(
            selection: allSectionsSelection, sections: sections, filterId: "weak_spots",
            student: student, content: filteredAllContent
        )
    }

    print("\n== Performance gates ==")
    var perfFailed = false
    let cachedResolve = try await measured {
        try PickFilteredEngine.resolveBatch(
            snapshot: directSnapshot, filterId: "weak_spots",
            requests: oneTopicRequest, seed: "latency-probe"
        )
    }
    let warmFiltered = try await measured {
        try await StudentPickEngine.pick(
            selection: topicSelection, sections: sections, filterId: "weak_spots",
            student: student, content: filteredContent
        )
    }
    for gate in [
        ("cached local resolve one topic", cachedResolve.ms, 20.0),
        ("warm filtered topic", warmFiltered.ms, 50.0),
    ] {
        let ok = gate.1 < gate.2
        perfFailed = perfFailed || !ok
        print(String(format: "%@ %@: %.1f ms < %.0f ms",
                     ok ? "PASS" : "FAIL", gate.0, gate.1, gate.2))
    }
    if perfFailed { exit(1) }

}
}
