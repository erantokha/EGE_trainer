// Read-only latency probe for the iOS student/teacher accordion pipeline.
// Compile from ios/EGETrainerApp:
// swiftc -O -o /tmp/ios_accordion_latency_probe \
//   EGETrainerApp/Models/*.swift EGETrainerApp/Services/*.swift \
//   DevHarness/ProtoPick.swift \
//   ../../reports/perf/ios_accordion_latency_probe.swift

import Foundation

func env(_ key: String) -> String? {
    ProcessInfo.processInfo.environment[key]
}

func measured<T>(_ operation: () async throws -> T) async rethrows -> (value: T, ms: Double) {
    let started = ContinuousClock.now
    let value = try await operation()
    let duration = started.duration(to: .now)
    return (value, Double(duration.components.seconds) * 1_000
        + Double(duration.components.attoseconds) / 1_000_000_000_000_000)
}

func printTiming(_ label: String, _ ms: Double) {
    print(String(format: "%-48@ %8.1f ms", label as NSString, ms))
}

func snapshot(client: SupabaseClient, studentId: String) async throws -> PickSnapshot {
    try await client.rpc(
        "student_picking_snapshot_v1",
        params: ["p_student_id": .string(studentId), "p_source": .string("all")],
        as: PickSnapshot.self
    )
}

func rawRPC<T: Decodable>(
    client: SupabaseClient,
    name: String,
    params: [String: JSONValue],
    as type: T.Type
) async throws -> (networkMs: Double, decodeMs: Double, bytes: Int, value: T) {
    guard let session = await client.currentSession else { throw SupabaseError.authRequired }
    var request = URLRequest(
        url: SupabaseConfig.baseURL.appendingPathComponent("rest/v1/rpc/\(name)")
    )
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONEncoder().encode(params)

    let networkStarted = ContinuousClock.now
    let (data, response) = try await URLSession.shared.data(for: request)
    let networkDuration = networkStarted.duration(to: .now)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw SupabaseError.emptyResponse
    }

    let decodeStarted = ContinuousClock.now
    let value = try JSONDecoder().decode(T.self, from: data)
    let decodeDuration = decodeStarted.duration(to: .now)
    func ms(_ duration: Duration) -> Double {
        Double(duration.components.seconds) * 1_000
            + Double(duration.components.attoseconds) / 1_000_000_000_000_000
    }
    return (ms(networkDuration), ms(decodeDuration), data.count, value)
}

@main
struct IOSAccordionLatencyProbe {
    static func main() async throws {
        guard let studentEmail = env("EGE_STUDENT_EMAIL"),
              let studentPassword = env("EGE_STUDENT_PASSWORD"),
              let teacherEmail = env("EGE_TEACHER_EMAIL"),
              let teacherPassword = env("EGE_TEACHER_PASSWORD")
        else {
            print("Set EGE_STUDENT_EMAIL/PASSWORD and EGE_TEACHER_EMAIL/PASSWORD")
            exit(2)
        }

        print("== Student accordion path ==")
        let studentClient = SupabaseClient(store: InMemorySessionStore())
        let studentAuth = AuthService(client: studentClient)
        let studentService = StudentService(client: studentClient)
        let studentLogin = try await measured {
            try await studentAuth.signIn(email: studentEmail, password: studentPassword)
        }
        printTiming("auth.signIn student", studentLogin.ms)

        let content = ContentService()
        let catalogCold = try await measured { try await content.sectionsWithTopics() }
        printTiming("catalog sections cold", catalogCold.ms)
        let catalogWarm = try await measured { try await content.sectionsWithTopics() }
        printTiming("catalog sections warm", catalogWarm.ms)

        for run in 1...3 {
            let analytics = try await measured {
                try await studentService.analytics(scope: "self", days: 30, source: "all")
            }
            printTiming("student analytics run \(run)", analytics.ms)
            let topics = analytics.value.topics ?? []
            let cpuStarted = ContinuousClock.now
            for _ in 0..<10_000 {
                _ = ScoreForecast.compute(topics: topics)
            }
            let cpuDuration = cpuStarted.duration(to: .now)
            let cpuMs = Double(cpuDuration.components.seconds) * 1_000
                + Double(cpuDuration.components.attoseconds) / 1_000_000_000_000_000
            printTiming("forecast CPU per call (10k average)", cpuMs / 10_000)
        }
        let rawStudentAnalytics: (networkMs: Double, decodeMs: Double, bytes: Int, value: AnalyticsScreen)
            = try await rawRPC(
                client: studentClient,
                name: "student_analytics_screen_v1",
                params: [
                    "p_viewer_scope": .string("self"),
                    "p_days": .number(30),
                    "p_source": .string("all"),
                    "p_mode": .string("init"),
                ],
                as: AnalyticsScreen.self
            )
        printTiming("student analytics raw network", rawStudentAnalytics.networkMs)
        printTiming("student analytics JSON decode", rawStudentAnalytics.decodeMs)
        print("student analytics payload bytes: \(rawStudentAnalytics.bytes)")

        if let studentId = await studentService.selfUserId() {
            for run in 1...3 {
                let snap = try await measured {
                    try await snapshot(client: studentClient, studentId: studentId)
                }
                printTiming("student snapshot run \(run)", snap.ms)
            }

            let actualPath = try await measured {
                async let prewarm = snapshot(client: studentClient, studentId: studentId)
                let freshContent = ContentService()
                let sections = try await freshContent.sectionsWithTopics()
                let analytics = try await studentService.analytics(scope: "self")
                _ = try await prewarm
                return (sections, analytics)
            }
            printTiming("student current load + concurrent snapshot", actualPath.ms)
        }

        print("\n== Teacher accordion path ==")
        let teacherClient = SupabaseClient(store: InMemorySessionStore())
        let teacherAuth = AuthService(client: teacherClient)
        let teacherService = TeacherService(client: teacherClient)
        let teacherAnalytics = StudentService(client: teacherClient)
        let teacherLogin = try await measured {
            try await teacherAuth.signIn(email: teacherEmail, password: teacherPassword)
        }
        printTiming("auth.signIn teacher", teacherLogin.ms)
        let studentsResult = try await measured { try await teacherService.listMyStudents() }
        printTiming("listMyStudents", studentsResult.ms)
        let students = Array(studentsResult.value.prefix(2))
        guard let first = students.first else {
            print("Teacher has no linked students")
            exit(1)
        }

        let rawTeacherPicking: (networkMs: Double, decodeMs: Double, bytes: Int, value: PickingScreen)
            = try await rawRPC(
                client: teacherClient,
                name: "teacher_picking_screen_v2",
                params: [
                    "p_student_id": .string(first.studentId),
                    "p_mode": .string("init"),
                    "p_days": .number(30),
                    "p_source": .string("all"),
                    "p_filter_id": .null,
                    "p_selection": .object([:]),
                    "p_request": .object([:]),
                    "p_seed": .null,
                    "p_exclude_question_ids": .null,
                ],
                as: PickingScreen.self
            )
        printTiming("teacher picking raw network", rawTeacherPicking.networkMs)
        printTiming("teacher picking JSON decode", rawTeacherPicking.decodeMs)
        print("teacher picking payload bytes: \(rawTeacherPicking.bytes)")

        func sequential(student: StudentListItem, label: String) async throws {
            let totalStarted = ContinuousClock.now
            let picking = try await measured {
                try await teacherService.pickingScreen(studentId: student.studentId)
            }
            printTiming("\(label) pickingScreen (accordion ready)", picking.ms)
            let analytics = try await measured {
                try await teacherAnalytics.analytics(scope: "teacher", studentId: student.studentId)
            }
            printTiming("\(label) analytics (blocks spinner)", analytics.ms)
            let total = totalStarted.duration(to: .now)
            let totalMs = Double(total.components.seconds) * 1_000
                + Double(total.components.attoseconds) / 1_000_000_000_000_000
            printTiming("\(label) current sequential visible time", totalMs)
        }

        try await sequential(student: first, label: "A first")
        if students.count > 1 {
            try await sequential(student: students[1], label: "B first")
            try await sequential(student: first, label: "A return")
        } else {
            try await sequential(student: first, label: "A repeat")
        }

        let parallel = try await measured {
            async let picking = measured {
                try await teacherService.pickingScreen(studentId: first.studentId)
            }
            async let analytics = measured {
                try await teacherAnalytics.analytics(scope: "teacher", studentId: first.studentId)
            }
            return try await (picking, analytics)
        }
        printTiming("A parallel picking individual", parallel.value.0.ms)
        printTiming("A parallel analytics individual", parallel.value.1.ms)
        printTiming("A picking+analytics parallel total", parallel.ms)

        for run in 1...2 {
            let snap = try await measured {
                try await snapshot(client: teacherClient, studentId: first.studentId)
            }
            printTiming("teacher snapshot A run \(run)", snap.ms)
        }

        let actualTeacherPath = try await measured {
            async let prewarm = snapshot(client: teacherClient, studentId: first.studentId)
            let picking = try await teacherService.pickingScreen(studentId: first.studentId)
            let analytics = try await teacherAnalytics.analytics(
                scope: "teacher", studentId: first.studentId
            )
            _ = try await prewarm
            return (picking, analytics)
        }
        printTiming("teacher current load + concurrent snapshot", actualTeacherPath.ms)

        print("\n== WIOS.4 teacher accordion cache path ==")
        let accordionCache = AccordionScreenCache()
        func cachedPicking(_ student: StudentListItem, label: String) async throws {
            let result = try await measured {
                try await accordionCache.picking(studentId: student.studentId, filterId: nil) {
                    try await teacherService.pickingScreen(studentId: student.studentId)
                }
            }
            printTiming(label, result.ms)
        }
        try await cachedPicking(first, label: "A first cached-path load")
        if students.count > 1 {
            try await cachedPicking(students[1], label: "B first cached-path load")
        }
        try await cachedPicking(first, label: "A return cached-path load")
    }
}
