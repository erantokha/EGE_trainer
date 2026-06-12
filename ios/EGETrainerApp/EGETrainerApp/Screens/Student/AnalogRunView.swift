import SwiftUI

/// «Решить аналог» — одиночная задача-аналог (другой вариант того же типа),
/// порт tasks/analog.html/analog.js: проверка, разбор, «Решить ещё аналог»,
/// запись попытки с meta.kind='hw_analog'.
struct AnalogRunView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    let topicId: String
    let baseQuestionId: String

    @State private var question: RunQuestion?
    @State private var usedIds: Set<String> = []
    @State private var answer = ""
    @State private var result: AttemptQuestion?
    @State private var isLoading = true
    @State private var noMoreVariants = false
    @State private var startedAt = Date()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if isLoading {
                        LoadingStateView(text: "Подбираем аналог...")
                    } else if noMoreVariants {
                        EmptyStateView(
                            icon: "checkmark.seal",
                            title: "Аналогов больше нет",
                            subtitle: "Вы решили все варианты этого задания."
                        )
                    } else if let q = question {
                        if let result {
                            QuestionReviewCard(
                                index: 0,
                                item: result,
                                stem: q.stem,
                                figure: q.figure
                            )
                            Button("Решить ещё аналог") {
                                Task { await loadNext() }
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        } else {
                            QuestionRunCard(index: 0, question: q, answer: $answer)
                            Button("Проверить") {
                                Task { await check(q) }
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(answer.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.bg)
            .navigationTitle("Аналог задачи")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
            }
            .task { await loadNext() }
        }
    }

    private func loadNext() async {
        isLoading = true
        result = nil
        answer = ""
        startedAt = Date()
        do {
            if let q = try await app.content.analogQuestion(
                topicId: topicId, baseQuestionId: baseQuestionId, usedIds: usedIds
            ) {
                usedIds.insert(q.questionId)
                question = q
            } else {
                noMoreVariants = true
            }
        } catch {
            noMoreVariants = true
        }
        isLoading = false
    }

    private func check(_ q: RunQuestion) async {
        let finishedAt = Date()
        let check = AnswerChecker.check(spec: q.spec, rawInput: answer)
        let item = AttemptQuestion(
            questionId: q.questionId,
            topicId: q.topicId,
            correct: check.correct,
            chosenText: check.chosenText,
            correctText: check.correctText,
            normalizedText: check.normalizedText,
            timeMs: Int(finishedAt.timeIntervalSince(startedAt) * 1000),
            difficulty: q.difficulty
        )
        result = item
        // запись как на вебе: meta.kind='hw_analog' + base/analog id
        try? await app.student.writeTrainingAttempt(
            questions: [item],
            startedAt: startedAt,
            finishedAt: finishedAt,
            topicIds: [q.topicId],
            extraMeta: [
                "kind": .string("hw_analog"),
                "base_question_id": .string(baseQuestionId),
                "analog_question_id": .string(q.questionId),
            ]
        )
    }
}
