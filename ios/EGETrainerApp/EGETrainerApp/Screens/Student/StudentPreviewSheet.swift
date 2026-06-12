import SwiftUI

/// Предпросмотр подборки УЧЕНИКА (порция №3 — на вебе кнопка «Предпросмотр»
/// в нижнем баре главной): карточки условий без ответов, удаление,
/// «Начать (N)» запускает тренировку с оставшимися задачами.
struct StudentPreviewSheet: View {
    @State var questions: [RunQuestion]
    var onStart: ([RunQuestion]) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    Text("Показано: \(questions.count)")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.textDim)

                    if questions.isEmpty {
                        EmptyStateView(
                            icon: "tray",
                            title: "Подборка пуста",
                            subtitle: "Вернитесь и выберите темы."
                        )
                    }

                    ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                        PreviewQuestionCard(
                            index: idx,
                            question: q,
                            answerStyle: nil,   // ученик ответы не видит
                            onDelete: { questions.removeAll { $0.id == q.id } }
                        )
                    }

                    if !questions.isEmpty {
                        Button {
                            onStart(questions)
                        } label: {
                            Text("Начать (\(questions.count))")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.top, 6)
                    }
                }
                .padding(16)
            }
            .background(Theme.bg)
            .navigationTitle("Предпросмотр")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
            }
        }
    }
}
