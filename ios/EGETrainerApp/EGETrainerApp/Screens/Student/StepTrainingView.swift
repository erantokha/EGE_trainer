import SwiftUI

/// Режим «Тестирование» — порт tasks/trainer.html: по одной задаче, таймер,
/// прогресс «N/M», навигация вперёд/назад, мгновенная проверка «Проверить»,
/// подтверждение завершения, отчёт.
struct StepTrainingView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    let questions: [RunQuestion]
    var initialAnswers: [String: String] = [:]

    @State private var index = 0
    @State private var answers: [String: String] = [:]
    @State private var checked: [String: AttemptQuestion] = [:]   // questionId -> результат «Проверить»
    @State private var startedAt = Date()
    @State private var now = Date()
    @State private var showConfirm = false
    @State private var isSubmitting = false
    @State private var results: [AttemptQuestion]?
    @State private var saveError: String?

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var emptyCount: Int {
        questions.filter { (answers[$0.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }.count
    }

    var body: some View {
        NavigationStack {
            Group {
                if let results {
                    TrainingReviewScreen(
                        items: results,
                        questions: questions,
                        durationMs: Int(now.timeIntervalSince(startedAt) * 1000),
                        saveError: saveError,
                        onNewSession: { dismiss() }
                    )
                } else {
                    runScreen
                }
            }
            .background(Theme.bg)
            .navigationTitle("Тренировка")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(results == nil ? "Прервать" : "Закрыть") {
                        if results == nil { saveDraft() }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .principal) {
                    if results == nil {
                        HStack(spacing: 14) {
                            Text("\(index + 1) / \(questions.count)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.text)
                            Label(timerText, systemImage: "stopwatch")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.textDim)
                        }
                    }
                }
            }
            .onReceive(timer) { now = $0 }
            .onAppear { answers = initialAnswers }
        }
        .drawOverlay()
    }

    private var timerText: String {
        let s = max(0, Int(now.timeIntervalSince(startedAt)))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }

    private var runScreen: some View {
        let q = questions[index]
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                QuestionRunCard(
                    index: index,
                    question: q,
                    answer: Binding(
                        get: { answers[q.id] ?? "" },
                        set: { answers[q.id] = $0; saveDraft() }
                    )
                )
                .disabled(checked[q.id] != nil)

                if let res = checked[q.id] {
                    checkVerdict(res)
                } else {
                    Button("Проверить") { check(q) }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled((answers[q.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
                }

                HStack(spacing: 10) {
                    Button {
                        index = max(0, index - 1)
                    } label: {
                        Label("Назад", systemImage: "chevron.left")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(index == 0)

                    Button {
                        index = min(questions.count - 1, index + 1)
                    } label: {
                        Label(checked[q.id] == nil ? "Пропустить" : "Дальше",
                              systemImage: "chevron.right")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(index >= questions.count - 1)
                }

                Button {
                    if emptyCount > 0 {
                        showConfirm = true
                    } else {
                        Task { await finish() }
                    }
                } label: {
                    if isSubmitting { ProgressView().tint(.white) } else { Text("Завершить") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSubmitting)
                .padding(.top, 6)
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog(
            "Не заполнено \(emptyCount) из \(questions.count). Завершить тренировку?",
            isPresented: $showConfirm,
            titleVisibility: .visible
        ) {
            Button("Завершить", role: .destructive) {
                Task { await finish() }
            }
            Button("Продолжить решать", role: .cancel) {}
        }
    }

    /// Вердикт после «Проверить» — как #result веба:
    /// «Верно ✔» / «Неверно ✖. Правильный ответ: …».
    private func checkVerdict(_ res: AttemptQuestion) -> some View {
        HStack(spacing: 8) {
            Image(systemName: res.correct == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(res.correct == true ? Theme.success : Theme.danger)
            if res.correct == true {
                Text("Верно").fontWeight(.semibold).foregroundStyle(Theme.success)
            } else {
                Text("Неверно. Правильный ответ: \(res.correctText ?? "—")")
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.danger)
            }
            Spacer()
        }
        .font(.subheadline)
        .padding(12)
        .background(res.correct == true ? Theme.successBg : Theme.dangerBg)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
    }

    private func check(_ q: RunQuestion) {
        let result = AnswerChecker.check(spec: q.spec, rawInput: answers[q.id] ?? "")
        checked[q.id] = AttemptQuestion(
            questionId: q.questionId,
            topicId: q.topicId,
            correct: result.correct,
            chosenText: result.chosenText,
            correctText: result.correctText,
            normalizedText: result.normalizedText,
            timeMs: 0,
            difficulty: q.difficulty
        )
    }

    private func saveDraft() {
        TrainingDraftStore.save(.init(
            refs: questions.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) },
            answers: answers,
            mode: "test",
            shuffle: false,
            savedAt: Date()
        ))
    }

    private func finish() async {
        isSubmitting = true
        defer { isSubmitting = false }

        let finishedAt = Date()
        let perQuestionMs = questions.isEmpty
            ? 0
            : Int(finishedAt.timeIntervalSince(startedAt) * 1000) / questions.count

        let items: [AttemptQuestion] = questions.map { q in
            if var pre = checked[q.id] {
                pre.timeMs = perQuestionMs
                return pre
            }
            let check = AnswerChecker.check(spec: q.spec, rawInput: answers[q.id] ?? "")
            return AttemptQuestion(
                questionId: q.questionId,
                topicId: q.topicId,
                correct: check.correct,
                chosenText: check.chosenText,
                correctText: check.correctText,
                normalizedText: check.normalizedText,
                timeMs: perQuestionMs,
                difficulty: q.difficulty
            )
        }

        do {
            try await app.student.writeTrainingAttempt(
                questions: items,
                startedAt: startedAt,
                finishedAt: finishedAt,
                topicIds: Array(Set(questions.map(\.topicId)))
            )
        } catch {
            saveError = error.localizedDescription
        }
        TrainingDraftStore.clear()
        results = items
    }
}
