// Скриншот-харнесс: рендерит SwiftUI-экраны приложения с live-данными
// в окнах 390×844 (iPhone 11 viewport) на macOS и сохраняет PNG.
// Это fallback вместо iOS Simulator (на машине нет Xcode) — вёрстка и данные
// реальные, но системный хром (tab bar, navbar, шрифты) может слегка отличаться.
//
// Сборка:
//   swiftc -o /tmp/ege_shots EGETrainerApp/{Models,Services,DesignSystem,App,Screens/**}/*.swift DevHarness/screenshots.swift
// Креды — те же env, что у main.swift. Вывод: Screenshots/app-result/*.png

import Foundation
import SwiftUI
import AppKit

let outDir = ProcessInfo.processInfo.environment["EGE_SHOT_DIR"]
    ?? FileManager.default.currentDirectoryPath + "/Screenshots/app-result"

@MainActor
func makeWindow<V: View>(_ view: V) -> NSWindow {
    let window = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 390, height: 844),
        styleMask: [.borderless],
        backing: .buffered,
        defer: false
    )
    let hosting = NSHostingView(rootView: AnyView(view.frame(width: 390, height: 844)))
    hosting.frame = NSRect(x: 0, y: 0, width: 390, height: 844)
    window.contentView = hosting
    window.orderFrontRegardless()
    return window
}

@MainActor
func snap(_ window: NSWindow, name: String) {
    guard let view = window.contentView,
          let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
        print("  ❌ \(name): нет bitmap rep")
        return
    }
    view.cacheDisplay(in: view.bounds, to: rep)
    guard let data = rep.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else {
        print("  ❌ \(name): png encode")
        return
    }
    let url = URL(fileURLWithPath: outDir).appendingPathComponent("\(name).png")
    try? data.write(to: url)
    print("  📸 \(name).png (\(data.count / 1024) KB)")
}

@MainActor
func pumpRunLoopOnce() {
    RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
}

@MainActor
func waitRunLoop(seconds: Double) async {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
        pumpRunLoopOnce()
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)
    }
}

@MainActor
func shoot<V: View>(_ view: V, name: String, settle: Double = 6) async {
    let window = makeWindow(view)
    await waitRunLoop(seconds: settle)
    snap(window, name: name)
    window.orderOut(nil)
}

func env(_ key: String) -> String? { ProcessInfo.processInfo.environment[key] }

@main
struct ScreenshotMain {
    static func main() async throws {
        let app = await NSApplication.shared
        await app.setActivationPolicy(.accessory)
        try await run()
    }
}

@MainActor
func run() async throws {
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

    guard let stEmail = env("EGE_STUDENT_EMAIL"), let stPass = env("EGE_STUDENT_PASSWORD"),
          let teEmail = env("EGE_TEACHER_EMAIL"), let tePass = env("EGE_TEACHER_PASSWORD")
    else {
        print("нет кред в env")
        exit(2)
    }

    // 1) Экран входа (без сессии)
    let anonState = AppState()
    await shoot(AuthView().environmentObject(anonState).tint(Theme.accent), name: "ios_auth", settle: 2)

    // 2) Ученик
    print("Логин ученика...")
    let studentState = AppState()
    try await studentState.signIn(email: stEmail, password: stPass)

    await shoot(NavigationStack { StudentHomeView() }.environmentObject(studentState).tint(Theme.accent),
                name: "ios_student_home", settle: 10)
    await shoot(NavigationStack { MyHomeworksView() }.environmentObject(studentState).tint(Theme.accent),
                name: "ios_student_homeworks", settle: 10)

    // ДЗ: несданное -> прохождение; сданное -> результат
    let summary = try await studentState.homework.myHomeworksSummary()
    if let pending = summary.items.first(where: { !$0.isSubmitted }) {
        await shoot(NavigationStack { HomeworkRunView(token: pending.token) }
                        .environmentObject(studentState).tint(Theme.accent),
                    name: "ios_student_homework_run", settle: 10)
    } else {
        print("  (нет несданных ДЗ — ios_student_homework_run пропущен)")
    }
    if let submitted = summary.items.first(where: { $0.isSubmitted }) {
        await shoot(NavigationStack { HomeworkRunView(token: submitted.token) }
                        .environmentObject(studentState).tint(Theme.accent),
                    name: "ios_student_result", settle: 10)
    }

    await shoot(NavigationStack { StatsView() }.environmentObject(studentState).tint(Theme.accent),
                name: "ios_student_stats", settle: 10)
    await shoot(NavigationStack { ProfileView() }.environmentObject(studentState).tint(Theme.accent),
                name: "ios_student_profile", settle: 8)

    // 3) Учитель
    print("Логин учителя...")
    let teacherState = AppState()
    try await teacherState.signIn(email: teEmail, password: tePass)

    await shoot(NavigationStack { TeacherHomeView() }.environmentObject(teacherState).tint(Theme.accent),
                name: "ios_teacher_home", settle: 10)
    await shoot(NavigationStack { MyStudentsView() }.environmentObject(teacherState).tint(Theme.accent),
                name: "ios_teacher_students", settle: 10)

    let students = try await teacherState.teacher.listMyStudents()
    if let target = students.first(where: { $0.email == stEmail }) ?? students.first {
        await shoot(NavigationStack { StudentCardView(student: target) }
                        .environmentObject(teacherState).tint(Theme.accent),
                    name: "ios_teacher_student_card", settle: 10)
        await shoot(NavigationStack { CreateHomeworkView(student: target, selection: ["1.1": 1, "3.1": 1]) }
                        .environmentObject(teacherState).tint(Theme.accent),
                    name: "ios_teacher_create_homework", settle: 12)
        if let attempt = try? await teacherState.teacher.studentAttempts(studentId: target.studentId).first {
            await shoot(NavigationStack { AttemptReviewView(attemptId: attempt.attemptId) }
                            .environmentObject(teacherState).tint(Theme.accent),
                        name: "ios_teacher_attempt_review", settle: 10)
        }
    }

    print("Готово: \(outDir)")
    exit(0)
}
