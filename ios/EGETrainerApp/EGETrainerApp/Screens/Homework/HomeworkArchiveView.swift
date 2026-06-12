import SwiftUI

/// Архив ДЗ — повторяет tasks/my_homeworks_archive.html: пагинация по 50,
/// карточки «Назначено/Сдано», открытие ДЗ по токену. Первые 10 живут
/// на экране «Мои ДЗ», поэтому архив начинается с offset = 10 (как на вебе).
struct HomeworkArchiveView: View {
    @EnvironmentObject private var app: AppState

    @State private var items: [HomeworkArchiveItem] = []
    @State private var offset = 10
    @State private var hasMore = true
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let pageSize = 50

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text("Архив работ")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                if let errorMessage {
                    ErrorStateView(message: errorMessage) { await loadMore() }
                } else if items.isEmpty && !isLoading && !hasMore {
                    EmptyStateView(
                        icon: "archivebox",
                        title: "Архив пока пуст",
                        subtitle: "Старые домашние задания будут появляться здесь."
                    )
                }

                ForEach(items) { item in
                    if let token = item.token {
                        NavigationLink {
                            HomeworkRunView(token: token)
                        } label: {
                            archiveCard(item)
                        }
                        .buttonStyle(.plain)
                    } else {
                        archiveCard(item)
                    }
                }

                if isLoading {
                    LoadingStateView(text: "Загружаем...")
                } else if hasMore {
                    Button {
                        Task { await loadMore() }
                    } label: {
                        Text("Загрузить ещё")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Архив работ")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            if items.isEmpty { await loadMore() }
        }
    }

    private func archiveCard(_ item: HomeworkArchiveItem) -> some View {
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
                let assigned = item.assignedAt.map { "Назначено: \(Fmt.dateTime($0))" }
                let submitted = item.submittedAt.map { "Сдано: \(Fmt.dateTime($0))" }
                Text([assigned, submitted].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
        }
    }

    private func cardTitle(_ item: HomeworkArchiveItem) -> String {
        if item.isSubmitted, let c = item.correct, let t = item.total {
            return "\(item.displayTitle) — верно \(c) из \(t)"
        }
        return item.displayTitle
    }

    private func loadMore() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            let page = try await app.homework.archive(offset: offset, limit: pageSize)
            items.append(contentsOf: page)
            offset += page.count
            hasMore = page.count >= pageSize
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
