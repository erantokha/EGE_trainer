import SwiftUI

/// Статистика ученика — повторяет tasks/stats.html:
/// период/источник, метрики (последние 10 / период / всё время), покрытие,
/// «Что тренировать сейчас», темы с подтемами.
struct StatsView: View {
    @EnvironmentObject private var app: AppState

    /// teacher scope: открыто учителем для конкретного ученика
    var studentId: String? = nil

    @State private var analytics: AnalyticsScreen?
    @State private var days = 30
    @State private var source = "all"
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var expandedSections: Set<String> = []

    private let dayOptions = [7, 14, 30, 90]
    private let sourceOptions: [(String, String)] = [("all", "всё"), ("hw", "ДЗ"), ("test", "тренировка")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if studentId == nil {
                    EyebrowText("Подготовка к ЕГЭ по профильной математике")
                    Text("Статистика")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Theme.text)
                }

                filtersRow

                if isLoading {
                    LoadingStateView(text: "Считаем статистику...")
                } else if let errorMessage {
                    ErrorStateView(message: errorMessage) { await load() }
                } else if let a = analytics {
                    content(a)
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle(studentId == nil ? "" : "Статистика ученика")
        #if os(iOS)
        .toolbar(studentId == nil ? .hidden : .visible, for: .navigationBar)
        #endif
        .task { if analytics == nil { await load() } }
        .refreshable { await load() }
    }

    private var filtersRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ПЕРИОД").font(.caption2.weight(.semibold)).foregroundStyle(Theme.textDim)
                Picker("Период", selection: $days) {
                    ForEach(dayOptions, id: \.self) { d in
                        Text("\(d) дней").tag(d)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.text)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("ИСТОЧНИК").font(.caption2.weight(.semibold)).foregroundStyle(Theme.textDim)
                Picker("Источник", selection: $source) {
                    ForEach(sourceOptions, id: \.0) { opt in
                        Text(opt.1).tag(opt.0)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.text)
            }
            Spacer()
        }
        .onChange(of: days) { Task { await load() } }
        .onChange(of: source) { Task { await load() } }
    }

    @ViewBuilder
    private func content(_ a: AnalyticsScreen) -> some View {
        let covered = (a.topics ?? []).filter { ($0.coverage?.unicsAttempted ?? 0) > 0 }.count
        let totalTopics = (a.topics ?? []).count

        Text("Изучено подтем: \(covered) из \(totalTopics)")
            .font(.subheadline)
            .foregroundStyle(Theme.textDim)

        if let last10 = a.overall?.last10 {
            MetricCard(
                title: "Последние 10",
                bigValue: "\(last10.pct ?? 0)%",
                caption: "Верно/всего: \(last10.ratioText)",
                valueStyle: (last10.pct ?? 0) >= 50 ? .success : .danger
            )
        }
        if let period = a.overall?.period {
            MetricCard(
                title: "\(days) дней",
                bigValue: "\(period.pct ?? 0)%",
                caption: "Верно/всего: \(period.ratioText)",
                valueStyle: (period.pct ?? 0) >= 50 ? .success : .danger
            )
        }
        if let allTime = a.overall?.allTime {
            MetricCard(
                title: "Всё время",
                bigValue: "\(allTime.pct ?? 0)%",
                caption: "Верно/всего: \(allTime.ratioText)",
                valueStyle: (allTime.pct ?? 0) >= 50 ? .success : .danger
            )
        }

        coverageCard(a)

        if let lastSeen = a.overall?.lastSeenAt {
            Text("Последняя активность: \(Fmt.dateTime(lastSeen))")
                .font(.caption)
                .foregroundStyle(Theme.textDim)
        }

        weakTopicsCard(a)
        topicsList(a)
    }

    private func coverageCard(_ a: AnalyticsScreen) -> some View {
        let attempted = (a.topics ?? []).compactMap { $0.coverage?.unicsAttempted }.reduce(0, +)
        let total = (a.topics ?? []).compactMap { $0.coverage?.unicsTotal }.reduce(0, +)
        return Card {
            VStack(alignment: .leading, spacing: 6) {
                Text("ПОКРЫТИЕ ТЕМ")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textDim)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(attempted)/\(total)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Text("типов задач")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                }
            }
        }
    }

    /// «Что тренировать сейчас» — слабые подтемы (performance_state == weak),
    /// приоритет: ниже точность периода -> выше в списке.
    private func weakTopicsCard(_ a: AnalyticsScreen) -> some View {
        let weak = (a.topics ?? [])
            .filter { $0.derived?.performanceState == "weak" }
            .sorted { ($0.subtopicLast3AvgPct ?? 0) < ($1.subtopicLast3AvgPct ?? 0) }
            .prefix(5)

        return Group {
            if !weak.isEmpty {
                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Что тренировать сейчас")
                            .font(.headline)
                            .foregroundStyle(Theme.text)
                        ForEach(Array(weak)) { topic in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("\(topic.topicId). \(topic.title ?? "")")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(Theme.text)
                                    if let cov = topic.coverage {
                                        Text("Охват \(cov.unicsAttempted ?? 0)/\(cov.unicsTotal ?? 0) типов, точность \(Int((topic.subtopicLast3AvgPct ?? 0).rounded()))%")
                                            .font(.caption)
                                            .foregroundStyle(Theme.textDim)
                                    }
                                }
                                Spacer()
                                StatusBadge(text: "Нужно подтянуть", style: .warning)
                            }
                            .padding(10)
                            .background(Theme.bg)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                        }
                    }
                }
            }
        }
    }

    private func topicsList(_ a: AnalyticsScreen) -> some View {
        let sections = a.sections ?? []
        let topics = a.topics ?? []
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Темы")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                ForEach(sections) { section in
                    // P6-2: собственная кнопка вместо DisclosureGroup —
                    // тап-зона на всю ширину строки
                    VStack(alignment: .leading, spacing: 0) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                if expandedSections.contains(section.sectionId) {
                                    expandedSections.remove(section.sectionId)
                                } else {
                                    expandedSections.insert(section.sectionId)
                                }
                            }
                        } label: {
                            HStack {
                                Text("\(section.sectionId). \(section.title ?? "")")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Theme.text)
                                Spacer()
                                if let pct = section.allTime?.pct {
                                    Text("\(pct)%")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Theme.text)
                                }
                                Image(systemName: expandedSections.contains(section.sectionId) ? "chevron.up" : "chevron.down")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.textDim)
                            }
                            .padding(.vertical, 4)
                            .frame(maxWidth: .infinity)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if expandedSections.contains(section.sectionId) {
                            VStack(spacing: 8) {
                                ForEach(topics.filter { $0.sectionId == section.sectionId }) { topic in
                                    HStack {
                                        Text("\(topic.topicId). \(topic.title ?? "")")
                                            .font(.caption)
                                            .foregroundStyle(Theme.text)
                                        Spacer()
                                        if let pct = topic.allTime?.pct {
                                            Text("\(pct)%")
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(pct >= 50 ? Theme.success : Theme.danger)
                                        } else {
                                            Text("—").font(.caption).foregroundStyle(Theme.textDim)
                                        }
                                    }
                                }
                            }
                            .padding(.top, 6)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = analytics == nil
        errorMessage = nil
        do {
            analytics = try await app.student.analytics(
                scope: studentId == nil ? "self" : "teacher",
                studentId: studentId,
                days: days,
                source: source
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
