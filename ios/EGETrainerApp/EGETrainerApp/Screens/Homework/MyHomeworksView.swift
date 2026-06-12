import SwiftUI

/// «Мои ДЗ» — повторяет tasks/my_homeworks.html: счётчики, карточки с бейджами.
struct MyHomeworksView: View {
    @EnvironmentObject private var app: AppState

    @State private var summary: HomeworkSummary?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text("Мои ДЗ")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                if let s = summary {
                    HStack(spacing: 16) {
                        Text("Несданные: \(s.pendingCount)")
                        Text("Всего: \(s.totalCount)")
                    }
                    .font(.subheadline)
                    .foregroundStyle(Theme.textDim)
                }

                if isLoading {
                    LoadingStateView(text: "Загружаем список ДЗ...")
                } else if let errorMessage {
                    ErrorStateView(message: errorMessage) { await load() }
                } else if let s = summary {
                    if s.items.isEmpty {
                        EmptyStateView(
                            icon: "tray",
                            title: "Пока нет домашних заданий",
                            subtitle: "Когда преподаватель назначит ДЗ, оно появится здесь."
                        )
                    } else {
                        ForEach(s.items) { item in
                            NavigationLink {
                                HomeworkRunView(token: item.token)
                            } label: {
                                homeworkCard(item)
                            }
                            .buttonStyle(.plain)
                        }
                        if s.archiveCount > 0 {
                            NavigationLink {
                                HomeworkArchiveView()
                            } label: {
                                HStack {
                                    Image(systemName: "archivebox")
                                    Text("Архив работ (\(s.archiveCount))")
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                }
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.accent)
                                .padding(14)
                                .background(Theme.panel)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.radiusMd)
                                        .stroke(Theme.borderLight, lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 4)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("")
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func homeworkCard(_ item: HomeworkListItem) -> some View {
        Card(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(cardTitle(item))
                        .font(.body.weight(.medium))
                        .foregroundStyle(Theme.text)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    StatusBadge(
                        text: item.isSubmitted ? "Сдано" : "Не сдано",
                        style: item.isSubmitted ? .success : .danger
                    )
                }
                Text(item.isSubmitted
                     ? Fmt.dateTime(item.submittedAt)
                     : "Назначено: \(Fmt.dateTime(item.assignedAt))")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
        }
    }

    private func cardTitle(_ item: HomeworkListItem) -> String {
        if item.isSubmitted, let c = item.correct, let t = item.total {
            return "\(item.displayTitle) — верно \(c) из \(t)"
        }
        return item.displayTitle
    }

    private func load() async {
        isLoading = summary == nil
        errorMessage = nil
        do {
            var s = try await app.homework.myHomeworksSummary()
            // Для сданных ДЗ счёт «верно N из M» добирается из последней попытки
            // (как в tasks/my_homeworks.js — summary этих полей не содержит).
            let hw = app.homework
            let enriched = await withTaskGroup(of: (String, Int?, Int?).self) { group in
                for item in s.items where item.isSubmitted && item.correct == nil {
                    group.addTask {
                        let attempt = try? await hw.attempt(byToken: item.token)
                        return (item.token, attempt?.correct, attempt?.total)
                    }
                }
                var byToken: [String: (Int?, Int?)] = [:]
                for await (token, c, t) in group { byToken[token] = (c, t) }
                return byToken
            }
            for i in s.items.indices {
                if let (c, t) = enriched[s.items[i].token] {
                    s.items[i].correct = c
                    s.items[i].total = t
                }
            }
            summary = s
            app.pendingHomeworksCount = s.pendingCount
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
