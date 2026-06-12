import SwiftUI

/// «Мои ученики» — повторяет tasks/my_students.html:
/// приглашение по email (consent), pending-запросы с отменой, карточки учеников с метриками.
struct MyStudentsView: View {
    @EnvironmentObject private var app: AppState

    @State private var students: [StudentListItem] = []
    @State private var summaries: [String: StudentSummary] = [:]
    @State private var pending: [OutgoingStudentRequest] = []
    @State private var inviteEmail = ""
    @State private var inviteMessage: (text: String, isError: Bool)?
    @State private var isLoading = true
    @State private var isInviting = false
    @State private var errorMessage: String?
    @State private var removeTarget: StudentListItem?

    // Поиск/фильтры — паритет #searchStudents/#filterProblems/#summaryDays/#summarySource
    @State private var searchQuery = ""
    @State private var problemsOnly = false
    @State private var summaryDays = 30
    @State private var summarySource = "all"

    /// Поиск по ФИО/email + сортировка «проблемные первыми» (my_students.js).
    private var visibleStudents: [StudentListItem] {
        var list = students
        let q = searchQuery.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            list = list.filter {
                $0.displayName.lowercased().contains(q)
                    || ($0.email?.lowercased().contains(q) ?? false)
            }
        }
        guard problemsOnly else { return list }
        func formPct(_ s: StudentSummary?) -> Double {
            guard let t = s?.last10Total, t > 0 else { return 0 }
            return Double(s?.last10Correct ?? 0) / Double(t) * 100
        }
        return list.sorted { a, b in
            let sa = summaries[a.studentId], sb = summaries[b.studentId]
            let fa = formPct(sa), fb = formPct(sb)
            if fa != fb { return fa < fb }
            let aa = sa?.activityTotal ?? 0, ab = sb?.activityTotal ?? 0
            if aa != ab { return aa < ab }
            return a.displayName.localizedCompare(b.displayName) == .orderedAscending
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text("Мои ученики")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                inviteCard

                if !pending.isEmpty {
                    pendingCard
                }

                if isLoading {
                    LoadingStateView(text: "Загружаем учеников...")
                } else if let errorMessage {
                    ErrorStateView(message: errorMessage) { await load() }
                } else if students.isEmpty {
                    EmptyStateView(
                        icon: "person.2",
                        title: "Пока нет подтверждённых учеников",
                        subtitle: "Отправьте приглашение по email — ученик подтвердит его в своём профиле."
                    )
                } else {
                    controlsRow

                    ForEach(visibleStudents) { s in
                        NavigationLink {
                            StudentCardView(student: s)
                        } label: {
                            studentCard(s)
                        }
                        .buttonStyle(.plain)
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
        .confirmationDialog(
            "Отвязать ученика \(removeTarget?.displayName ?? "")? Вы потеряете доступ к его статистике.",
            isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Отвязать", role: .destructive) {
                if let s = removeTarget {
                    Task { await remove(s) }
                }
            }
            Button("Отмена", role: .cancel) {}
        }
    }

    // MARK: - Приглашение

    private var inviteCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Пригласить ученика")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text("Ученик получит запрос и должен подтвердить его в своём профиле — только после этого вы увидите его статистику.")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
                HStack(spacing: 8) {
                    TextField("email ученика", text: $inviteEmail)
                        .textFieldStyle(AuthFieldStyle())
                        .textContentType(.emailAddress)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        #endif
                    Button {
                        Task { await invite() }
                    } label: {
                        if isInviting { ProgressView().tint(.white) } else { Text("Пригласить") }
                    }
                    .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                    .disabled(isInviting || inviteEmail.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if let msg = inviteMessage {
                    Text(msg.text)
                        .font(.subheadline)
                        .foregroundStyle(msg.isError ? Theme.danger : Theme.success)
                }
            }
        }
    }

    // MARK: - Поиск и фильтры

    private var controlsRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.textDim)
                TextField("Поиск по имени или email", text: $searchQuery)
                    .autocorrectionDisabled()
            }
            .padding(10)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusSm)
                    .stroke(Theme.border, lineWidth: 1)
            )

            HStack(spacing: 10) {
                Toggle(isOn: $problemsOnly) {
                    Text("Проблемные")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }
                .toggleStyle(SwitchToggleStyle(tint: Theme.accent))
                .fixedSize()
                Spacer()
                Picker("Период", selection: $summaryDays) {
                    Text("7 дн").tag(7)
                    Text("14 дн").tag(14)
                    Text("30 дн").tag(30)
                    Text("90 дн").tag(90)
                }
                .pickerStyle(.menu)
                .tint(Theme.accent)
                Picker("Источник", selection: $summarySource) {
                    Text("Всё").tag("all")
                    Text("ДЗ").tag("hw")
                    Text("Тест").tag("test")
                }
                .pickerStyle(.menu)
                .tint(Theme.accent)
            }
            .onChange(of: summaryDays) { _, _ in Task { await loadSummaries() } }
            .onChange(of: summarySource) { _, _ in Task { await loadSummaries() } }
        }
    }

    // MARK: - Pending

    private var pendingCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ожидают подтверждения")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                ForEach(pending) { req in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(req.studentEmail ?? "—")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.text)
                            Text("Отправлено: \(Fmt.dateTime(req.createdAt))")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                        }
                        Spacer()
                        StatusBadge(text: "ожидает", style: .warning)
                        Button("Отменить") {
                            Task { await cancel(req) }
                        }
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Theme.danger)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    // MARK: - Карточка ученика

    private func studentCard(_ s: StudentListItem) -> some View {
        let summary = summaries[s.studentId]
        return Card(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.displayName)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.text)
                        HStack(spacing: 6) {
                            if let grade = s.studentGrade {
                                Text("\(grade) класс")
                            }
                            if let email = s.email {
                                Text(email)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                    Menu {
                        Button("Отвязать ученика", role: .destructive) { removeTarget = s }
                    } label: {
                        Image(systemName: "ellipsis")
                            .foregroundStyle(Theme.textDim)
                            .frame(width: 32, height: 32)
                    }
                }
                if let summary {
                    HStack(spacing: 14) {
                        metric("Активность", "\(summary.activityTotal ?? 0)")
                        metric("Последние 10", last10Text(summary))
                        metric("Покрытие", "\(summary.coveredTopicsAllTime ?? 0) подтем")
                    }
                    if let seen = summary.lastSeenAt {
                        Text("Был(а): \(Fmt.dateTime(seen))")
                            .font(.caption2)
                            .foregroundStyle(Theme.textDim)
                    }
                }
            }
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.textDim)
            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.text)
        }
    }

    private func last10Text(_ s: StudentSummary) -> String {
        guard let total = s.last10Total, total > 0 else { return "—" }
        return "\(s.last10Correct ?? 0)/\(total)"
    }

    // MARK: - Данные

    /// Перезагрузка только сводок при смене периода/источника.
    private func loadSummaries() async {
        if let rows = try? await app.teacher.studentsSummary(days: summaryDays, source: summarySource) {
            summaries = Dictionary(rows.map { ($0.studentId, $0) }, uniquingKeysWith: { a, _ in a })
        }
    }

    private func load() async {
        isLoading = students.isEmpty
        errorMessage = nil
        do {
            async let listTask = app.teacher.listMyStudents()
            async let summaryTask = app.teacher.studentsSummary(days: summaryDays, source: summarySource)
            async let pendingTask = app.teacher.outgoingRequests()
            students = try await listTask
            summaries = Dictionary(
                (try? await summaryTask)?.map { ($0.studentId, $0) } ?? [],
                uniquingKeysWith: { a, _ in a }
            )
            pending = (try? await pendingTask)?.filter { ($0.status ?? "pending") == "pending" } ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func invite() async {
        inviteMessage = nil
        isInviting = true
        defer { isInviting = false }
        let email = inviteEmail.trimmingCharacters(in: .whitespaces)
        do {
            try await app.teacher.inviteStudent(email: email)
            inviteMessage = ("Запрос отправлен на \(email). Ученик должен подтвердить его в профиле.", false)
            inviteEmail = ""
            await load()
        } catch {
            inviteMessage = (humanInviteError(error), true)
        }
    }

    private func humanInviteError(_ error: Error) -> String {
        let raw = (error as? SupabaseError).map { String(describing: $0) } ?? error.localizedDescription
        if raw.contains("ALREADY_LINKED") { return "Этот ученик уже привязан к вам." }
        if raw.contains("ALREADY_PENDING") { return "Запрос этому ученику уже отправлен и ждёт подтверждения." }
        if raw.contains("NOT_FOUND") || raw.contains("USER_NOT_FOUND") {
            return "Пользователь с таким email не найден. Попросите ученика сначала зарегистрироваться."
        }
        if raw.contains("SELF") { return "Нельзя пригласить самого себя." }
        return error.localizedDescription
    }

    private func cancel(_ req: OutgoingStudentRequest) async {
        do {
            try await app.teacher.cancelRequest(requestId: req.requestId)
            await load()
        } catch {
            inviteMessage = (error.localizedDescription, true)
        }
    }

    private func remove(_ s: StudentListItem) async {
        do {
            try await app.teacher.removeStudent(studentId: s.studentId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
