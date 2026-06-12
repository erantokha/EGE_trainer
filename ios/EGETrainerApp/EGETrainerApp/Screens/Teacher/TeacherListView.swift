import SwiftUI

/// «Начать» учителя (P5-3) — полноэкранный рабочий лист подборки
/// (push-переход, свайп вправо для выхода): карточки задач со СКРЫТЫМИ
/// ответами (раскрытие тапом), PDF-экспорт и рисовалка для разбора с учеником.
struct TeacherListView: View {
    let questions: [RunQuestion]
    @State private var focusQuestion: RunQuestion?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Всего задач: \(questions.count)")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textDim)

                ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                    PreviewQuestionCard(
                        index: idx,
                        question: q,
                        answerStyle: false,   // ответы скрыты, раскрываются тапом
                        onFocus: { focusQuestion = q }
                    )
                }
            }
            .padding(16)
        }
        #if os(iOS)
        .fullScreenCover(item: $focusQuestion) { q in
            FocusCardView(question: q)
        }
        #endif
        .background(Theme.bg)
        .navigationTitle("Подборка")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                PDFExportButton(questions: questions, defaultTitle: "Подборка задач",
                                answersDefault: true)
            }
        }
        #endif
        .drawOverlay()
    }
}
