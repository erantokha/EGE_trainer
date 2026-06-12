import SwiftUI

/// Предпросмотр «Добавленные задачи» (#addedTasksModal) и режим «Начать»
/// (просмотр подборки листом): условия, ответы, shortage-подсказка
/// «подобрано X из Y», удаление задач, share session-ссылки (WS.1),
/// переход в создание ДЗ из этой же подборки.
struct AddedTasksPreviewSheet: View {
    let student: StudentListItem?   // P6-5: nil — каталожный режим
    let requests: [(kind: String, id: String, n: Int)]
    let filterId: String?
    var shuffle = false
    /// P4-1: готовая подборка из фоновой сборки — открытие мгновенное, без resolve.
    var preAssembled: [RunQuestion]? = nil
    var onCreateHW: ([QuestionRef]) -> Void

    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var questions: [RunQuestion] = []
    @State private var requestedTotal = 0
    @State private var shortageInfo: String?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var shareURL: URL?
    @State private var isSharing = false

    /// Название активного фильтра (для честного объяснения нехватки).
    private var filterTitle: String? {
        switch filterId {
        case "unseen_low": return "Нерешённое"
        case "stale": return "Давно не решал"
        case "unstable": return "Нестабильно"
        case "weak_spots": return "Слабые места"
        default: return nil
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                // LazyVStack: формулы (WKWebView+MathJax) парсятся только у видимых карточек
                LazyVStack(alignment: .leading, spacing: 12) {
                    if isLoading {
                        LoadingStateView(text: "Подбираем задачи...")
                    } else if let errorMessage {
                        ErrorStateView(message: errorMessage) { await resolve() }
                    } else {
                        header

                        ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                            PreviewQuestionCard(
                                index: idx,
                                question: q,
                                answerStyle: false,   // ответы всегда скрываемые (P5-3: «Начать» — отдельный экран)
                                onDelete: { questions.removeAll { $0.id == q.id } }
                            )
                        }

                        if !questions.isEmpty {
                            actions
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.bg)
            .navigationTitle("Добавленные задачи")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                #if os(iOS)
                ToolbarItem(placement: .primaryAction) {
                    PDFExportButton(questions: questions, defaultTitle: "Подборка задач",
                                    answersDefault: true)
                }
                #endif
            }
            .task { await resolve() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text("Показано: \(questions.count) из \(requestedTotal)")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.textDim)
                if let filterTitle {
                    Text("фильтр: \(filterTitle)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Theme.accent)
                        .padding(.vertical, 2)
                        .padding(.horizontal, 8)
                        .background(Theme.accentLight)
                        .clipShape(Capsule())
                }
            }
            if let shortageInfo {
                Text(shortageInfo)
                    .font(.caption)
                    .foregroundStyle(Theme.warnText)
                    .padding(8)
                    .background(Theme.warnBg)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
            }
        }
    }


    private var actions: some View {
        VStack(spacing: 10) {
            if let shareURL {
                ShareLink(item: shareURL) {
                    Label("Поделиться ссылкой на подборку", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
            } else {
                Button {
                    Task { await makeSessionLink() }
                } label: {
                    if isSharing {
                        ProgressView()
                    } else {
                        Label("Создать ссылку на подборку", systemImage: "link")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isSharing)
            }

            Button("Создать ДЗ из этой подборки") {
                onCreateHW(questions.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) })
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(.top, 6)
    }

    private func resolve() async {
        requestedTotal = requests.reduce(0) { $0 + $1.n }

        // P4-1: подборка уже собрана фоном — показываем мгновенно
        if let preAssembled {
            questions = preAssembled
            applyShortage()
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil
        guard let student else {
            errorMessage = "Подборка ещё собирается — попробуйте ещё раз."
            isLoading = false
            return
        }
        do {
            let picked = try await app.teacher.resolvePickedWithTopUp(
                studentId: student.studentId,
                requests: requests,
                filterId: filterId
            )
            let refs = picked.map {
                QuestionRef(topicId: $0.topicId ?? "", questionId: $0.questionId)
            }
            questions = try await app.content.buildQuestions(refs: refs)
            applyShortage()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Shortage только при физической нехватке банка (после добора P4-4).
    private func applyShortage() {
        if questions.count < requestedTotal {
            let missing = requestedTotal - questions.count
            shortageInfo = "Доступно \(questions.count) из \(requestedTotal): в выбранных темах больше нет уникальных задач (не хватило \(missing))."
        } else {
            shortageInfo = nil
        }
    }

    /// Session-ссылка на подборку (list-режим — как «Начать» веба).
    private func makeSessionLink() async {
        isSharing = true
        defer { isSharing = false }
        let refs = questions.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) }
        if let link = try? await app.teacher.createSessionLink(
            mode: "list", shuffle: shuffle, frozenQuestions: refs
        ) {
            shareURL = link.url
        }
    }
}

/// Поиск-автодополнение ученика — эквивалент комбобокса #studentComboInput.
struct StudentSearchPicker: View {
    let students: [StudentListItem]
    var onSelect: (StudentListItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""

    /// Сортировка совпадений: префикс первого слова > префикс других слов >
    /// вхождение (как в home_teacher.html).
    private var filtered: [StudentListItem] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return students }
        func rank(_ s: StudentListItem) -> Int? {
            let name = s.displayName.lowercased()
            let words = name.split(separator: " ").map(String.init)
            if let first = words.first, first.hasPrefix(q) { return 0 }
            if words.dropFirst().contains(where: { $0.hasPrefix(q) }) { return 1 }
            if name.contains(q) { return 2 }
            if let email = s.email?.lowercased(), email.contains(q) { return 3 }
            return nil
        }
        return students
            .compactMap { s in rank(s).map { (s, $0) } }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    var body: some View {
        NavigationStack {
            List(filtered) { s in
                Button {
                    onSelect(s)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.displayName)
                            .foregroundStyle(Theme.text)
                        if let email = s.email {
                            Text(email).font(.caption).foregroundStyle(Theme.textDim)
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Поиск по имени или email")
            .navigationTitle("Выбор ученика")
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
