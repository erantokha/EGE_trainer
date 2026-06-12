import SwiftUI

#if DEBUG
/// DEBUG-галерея для скриптовой приёмки (simctl launch c SIMCTL_CHILD_E2E_DEMO=...).
/// Маршруты, требующие данных, сами логинятся кредами из E2E_EMAIL/_PASSWORD.
/// В релизной сборке не компилируется в роутинг.
struct DemoGalleryView: View {
    let kind: String
    @EnvironmentObject private var app: AppState
    @State private var ready = false

    private var needsAuth: Bool { !["math", "auth", "complete"].contains(kind) }

    var body: some View {
        Group {
            if needsAuth && !ready {
                ProgressView("Готовим demo-окружение...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .task { await prepare() }
            } else {
                route
            }
        }
        .background(Theme.bg)
    }

    private func prepare() async {
        await app.bootstrap()
        let env = ProcessInfo.processInfo.environment
        if let email = env["E2E_EMAIL"], let password = env["E2E_PASSWORD"],
           !email.isEmpty, !password.isEmpty {
            var needLogin = true
            if case .signedIn(let p) = app.phase,
               p.email?.lowercased() == email.lowercased() {
                needLogin = false
            }
            if needLogin {
                await app.signOut()
                try? await app.signIn(email: email, password: password)
            }
        }
        ready = true
    }

    @ViewBuilder
    private var route: some View {
        switch kind {
        case "math":
            mathDemo
        case "auth":
            AuthView()
        case "complete":
            CompleteProfileView()
        case "step":
            StepTrainingDemo()
        case "archive":
            NavigationStack { HomeworkArchiveView() }
        case "analog":
            AnalogRunView(topicId: "8.1", baseQuestionId: "8.1.1.1")
        case "proto":
            ProtoPickerDemo()
        case "preview":
            TeacherPreviewDemo()
        case "preview_all":
            // эмуляция «Выбрать всё»: по 1 задаче из каждой секции
            TeacherPreviewDemo(requests: (1...12).map { (kind: "section", id: "\($0)", n: 1) })
        case "preview_stale":
            // фильтр «Давно не решал» — честный shortage-текст
            TeacherPreviewDemo(
                requests: (1...12).map { (kind: "section", id: "\($0)", n: 1) },
                filterId: "stale",
                studentEmail: "erantokha@mail.ru"
            )
        case "proto_teacher":
            TeacherProtoDemo()
        default:
            Text("Неизвестный demo-маршрут: \(kind)")
        }
    }

    private var mathDemo: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                EyebrowText("DEMO: MATHJAX")
                Card {
                    MathTextView(text: #"На рисунке изображены график функции \(y=f(x)\) и касательная к нему в точке с абсциссой \(x_0\). Найдите значение производной функции \(f(x)\) в точке \(x_0\)."#)
                }
                Card {
                    MathTextView(text: #"Решите уравнение \(\frac{x-119}{9}=-7\). Дробь: \(\frac{a^2+\sqrt{b}}{c_1}\), степень $2^{10}=1024$."#)
                }
                Card {
                    MathTextView(text: "Текст без формул — рендерится нативно, без WKWebView.")
                }
            }
            .padding(16)
        }
    }
}

/// Пошаговый режим на живых задачах темы 8.1.
private struct StepTrainingDemo: View {
    @EnvironmentObject private var app: AppState
    @State private var questions: [RunQuestion] = []

    var body: some View {
        Group {
            if questions.isEmpty {
                ProgressView("Собираем задачи...")
                    .task {
                        if let topic = try? await app.content.topicEntry(id: "8.1"),
                           let qs = try? await app.content.randomQuestions(topic: topic, count: 3) {
                            questions = qs
                        }
                    }
            } else {
                StepTrainingView(questions: questions)
            }
        }
    }
}

/// Модалка прототипов (self-режим) на теме 8.1.
private struct ProtoPickerDemo: View {
    @State private var counts: [String: ProtoPick] = [:]

    var body: some View {
        ProtoPickerSheet(
            topicId: "8.1",
            topicTitle: "8.1. Производная (демо)",
            studentId: nil,
            protoCounts: $counts
        )
    }
}

/// Предпросмотр добавленных задач учителя (по умолчанию: 3 задачи двух тем).
private struct TeacherPreviewDemo: View {
    @EnvironmentObject private var app: AppState
    var requests: [(kind: String, id: String, n: Int)] =
        [(kind: "topic", id: "8.1", n: 2), (kind: "topic", id: "1.1", n: 1)]
    var filterId: String? = nil
    var studentEmail: String? = nil
    @State private var student: StudentListItem?

    var body: some View {
        Group {
            if let student {
                AddedTasksPreviewSheet(
                    student: student,
                    requests: requests,
                    filterId: filterId,
                    onCreateHW: { _ in }
                )
            } else {
                ProgressView("Грузим учеников...")
                    .task {
                        let all = (try? await app.teacher.listMyStudents()) ?? []
                        student = studentEmail.flatMap { mail in
                            all.first { $0.email?.lowercased() == mail.lowercased() }
                        } ?? all.first
                    }
            }
        }
    }
}

/// Модалка прототипов в TEACHER-режиме (бейджи «X/3» + дата из question_stats).
private struct TeacherProtoDemo: View {
    @EnvironmentObject private var app: AppState
    @State private var student: StudentListItem?
    @State private var counts: [String: ProtoPick] = [:]

    var body: some View {
        Group {
            if let student {
                ProtoPickerSheet(
                    topicId: "8.1",
                    topicTitle: "8.1. Производная (teacher)",
                    studentId: student.studentId,
                    protoCounts: $counts
                )
            } else {
                ProgressView("Грузим учеников...")
                    .task {
                        let all = (try? await app.teacher.listMyStudents()) ?? []
                        student = all.first { $0.email == "erantokha@mail.ru" } ?? all.first
                    }
            }
        }
    }
}
#endif
