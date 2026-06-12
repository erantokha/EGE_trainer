import SwiftUI

/// Общий отчёт тренировки (список и тест): сводка, фильтр «Только неверные»,
/// карточки разбора с видео и «Решить аналог», «Новая сессия» — паритет
/// summary-экрана trainer.js.
struct TrainingReviewScreen: View {
    let items: [AttemptQuestion]
    let questions: [RunQuestion]
    let durationMs: Int
    var saveError: String?
    var onNewSession: () -> Void

    @State private var onlyWrong = false
    @State private var analogTarget: AttemptQuestion?

    private var wrongCount: Int { items.filter { $0.correct != true }.count }
    private var visibleItems: [(Int, AttemptQuestion)] {
        let indexed = Array(items.enumerated()).map { ($0.offset, $0.element) }
        return onlyWrong ? indexed.filter { $0.1.correct != true } : indexed
    }

    var body: some View {
        let correct = items.filter { $0.correct == true }.count
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                Text("Отчет и статистика")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                AttemptSummaryHeader(correct: correct, total: items.count, durationMs: durationMs)

                if let saveError {
                    Text("Результат показан, но не сохранился в статистику: \(saveError)")
                        .font(.caption)
                        .foregroundStyle(Theme.warnText)
                        .padding(10)
                        .background(Theme.warnBg)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                }

                HStack(spacing: 10) {
                    if wrongCount > 0 {
                        Button {
                            onlyWrong.toggle()
                        } label: {
                            Text(onlyWrong ? "Все задачи" : "Только неверные (\(wrongCount))")
                                .font(.subheadline.weight(.medium))
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    Button("Новая сессия", action: onNewSession)
                        .buttonStyle(SecondaryButtonStyle())
                }

                ForEach(visibleItems, id: \.1.id) { idx, item in
                    QuestionReviewCard(
                        index: idx,
                        item: item,
                        stem: questions.first(where: { $0.id == item.id })?.stem,
                        figure: questions.first(where: { $0.id == item.id })?.figure,
                        analogAction: item.questionId == nil ? nil : { analogTarget = item }
                    )
                }
            }
            .padding(16)
        }
        .sheet(item: $analogTarget) { target in
            if let qid = target.questionId, let topicId = target.topicId {
                AnalogRunView(topicId: topicId, baseQuestionId: qid)
            }
        }
    }
}
