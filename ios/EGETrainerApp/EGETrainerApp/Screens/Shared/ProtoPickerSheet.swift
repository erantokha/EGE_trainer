import SwiftUI

/// Модалка выбора прототипов внутри подтемы — порт #protoPickerModal веба:
/// карточки уникальных прототипов (превью условия), степперы с капом,
/// бейджи точности «последние 3» и давности. Работает для учителя
/// (proto_last3_for_teacher_v1) и для самого ученика (proto_last3_for_self_v1).
struct ProtoPickerSheet: View {
    let topicId: String
    let topicTitle: String
    /// nil — self-режим (ученик о себе)
    let studentId: String?
    @Binding var protoCounts: [String: ProtoPick]
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var app: AppState

    @State private var cards: [ContentService.ProtoCard] = []
    @State private var stats: [String: ProtoLast3Stat] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var selectedTotal: Int {
        cards.reduce(0) { $0 + (protoCounts[$1.id]?.count ?? 0) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if isLoading {
                        LoadingStateView(text: "Загружаем прототипы...")
                    } else if let errorMessage {
                        ErrorStateView(message: errorMessage) { await load() }
                    } else {
                        ForEach(cards) { card in
                            protoCard(card)
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.bg)
            .navigationTitle(topicTitle)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Text("Выбрано: \(selectedTotal)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .task { await load() }
        }
    }

    private func protoCard(_ card: ContentService.ProtoCard) -> some View {
        Card(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Text(card.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                    Spacer()
                    badges(for: card.id)
                }
                MathTextView(text: card.previewStem, fontSize: 15)
                FigureView(figure: card.previewFigure, maxHeight: 140)
                HStack {
                    Text("вариантов: \(card.cap)")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                    Spacer()
                    CountStepper(count: protoCounts[card.id]?.count ?? 0) { delta in
                        let cur = protoCounts[card.id]?.count ?? 0
                        let next = min(max(0, cur + delta), card.cap)
                        protoCounts[card.id] = next == 0
                            ? nil
                            : ProtoPick(topicId: card.topicId, count: next)
                    }
                }
            }
        }
    }

    /// Бейджи как WMB3/WMB5: точность последних 3 (цвет badgeClassByPct)
    /// и давность последней попытки (пороги badgeClassByLastAttemptAt).
    @ViewBuilder
    private func badges(for baseId: String) -> some View {
        let stat = stats[baseId]
        HStack(spacing: 6) {
            if let s = stat, let t = s.last3Total, t > 0 {
                let pct = Int((Double(s.last3Correct ?? 0) / Double(t) * 100).rounded())
                Text("\(s.last3Correct ?? 0)/\(t)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.vertical, 2)
                    .padding(.horizontal, 7)
                    .background(pctColor(pct))
                    .clipShape(Capsule())
            } else {
                Text("не решал")
                    .font(.caption2)
                    .foregroundStyle(Theme.textDim)
                    .padding(.vertical, 2)
                    .padding(.horizontal, 7)
                    .background(Theme.surface2)
                    .clipShape(Capsule())
            }
            if let last = stat?.lastAttemptAt, let badge = dateBadge(last) {
                Text(badge.text)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.vertical, 2)
                    .padding(.horizontal, 7)
                    .background(badge.color)
                    .clipShape(Capsule())
            }
        }
    }

    /// badgeClassByPct: ≥90 зелёный, ≥70 салатовый, ≥50 жёлтый, <50 красный.
    private func pctColor(_ pct: Int) -> Color {
        if pct >= 90 { return Theme.success }
        if pct >= 70 { return Color(hex: 0x84CC16) }
        if pct >= 50 { return Color(hex: 0xD97706) }
        return Theme.danger
    }

    /// badgeClassByLastAttemptAt: <7д зелёный, <14д салатовый, ≤30д жёлтый, старше — красный.
    private func dateBadge(_ isoDate: String) -> (text: String, color: Color)? {
        guard let date = Fmt.parseISO(isoDate) else { return nil }
        let days = Date().timeIntervalSince(date) / 86_400
        let color: Color
        if days < 7 { color = Theme.success }
        else if days < 14 { color = Color(hex: 0x84CC16) }
        else if days <= 30 { color = Color(hex: 0xD97706) }
        else { color = Theme.danger }
        let fmt = DateFormatter()
        fmt.dateFormat = "dd.MM.yy"
        return (fmt.string(from: date), color)
    }

    private func load() async {
        errorMessage = nil
        // Антифлеш (WFX1): если статистика прогрета — рендерим карточки сразу с бейджами
        if let warmed = await ProtoStatsCache.shared.get(scope: studentId ?? "self", topicId: topicId) {
            stats = warmed
        }
        do {
            guard let topic = try await app.content.topicEntry(id: topicId) else {
                errorMessage = "Тема не найдена в каталоге."
                isLoading = false
                return
            }
            cards = try await app.content.protoCards(topic: topic)
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return
        }
        isLoading = false
        if stats.isEmpty {
            stats = await ProtoStatsCache.shared.load(
                studentId: studentId, topicId: topicId,
                teacher: app.teacher, content: app.content
            )
        }
    }
}

/// Выбор прототипа: тема + количество (ключ — базовый id прототипа).
struct ProtoPick: Equatable {
    var topicId: String
    var count: Int
}
