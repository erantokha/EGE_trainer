import SwiftUI

/// Просмотр результата ученика учителем (hw.html?as_teacher=1):
/// get_homework_attempt_for_teacher + разбор с условиями из контента.
struct AttemptReviewView: View {
    @EnvironmentObject private var app: AppState

    let attemptId: String

    @State private var attempt: HomeworkAttempt?
    @State private var stems: [String: (stem: String, figure: Figure?)] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if isLoading {
                    LoadingStateView(text: "Загружаем результат...")
                } else if let errorMessage {
                    ErrorStateView(message: errorMessage) { await load() }
                } else if let attempt {
                    let items = attempt.payload?.questions ?? []
                    let correct = attempt.correct ?? items.filter { $0.correct == true }.count
                    let total = attempt.total ?? items.count

                    VStack(alignment: .leading, spacing: 4) {
                        Text(attempt.homeworkTitle ?? attempt.payload?.title ?? "Работа")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Theme.text)
                        if let name = attempt.studentName {
                            Text("Ученик: \(name)")
                                .font(.subheadline)
                                .foregroundStyle(Theme.textDim)
                        }
                        if let finished = attempt.finishedAt {
                            Text("Сдано: \(Fmt.dateTime(finished))")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                        }
                    }

                    AttemptSummaryHeader(correct: correct, total: total, durationMs: attempt.durationMs)

                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        QuestionReviewCard(
                            index: idx,
                            item: item,
                            stem: stems[item.id]?.stem,
                            figure: stems[item.id]?.figure
                        )
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Результат ученика")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let a = try await app.homework.attemptForTeacher(attemptId: attemptId)
            attempt = a
            // Подтягиваем условия задач из контента для полного разбора
            let refs: [QuestionRef] = (a.payload?.questions ?? []).compactMap { q in
                guard let qid = q.questionId else { return nil }
                return QuestionRef(topicId: q.topicId ?? "", questionId: qid)
            }
            if let questions = try? await app.content.buildQuestions(refs: refs) {
                var map: [String: (String, Figure?)] = [:]
                for q in questions {
                    map[q.questionId] = (q.stem, q.figure)
                }
                stems = map
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
