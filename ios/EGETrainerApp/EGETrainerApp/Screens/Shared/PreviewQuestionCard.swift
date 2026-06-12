import SwiftUI

/// Карточка задачи в предпросмотре подборки — единый вид для обеих ролей
/// (порция №3): номер + крестик удаления, условие с формулами, рисунок;
/// ответ — только у учителя (скрываемый или открытый в режиме «Начать»).
struct PreviewQuestionCard: View {
    let index: Int
    let question: RunQuestion
    /// nil — без ответа (ученик); false — скрываемый; true — открытый
    var answerStyle: Bool? = nil
    var onDelete: (() -> Void)? = nil
    /// P6-3a: фокус-режим — карточка по центру на белом полотне с рисовалкой.
    var onFocus: (() -> Void)? = nil

    @State private var answerExpanded = false

    private var answerText: String {
        Fmt.answer(text: question.spec.text, value: question.spec.value)
    }

    var body: some View {
        Card(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center) {
                    Text("\(index + 1)")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 28, height: 28)
                        .background(Theme.accentLight)
                        .clipShape(Circle())
                    Text(question.topicId)
                        .font(.caption2)
                        .foregroundStyle(Theme.textDim)
                    Spacer()
                    if let onFocus {
                        Button(action: onFocus) {
                            Image(systemName: "arrow.up.left.and.arrow.down.right")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                                .frame(width: 28, height: 28)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if let onDelete {
                        Button(action: onDelete) {
                            Image(systemName: "xmark")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                                .frame(width: 28, height: 28)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                MathTextView(text: question.stem, fontSize: 15)
                FigureView(figure: question.figure, maxHeight: 160)
                if let open = answerStyle {
                    if open {
                        HStack(spacing: 6) {
                            Text("Ответ:").font(.caption).foregroundStyle(Theme.textDim)
                            Text(answerText)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Theme.success)
                        }
                    } else {
                        // P6-2: собственная кнопка с тап-зоной во всю ширину —
                        // DisclosureGroup срабатывал нестабильно (узкая зона +
                        // перехват жестов соседним WKWebView)
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                answerExpanded.toggle()
                            }
                        } label: {
                            HStack {
                                Text("Ответ").font(.caption).foregroundStyle(Theme.textDim)
                                if answerExpanded {
                                    Text(answerText)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Theme.success)
                                }
                                Spacer()
                                Image(systemName: answerExpanded ? "chevron.up" : "chevron.down")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.textDim)
                            }
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
