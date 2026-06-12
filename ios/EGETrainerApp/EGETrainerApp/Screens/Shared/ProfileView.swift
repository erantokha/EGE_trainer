import SwiftUI

/// Профиль — повторяет tasks/profile.html: данные пользователя, для ученика —
/// входящие запросы преподавателей (consent) и «Мои преподаватели», выход.
struct ProfileView: View {
    @EnvironmentObject private var app: AppState

    @State private var incoming: [IncomingTeacherRequest] = []
    @State private var teachers: [MyTeacher] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var revokeTarget: MyTeacher?

    // Редактирование профиля (паритет tasks/profile.js editMode)
    @State private var isEditing = false
    @State private var editFirstName = ""
    @State private var editLastName = ""
    @State private var editGrade: Int? = nil
    @State private var editTeacherType: String? = nil
    @State private var isSaving = false

    // Удаление аккаунта (двойное подтверждение)
    @State private var showDeleteConfirm = false
    @State private var deleteConfirmText = ""
    @State private var isDeleting = false

    private var isStudent: Bool { app.profile?.isTeacher != true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text("Профиль")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                profileCard

                if isStudent {
                    if !incoming.isEmpty {
                        incomingCard
                    }
                    teachersCard
                }

                if let actionError {
                    Text(actionError)
                        .font(.subheadline)
                        .foregroundStyle(Theme.danger)
                        .padding(10)
                        .background(Theme.dangerBg)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                }

                Button("Выйти из аккаунта") {
                    Task { await app.signOut() }
                }
                .buttonStyle(SecondaryButtonStyle())
                .foregroundStyle(Theme.danger)

                Button {
                    showDeleteConfirm = true
                } label: {
                    Text("Удалить профиль")
                        .font(.caption)
                        .foregroundStyle(Theme.danger)
                }
                .buttonStyle(.plain)

                Text("Смена пароля — через «Сброс пароля» на экране входа.")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("")
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .task { if isStudent { await load() } }
        .refreshable { if isStudent { await load() } }
        .confirmationDialog(
            "Отключить доступ преподавателя \(revokeTarget?.displayName ?? "")? Он больше не увидит вашу статистику и не сможет назначать ДЗ.",
            isPresented: Binding(get: { revokeTarget != nil }, set: { if !$0 { revokeTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Отключить доступ", role: .destructive) {
                if let t = revokeTarget {
                    Task { await revoke(t) }
                }
            }
            Button("Отмена", role: .cancel) {}
        }
    }

    private var profileCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(Theme.accentLight)
                        .frame(width: 52, height: 52)
                        .overlay(
                            Text(String(app.profile?.displayName.prefix(1) ?? "?"))
                                .font(.title3.weight(.bold))
                                .foregroundStyle(Theme.accent)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.profile?.displayName ?? "—")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.text)
                        Text(app.profile?.email ?? "")
                            .font(.caption)
                            .foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                    if !isEditing {
                        Button("Изменить") { startEditing() }
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Theme.accent)
                    }
                }
                Divider()
                if isEditing {
                    editForm
                } else {
                    HStack {
                        Text("Роль").foregroundStyle(Theme.textDim)
                        Spacer()
                        Text(app.profile?.isTeacher == true ? "Учитель" : "Ученик")
                            .fontWeight(.medium)
                            .foregroundStyle(Theme.text)
                    }
                    .font(.subheadline)
                    if let grade = app.profile?.studentGrade {
                        HStack {
                            Text("Класс").foregroundStyle(Theme.textDim)
                            Spacer()
                            Text("\(grade)").fontWeight(.medium).foregroundStyle(Theme.text)
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
        .confirmationDialog(
            "Удалить профиль безвозвратно? Будут удалены попытки, связи с преподавателями и сам аккаунт.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Да, удалить аккаунт", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Отмена", role: .cancel) {}
        }
    }

    /// Форма редактирования — поля и контракт как tasks/profile.js (update_my_profile).
    private var editForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Фамилия").font(.caption).foregroundStyle(Theme.textDim)
                TextField("Фамилия", text: $editLastName)
                    .textFieldStyle(AuthFieldStyle())
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Имя").font(.caption).foregroundStyle(Theme.textDim)
                TextField("Имя", text: $editFirstName)
                    .textFieldStyle(AuthFieldStyle())
            }
            if isStudent {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Класс").font(.caption).foregroundStyle(Theme.textDim)
                    Picker("Класс", selection: $editGrade) {
                        Text("Не указан").tag(Int?.none)
                        ForEach(5...11, id: \.self) { g in
                            Text("\(g)").tag(Int?.some(g))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.text)
                }
            }
            HStack(spacing: 10) {
                Button {
                    Task { await saveProfile() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Сохранить") }
                }
                .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                .disabled(isSaving)
                Button("Отмена") { isEditing = false }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(isSaving)
            }
        }
    }

    private func startEditing() {
        editFirstName = app.profile?.firstName ?? ""
        editLastName = app.profile?.lastName ?? ""
        editGrade = app.profile?.studentGrade
        editTeacherType = app.profile?.teacherType
        isEditing = true
    }

    private func saveProfile() async {
        actionError = nil
        let first = editFirstName.trimmingCharacters(in: .whitespaces)
        let last = editLastName.trimmingCharacters(in: .whitespaces)
        guard !first.isEmpty, !last.isEmpty else {
            actionError = "Укажите фамилию и имя."
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            try await app.auth.updateMyProfile(
                firstName: first,
                lastName: last,
                role: app.profile?.isTeacher == true ? "teacher" : "student",
                teacherType: editTeacherType,
                studentGrade: editGrade
            )
            await app.reloadProfile()
            isEditing = false
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteAccount() async {
        actionError = nil
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await app.auth.deleteMyAccount()
            app.phase = .signedOut
        } catch {
            actionError = error.localizedDescription
        }
    }

    private var incomingCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Запросы от преподавателей")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text("Преподаватель получит доступ к вашей статистике и сможет назначать ДЗ только после вашего подтверждения.")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
                ForEach(incoming) { req in
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(req.teacherName ?? req.teacherEmail ?? "Преподаватель")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.text)
                            if let email = req.teacherEmail {
                                Text(email).font(.caption).foregroundStyle(Theme.textDim)
                            }
                        }
                        HStack(spacing: 10) {
                            Button("Принять") {
                                Task { await respond(req, accept: true) }
                            }
                            .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                            Button("Отклонить") {
                                Task { await respond(req, accept: false) }
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    .padding(10)
                    .background(Theme.accentLight.opacity(0.4))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                }
            }
        }
    }

    private var teachersCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Мои преподаватели")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                if isLoading && teachers.isEmpty {
                    LoadingStateView(text: "Загрузка...")
                } else if let errorMessage {
                    Text(errorMessage).font(.subheadline).foregroundStyle(Theme.danger)
                } else if teachers.isEmpty {
                    Text("Пока нет привязанных преподавателей.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                } else {
                    ForEach(teachers) { t in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.displayName)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Theme.text)
                                if let email = t.teacherEmail {
                                    Text(email).font(.caption).foregroundStyle(Theme.textDim)
                                }
                            }
                            Spacer()
                            Button("Отключить") { revokeTarget = t }
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Theme.danger)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let inc = app.student.incomingTeacherRequests()
            async let tch = app.student.myTeachers()
            incoming = try await inc.filter { ($0.status ?? "pending") == "pending" }
            teachers = try await tch
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func respond(_ req: IncomingTeacherRequest, accept: Bool) async {
        actionError = nil
        do {
            try await app.student.respondTeacherRequest(requestId: req.requestId, accept: accept)
            await load()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func revoke(_ teacher: MyTeacher) async {
        actionError = nil
        do {
            try await app.student.revokeTeacher(teacherId: teacher.teacherId)
            await load()
        } catch {
            actionError = error.localizedDescription
        }
    }
}
