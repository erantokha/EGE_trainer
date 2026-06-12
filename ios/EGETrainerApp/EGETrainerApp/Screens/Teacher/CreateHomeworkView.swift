import SwiftUI

/// Создание ДЗ (tasks/hw_create.html): выбор ученика (любой из списка или
/// «Не назначать» — P5-5в), название/описание/перемешивание, сворачиваемый
/// предпросмотр добавленных задач (P5-5б), создание + ссылка.
/// Добавление задач с этого экрана убрано (P5-5а, решение оператора) —
/// состав набирается на главной.
struct CreateHomeworkView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    let student: StudentListItem?   // P6-5: nil — без назначения
    let selection: [String: Int]   // topicId -> кол-во задач
    var sectionSelection: [String: Int] = [:]
    var protoSelection: [String: ProtoPick] = [:]
    /// Готовые refs из предпросмотра (teacher_picked_refs веба) — без пере-resolve.
    var prePicked: [QuestionRef]? = nil

    @State private var title = ""
    @State private var descriptionText = ""
    @State private var shuffle = false
    @State private var assignedStudent: StudentListItem?
    @State private var allStudents: [StudentListItem] = []
    @State private var questions: [RunQuestion] = []
    @State private var showTasks = false   // P5-5б: предпросмотр по умолчанию свёрнут
    @State private var isResolving = true
    @State private var isCreating = false
    @State private var errorMessage: String?
    @State private var created: TeacherService.CreatedHomework?
    @State private var copied = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if let created {
                    successBlock(created)
                } else {
                    formBlock
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Создание ДЗ")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Закрыть") { dismiss() }
            }
        }
        .task {
            if title.isEmpty { title = defaultTitle() }
            if assignedStudent == nil { assignedStudent = student }
            if allStudents.isEmpty {
                allStudents = (try? await app.teacher.listMyStudents())
                    ?? (student.map { [$0] } ?? [])
            }
            if questions.isEmpty { await resolve() }
        }
    }

    // MARK: - Форма

    @ViewBuilder
    private var formBlock: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Кому")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textDim)

                // P5-5в: выбор любого ученика или «Не назначать» (как #assignStudent)
                Menu {
                    ForEach(allStudents) { s in
                        Button {
                            assignedStudent = s
                        } label: {
                            if s.id == assignedStudent?.id {
                                Label(s.displayName, systemImage: "checkmark")
                            } else {
                                Text(s.displayName)
                            }
                        }
                    }
                    Divider()
                    Button("Не назначать") { assignedStudent = nil }
                } label: {
                    HStack {
                        Circle()
                            .fill(Theme.accentLight)
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: assignedStudent == nil ? "person.slash" : "person")
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.accent)
                            )
                        VStack(alignment: .leading, spacing: 1) {
                            Text(assignedStudent?.displayName ?? "Не назначать")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.text)
                            if let email = assignedStudent?.email {
                                Text(email).font(.caption).foregroundStyle(Theme.textDim)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption)
                            .foregroundStyle(Theme.textDim)
                    }
                    .padding(8)
                    .background(Theme.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                }
                .buttonStyle(.plain)

                if assignedStudent == nil {
                    Text("ДЗ будет создано без назначения — отправьте ученику ссылку.")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }

                Text("Название")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textDim)
                    .padding(.top, 4)
                TextField("Название ДЗ", text: $title)
                    .textFieldStyle(AuthFieldStyle())

                Text("Описание (необязательно)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textDim)
                    .padding(.top, 4)
                TextField("Комментарий для ученика", text: $descriptionText, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(AuthFieldStyle())

                Toggle(isOn: $shuffle) {
                    Text("Перемешать задачи")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                }
                .toggleStyle(SwitchToggleStyle(tint: Theme.accent))
            }
        }

        // P5-5б: «Добавленные задачи (N)» — кликабельно, по умолчанию свёрнуто
        Button {
            withAnimation { showTasks.toggle() }
        } label: {
            HStack {
                Text("Добавленные задачи: \(questions.count)")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                if isResolving { ProgressView().padding(.leading, 4) }
                Spacer()
                Image(systemName: showTasks ? "chevron.up" : "chevron.down")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
            .padding(14)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusMd)
                    .stroke(Theme.borderLight, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isResolving)

        if !isResolving && questions.isEmpty {
            Text("Не удалось подобрать задачи. Вернитесь и выберите другие темы.")
                .font(.subheadline)
                .foregroundStyle(Theme.danger)
        }

        if showTasks {
            ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                PreviewQuestionCard(
                    index: idx,
                    question: q,
                    answerStyle: false,
                    onDelete: { questions.removeAll { $0.id == q.id } }
                )
            }
        }

        if let errorMessage {
            ErrorStateView(message: errorMessage)
        }

        Button {
            Task { await create() }
        } label: {
            if isCreating {
                ProgressView().tint(.white)
            } else {
                Text(assignedStudent == nil ? "Создать ДЗ" : "Создать и назначить")
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(isCreating || isResolving || questions.isEmpty || title.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    // MARK: - Success

    private func successBlock(_ hw: TeacherService.CreatedHomework) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.success)
                        Text(assignedStudent.map { "ДЗ создано и назначено ученику \($0.displayName)" }
                             ?? "ДЗ создано без назначения")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.text)
                    }
                    Text(assignedStudent != nil
                         ? "Задание уже появилось у ученика в «Мои ДЗ». Можно дополнительно отправить прямую ссылку:"
                         : "Отправьте ученику прямую ссылку на задание:")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                    Text(hw.url.absoluteString)
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.accent)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface2)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                    HStack(spacing: 10) {
                        Button(copied ? "Скопировано ✓" : "Скопировать ссылку") {
                            copyLink(hw.url.absoluteString)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        ShareLink(item: hw.url) {
                            Label("Поделиться", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
            Button("Готово") { dismiss() }
                .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func copyLink(_ text: String) {
        #if os(iOS)
        UIPasteboard.general.string = text
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
        copied = true
    }

    // MARK: - Данные

    private func defaultTitle() -> String {
        let f = DateFormatter()
        f.dateFormat = "dd.MM"
        return "ДЗ \(f.string(from: Date()))"
    }

    private func resolve() async {
        isResolving = true
        errorMessage = nil
        do {
            let refs: [QuestionRef]
            if let prePicked {
                // Готовая подборка из предпросмотра/фоновой сборки — без пере-resolve
                refs = prePicked
            } else {
                var requests: [(kind: String, id: String, n: Int)] = []
                for (baseId, pick) in protoSelection.sorted(by: { $0.key < $1.key }) {
                    requests.append(("proto", baseId, pick.count))
                }
                for (topicId, n) in selection.sorted(by: { $0.key < $1.key }) where n > 0 {
                    requests.append(("topic", topicId, n))
                }
                for (sectionId, n) in sectionSelection.sorted(by: { $0.key < $1.key }) where n > 0 {
                    requests.append(("section", sectionId, n))
                }
                guard let student else {
                    errorMessage = "Подборка не передана. Вернитесь на главную."
                    isResolving = false
                    return
                }
                let picked = try await app.teacher.resolvePickedWithTopUp(
                    studentId: student.studentId,
                    requests: requests,
                    filterId: nil
                )
                refs = picked.map { QuestionRef(topicId: $0.topicId ?? "", questionId: $0.questionId) }
            }
            questions = try await app.content.buildQuestions(refs: refs)
        } catch {
            errorMessage = error.localizedDescription
        }
        isResolving = false
    }

    private func create() async {
        isCreating = true
        errorMessage = nil
        defer { isCreating = false }
        let refs = questions.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) }
        do {
            created = try await app.teacher.createHomework(
                title: title,
                description: descriptionText.trimmingCharacters(in: .whitespacesAndNewlines),
                shuffle: shuffle,
                questions: refs,
                assignToStudentId: assignedStudent?.studentId
            )
        } catch {
            errorMessage = "Не удалось создать ДЗ: \(error.localizedDescription)"
        }
    }
}
