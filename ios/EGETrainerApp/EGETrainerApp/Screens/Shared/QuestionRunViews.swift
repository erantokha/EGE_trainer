import SwiftUI

/// Карточка задачи в режиме прохождения (номер, условие, рисунок, поле «Ответ»)
/// — повторяет карточки tasks/hw.html.
struct QuestionRunCard: View {
    let index: Int
    let question: RunQuestion
    @Binding var answer: String
    /// P6-3a: фокус-режим — карточка на белом полотне с рисовалкой.
    var onFocus: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(index + 1)")
                    .font(.headline.weight(.bold))
                    .frame(width: 40, height: 40)
                    .background(Theme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusSm)
                            .stroke(Theme.border, lineWidth: 1)
                    )
                MathTextView(text: question.stem)
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
            }

            FigureView(figure: question.figure)

            TextField("Ответ", text: $answer)
                .padding(12)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radiusSm)
                        .stroke(answer.isEmpty ? Theme.border : Theme.accent, lineWidth: 1)
                )
                .autocorrectionDisabled()
                #if os(iOS)
                .keyboardType(.numbersAndPunctuation)
                #endif
        }
        .padding(14)
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusMd)
                .stroke(Theme.borderLight, lineWidth: 1)
        )
    }
}

/// Карточка задачи в режиме разбора: верно/неверно, ваш ответ, правильный,
/// видео, «Решить аналог» (если передан analogAction — как .analog-btn веба).
struct QuestionReviewCard: View {
    let index: Int
    let item: AttemptQuestion
    var stem: String?
    var figure: Figure?
    var analogAction: (() -> Void)? = nil
    @State private var videoURL: URL?

    private var isCorrect: Bool { item.correct == true }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(index + 1)")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(isCorrect ? Theme.success : Theme.danger)
                    .frame(width: 40, height: 40)
                    .background(Theme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusSm)
                            .stroke(isCorrect ? Theme.success : Theme.danger, lineWidth: 2)
                    )
                if let stem {
                    MathTextView(text: stem)
                } else {
                    Text("Задача \(item.questionId ?? "")")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                }
            }

            FigureView(figure: figure)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("Ваш ответ:").foregroundStyle(Theme.text)
                    Text(item.chosenText?.isEmpty == false ? item.chosenText! : "—")
                        .foregroundStyle(isCorrect ? Theme.success : Theme.danger)
                        .fontWeight(.medium)
                }
                HStack(spacing: 6) {
                    Text("Правильный ответ:").foregroundStyle(Theme.text)
                    Text(item.correctText ?? "—")
                        .foregroundStyle(Theme.textDim)
                        .fontWeight(.medium)
                }
            }
            .font(.subheadline)

            HStack(spacing: 10) {
                if let videoURL {
                    VideoSolutionButton(url: videoURL)
                }
                if let analogAction {
                    Button(action: analogAction) {
                        Label("Решить аналог", systemImage: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(Theme.accentLight)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusMd)
                .stroke(Theme.borderLight, lineWidth: 1)
        )
        .task {
            if let qid = item.questionId {
                videoURL = await ContentService.shared.videoURL(forQuestionId: qid)
            }
        }
    }
}

/// Сводка результата: плашки «X/Y P%» (красная/зелёная) и «Общее время» — как в hw.html.
struct AttemptSummaryHeader: View {
    let correct: Int
    let total: Int
    let durationMs: Int?

    private var pct: Int {
        total > 0 ? Int((Double(correct) / Double(total) * 100).rounded()) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(correct)/\(total) \(pct)%")
                .font(.body.weight(.medium))
                .foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(pct >= 50 ? Theme.successBg : Theme.dangerBg)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            if let durationMs {
                Text("Общее время: \(Fmt.duration(ms: durationMs))")
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Theme.successBg.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            }
        }
    }
}
