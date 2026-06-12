import SwiftUI

/// Тренировка: прохождение подобранных задач + локальная проверка +
/// запись попытки (write_answer_events_v1) + экран результата.
struct TrainingRunView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    let questions: [RunQuestion]
    let shuffled: Bool
    var initialAnswers: [String: String] = [:]

    @State private var answers: [String: String] = [:]
    @State private var startedAt = Date()
    @State private var showConfirm = false
    @State private var isSubmitting = false
    @State private var results: [AttemptQuestion]?
    @State private var saveError: String?
    @State private var focusQuestion: RunQuestion?

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
                        durationMs: Int(Date().timeIntervalSince(startedAt) * 1000),
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
                #if os(iOS)
                ToolbarItem(placement: .primaryAction) {
                    PDFExportButton(questions: questions, defaultTitle: "Тренировка")
                }
                #endif
            }
            .onAppear { answers = initialAnswers }
            #if os(iOS)
            .fullScreenCover(item: $focusQuestion) { q in
                FocusCardView(question: q)
            }
            #endif
        }
        .drawOverlay()
    }

    private var runScreen: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Всего задач: \(questions.count)")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textDim)

                ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                    QuestionRunCard(
                        index: idx,
                        question: q,
                        answer: Binding(
                            get: { answers[q.id] ?? "" },
                            set: { answers[q.id] = $0; saveDraft() }
                        ),
                        onFocus: { focusQuestion = q }
                    )
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
                .padding(.top, 8)
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

    private func saveDraft() {
        TrainingDraftStore.save(.init(
            refs: questions.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) },
            answers: answers,
            mode: "list",
            shuffle: shuffled,
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
