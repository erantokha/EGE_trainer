import SwiftUI

/// Экран авторизации — паритет tasks/auth.html: вкладки «Вход / Регистрация /
/// Сброс пароля», Google-вход (PKCE), email/пароль, resend-письмо.
struct AuthView: View {
    enum Tab: String, CaseIterable {
        case login = "Вход"
        case signup = "Регистрация"
        case reset = "Сброс пароля"
    }

    @EnvironmentObject private var app: AppState
    @State private var tab: Tab = .login

    // Вход
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false

    // Регистрация (поля как в auth.html)
    @State private var signupRole = "student"
    @State private var signupLastName = ""
    @State private var signupFirstName = ""
    @State private var signupGrade: Int? = nil
    @State private var signupTeacherType: String? = nil
    @State private var signupEmail = ""
    @State private var signupPassword = ""
    @State private var showSignupPassword = false
    @State private var signupLetterSent = false

    // Сброс
    @State private var resetEmail = ""
    @State private var resetLetterSent = false

    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                BrandLogo()
                    .padding(.top, 48)

                Card(padding: 20) {
                    VStack(alignment: .leading, spacing: 16) {
                        tabs

                        switch tab {
                        case .login: loginForm
                        case .signup: signupForm
                        case .reset: resetForm
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .background(Theme.bg)
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            #if DEBUG
            // скриптовая приёмка: предвыбор вкладки (SIMCTL_CHILD_E2E_AUTH_TAB)
            switch ProcessInfo.processInfo.environment["E2E_AUTH_TAB"] {
            case "signup": tab = .signup
            case "reset": tab = .reset
            default: break
            }
            #endif
        }
    }

    // MARK: - Вкладки

    private var tabs: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button {
                    tab = t
                    errorMessage = nil
                    infoMessage = nil
                } label: {
                    Text(t.rawValue)
                        .font(.subheadline.weight(tab == t ? .semibold : .regular))
                        .foregroundStyle(tab == t ? Theme.accent : Theme.textDim)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(tab == t ? Theme.accentLight : .clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Вход

    private var loginForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("С возвращением")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text)
            Text("Войдите, чтобы продолжить подготовку к ЕГЭ.")
                .font(.subheadline)
                .foregroundStyle(Theme.textDim)

            googleButton

            divider

            labeledField("Email") {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(AuthFieldStyle())
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
            }

            labeledField("Пароль") {
                passwordField(text: $password, show: $showPassword)
            }

            Button {
                tab = .reset
                resetEmail = email
            } label: {
                Text("Забыли пароль?")
                    .font(.caption)
                    .foregroundStyle(Theme.accent)
            }
            .buttonStyle(.plain)

            statusViews

            Button {
                Task { await signIn() }
            } label: {
                if isLoading { ProgressView().tint(.white) } else { Text("Войти") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || email.isEmpty || password.isEmpty)
        }
    }

    // MARK: - Регистрация

    private var signupForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Регистрация")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text)

            VStack(alignment: .leading, spacing: 6) {
                Text("Кто вы?").font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
                Picker("Роль", selection: $signupRole) {
                    Text("Ученик").tag("student")
                    Text("Учитель").tag("teacher")
                }
                .pickerStyle(.segmented)
            }

            labeledField("Фамилия") {
                TextField("Иванов", text: $signupLastName)
                    .textFieldStyle(AuthFieldStyle())
                    .textContentType(.familyName)
            }
            labeledField("Имя") {
                TextField("Иван", text: $signupFirstName)
                    .textFieldStyle(AuthFieldStyle())
                    .textContentType(.givenName)
            }

            if signupRole == "student" {
                labeledField("Класс") {
                    Picker("Класс", selection: $signupGrade) {
                        Text("Выберите класс").tag(Int?.none)
                        ForEach(5...11, id: \.self) { g in
                            Text("\(g)").tag(Int?.some(g))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.text)
                }
            } else {
                labeledField("Тип преподавателя") {
                    Picker("Тип", selection: $signupTeacherType) {
                        Text("Выберите вариант").tag(String?.none)
                        Text("Школьный учитель").tag(String?.some("school"))
                        Text("Репетитор").tag(String?.some("tutor"))
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.text)
                }
            }

            labeledField("Email") {
                TextField("you@example.com", text: $signupEmail)
                    .textFieldStyle(AuthFieldStyle())
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
            }
            labeledField("Пароль (минимум 6 символов)") {
                passwordField(text: $signupPassword, show: $showSignupPassword, isNew: true)
            }

            statusViews

            Button {
                Task { await signUp() }
            } label: {
                if isLoading { ProgressView().tint(.white) } else { Text("Зарегистрироваться") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading)

            if signupLetterSent {
                Button {
                    Task { await resendSignup() }
                } label: {
                    Text("Отправить письмо ещё раз")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isLoading)
            }
        }
    }

    // MARK: - Сброс пароля

    private var resetForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Сброс пароля")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text)
            Text("Пришлём письмо со ссылкой для смены пароля. Смена пароля произойдёт на сайте, после этого войдите здесь с новым паролем.")
                .font(.subheadline)
                .foregroundStyle(Theme.textDim)

            labeledField("Email") {
                TextField("you@example.com", text: $resetEmail)
                    .textFieldStyle(AuthFieldStyle())
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
            }

            statusViews

            Button {
                Task { await sendReset() }
            } label: {
                if isLoading { ProgressView().tint(.white) } else { Text("Отправить письмо") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || resetEmail.isEmpty || resetLetterSent)
        }
    }

    // MARK: - Общие куски

    private var googleButton: some View {
        Button {
            Task { await signInWithGoogle() }
        } label: {
            HStack(spacing: 8) {
                Text("G").font(.headline.weight(.bold)).foregroundStyle(Theme.accent)
                Text("Продолжить с Google").foregroundStyle(Theme.text)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SecondaryButtonStyle())
        .disabled(isLoading)
    }

    private var divider: some View {
        HStack {
            Rectangle().fill(Theme.borderLight).frame(height: 1)
            Text("или по почте")
                .font(.caption)
                .foregroundStyle(Theme.textDim)
                .fixedSize()
            Rectangle().fill(Theme.borderLight).frame(height: 1)
        }
    }

    @ViewBuilder
    private var statusViews: some View {
        if let errorMessage {
            Text(errorMessage)
                .font(.subheadline)
                .foregroundStyle(Theme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Theme.dangerBg)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
        }
        if let infoMessage {
            Text(infoMessage)
                .font(.subheadline)
                .foregroundStyle(Theme.success)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Theme.successBg)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
        }
    }

    private func labeledField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(Theme.textDim)
            content()
        }
    }

    private func passwordField(text: Binding<String>, show: Binding<Bool>,
                               isNew: Bool = false) -> some View {
        HStack {
            Group {
                if show.wrappedValue {
                    TextField("••••••••", text: text)
                } else {
                    SecureField("••••••••", text: text)
                }
            }
            #if os(iOS)
            .textContentType(isNew ? .newPassword : .password)
            #endif
            Button {
                show.wrappedValue.toggle()
            } label: {
                Image(systemName: show.wrappedValue ? "eye.slash" : "eye")
                    .foregroundStyle(Theme.textDim)
            }
        }
        .padding(12)
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusSm)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Действия

    private func signIn() async {
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await app.signIn(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func signInWithGoogle() async {
        #if os(iOS)
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await app.signInWithGoogle()
        } catch SupabaseError.cancelled {
            // пользователь закрыл окно — не ошибка
        } catch {
            errorMessage = error.localizedDescription
        }
        #endif
    }

    /// Валидация — 1-в-1 с tasks/auth.js (тексты сообщений сохранены).
    private func signUp() async {
        errorMessage = nil
        infoMessage = nil
        let lastName = signupLastName.trimmingCharacters(in: .whitespaces)
        let firstName = signupFirstName.trimmingCharacters(in: .whitespaces)
        let mail = signupEmail.trimmingCharacters(in: .whitespaces)

        if lastName.isEmpty || firstName.isEmpty {
            errorMessage = "Укажите фамилию и имя."
            return
        }
        if mail.isEmpty || signupPassword.isEmpty {
            errorMessage = "Заполните email и пароль."
            return
        }
        if signupPassword.count < 6 {
            errorMessage = "Пароль слишком короткий (минимум 6 символов)."
            return
        }
        if signupRole == "teacher", signupTeacherType == nil {
            errorMessage = "Выберите: школьный учитель или репетитор."
            return
        }
        if signupRole == "student", signupGrade == nil {
            errorMessage = "Выберите класс."
            return
        }

        isLoading = true
        defer { isLoading = false }
        do {
            let hasSession = try await app.auth.signUp(
                email: mail,
                password: signupPassword,
                role: signupRole,
                firstName: firstName,
                lastName: lastName,
                teacherType: signupTeacherType,
                studentGrade: signupGrade
            )
            if hasSession {
                await app.reloadProfile()
            } else {
                infoMessage = "Письмо отправлено. Подтвердите почту по ссылке из письма, затем войдите."
                signupLetterSent = true
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resendSignup() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await app.auth.resendSignupEmail(email: signupEmail)
            infoMessage = "Письмо отправлено повторно."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func sendReset() async {
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await app.auth.sendPasswordReset(email: resetEmail)
            infoMessage = "Письмо отправлено. Откройте ссылку из письма, чтобы задать новый пароль."
            resetLetterSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct AuthFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(12)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusSm)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}
