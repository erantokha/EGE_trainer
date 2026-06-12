import SwiftUI

/// Completion-шаг после Google-входа — паритет tasks/google_complete.html:
/// роль, ФИ, класс/тип преподавателя → update_my_profile.
struct CompleteProfileView: View {
    @EnvironmentObject private var app: AppState

    @State private var role = "student"
    @State private var lastName = ""
    @State private var firstName = ""
    @State private var grade: Int? = nil
    @State private var teacherType: String? = nil
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                BrandLogo()
                    .padding(.top, 48)

                Card(padding: 20) {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Завершите регистрацию")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(Theme.text)
                        Text("Расскажите о себе, чтобы настроить тренажёр.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textDim)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Кто вы?").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                            Picker("Роль", selection: $role) {
                                Text("Ученик").tag("student")
                                Text("Учитель").tag("teacher")
                            }
                            .pickerStyle(.segmented)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Фамилия").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                            TextField("Иванов", text: $lastName)
                                .textFieldStyle(AuthFieldStyle())
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Имя").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                            TextField("Иван", text: $firstName)
                                .textFieldStyle(AuthFieldStyle())
                        }

                        if role == "student" {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Класс").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                                Picker("Класс", selection: $grade) {
                                    Text("Выберите класс").tag(Int?.none)
                                    ForEach(5...11, id: \.self) { g in
                                        Text("\(g)").tag(Int?.some(g))
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(Theme.text)
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Тип преподавателя").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                                Picker("Тип", selection: $teacherType) {
                                    Text("Выберите вариант").tag(String?.none)
                                    Text("Школьный учитель").tag(String?.some("school"))
                                    Text("Репетитор").tag(String?.some("tutor"))
                                }
                                .pickerStyle(.menu)
                                .tint(Theme.text)
                            }
                        }

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.subheadline)
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Theme.dangerBg)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                        }

                        Button {
                            Task { await save() }
                        } label: {
                            if isLoading { ProgressView().tint(.white) } else { Text("Сохранить") }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isLoading)

                        Button {
                            Task { await app.signOut() }
                        } label: {
                            Text("Выйти")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .background(Theme.bg)
        .task {
            // Префилл из имеющегося профиля (как google_complete.js)
            if let p = app.profile {
                if p.role == "teacher" { role = "teacher" }
                firstName = p.firstName ?? ""
                lastName = p.lastName ?? ""
                grade = p.studentGrade
                teacherType = p.teacherType
            }
        }
    }

    /// Валидация — как google_complete.js.
    private func save() async {
        errorMessage = nil
        let first = firstName.trimmingCharacters(in: .whitespaces)
        let last = lastName.trimmingCharacters(in: .whitespaces)
        if first.isEmpty || last.isEmpty {
            errorMessage = "Укажите фамилию и имя."
            return
        }
        if role == "teacher", teacherType == nil {
            errorMessage = "Выберите: школьный учитель или репетитор."
            return
        }
        if role == "student", grade == nil {
            errorMessage = "Выберите класс."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await app.auth.updateMyProfile(
                firstName: first, lastName: last, role: role,
                teacherType: teacherType, studentGrade: grade
            )
            await app.reloadProfile()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
