import SwiftUI

/// Фокус-режим карточки (P6-3a, порт веб-рисовалки): задача по центру
/// на белом полотне, рисовалка активна поверх — для разбора у доски.
struct FocusCardView: View {
    let question: RunQuestion
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()   // белое полотно, как на вебе

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    MathTextView(text: question.stem)
                    FigureView(figure: question.figure, maxHeight: 320)
                }
                .padding(20)
                .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .environment(\.colorScheme, .light)   // полотно всегда светлое
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color(hex: 0x6B7280))
                    .background(Circle().fill(.white))
            }
            .padding(.top, 8)
            .padding(.trailing, 16)
        }
        .drawOverlay(startActive: true)
    }
}
