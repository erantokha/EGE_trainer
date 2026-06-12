package ru.egetrainer.app.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.egetrainer.app.AppState
import ru.egetrainer.app.BrandLogo
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.core.services.SupabaseError

/**
 * Экран авторизации — порт AuthView.swift, паритет tasks/auth.html/auth.js:
 * вкладки «Вход / Регистрация / Сброс пароля», Google-вход (PKCE),
 * email/пароль, resend-письмо. Тексты ошибок и валидация 1-в-1.
 */
private enum class AuthTab(val title: String) {
    Login("Вход"), Signup("Регистрация"), Reset("Сброс пароля")
}

@Composable
fun AuthScreen(app: AppState, initialTab: String? = null) {
    var tab by rememberSaveable {
        mutableStateOf(
            when (initialTab) {
                "signup" -> AuthTab.Signup
                "reset" -> AuthTab.Reset
                else -> AuthTab.Login
            }
        )
    }

    // Вход
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    // Регистрация (поля как в auth.html)
    var signupRole by rememberSaveable { mutableStateOf("student") }
    var signupLastName by rememberSaveable { mutableStateOf("") }
    var signupFirstName by rememberSaveable { mutableStateOf("") }
    var signupGrade by rememberSaveable { mutableStateOf<Int?>(null) }
    var signupTeacherType by rememberSaveable { mutableStateOf<String?>(null) }
    var signupEmail by rememberSaveable { mutableStateOf("") }
    var signupPassword by rememberSaveable { mutableStateOf("") }
    var signupLetterSent by rememberSaveable { mutableStateOf(false) }

    // Сброс
    var resetEmail by rememberSaveable { mutableStateOf("") }
    var resetLetterSent by rememberSaveable { mutableStateOf(false) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var infoMessage by remember { mutableStateOf<String?>(null) }
    // Ошибка Google-колбэка приходит асинхронно через deep link (У5)
    val oauthError by app.oauthError.collectAsState()

    val scope = rememberCoroutineScope()
    val colors = EgeTheme.colors

    fun clearStatus() {
        errorMessage = null
        infoMessage = null
    }

    fun runAction(block: suspend () -> Unit) {
        clearStatus()
        isLoading = true
        scope.launch {
            try {
                block()
            } catch (e: SupabaseError.Cancelled) {
                // пользователь закрыл окно — не ошибка
            } catch (e: SupabaseError) {
                errorMessage = e.userMessage
            } catch (e: Exception) {
                errorMessage = e.message ?: "Что-то пошло не так. Попробуйте ещё раз."
            } finally {
                isLoading = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandLogo(Modifier.padding(top = 48.dp, bottom = 20.dp))

        EgeCard(modifier = Modifier.padding(horizontal = 16.dp), padding = 20.dp) {
            // Вкладки
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AuthTab.entries.forEach { t ->
                    val active = tab == t
                    Text(
                        t.title,
                        modifier = Modifier
                            .clip(RoundedCornerShape(EgeDims.radiusPill))
                            .background(if (active) colors.accentLight else colors.panel)
                            .clickable {
                                tab = t
                                clearStatus()
                            }
                            .padding(vertical = 8.dp, horizontal = 10.dp)
                            .testTag("authTab_${t.name.lowercase()}"),
                        color = if (active) colors.accent else colors.textDim,
                        fontSize = EgeDims.fsMd,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            when (tab) {
                AuthTab.Login -> LoginForm(
                    email = email, onEmail = { email = it },
                    password = password, onPassword = { password = it },
                    isLoading = isLoading,
                    errorMessage = errorMessage ?: oauthError,
                    infoMessage = infoMessage,
                    onForgot = {
                        tab = AuthTab.Reset
                        resetEmail = email
                        clearStatus()
                    },
                    onGoogle = { runAction { app.startGoogleSignIn() } },
                    onSubmit = { runAction { app.signIn(email, password) } },
                )
                AuthTab.Signup -> SignupForm(
                    role = signupRole, onRole = { signupRole = it },
                    lastName = signupLastName, onLastName = { signupLastName = it },
                    firstName = signupFirstName, onFirstName = { signupFirstName = it },
                    grade = signupGrade, onGrade = { signupGrade = it },
                    teacherType = signupTeacherType, onTeacherType = { signupTeacherType = it },
                    email = signupEmail, onEmail = { signupEmail = it },
                    password = signupPassword, onPassword = { signupPassword = it },
                    isLoading = isLoading,
                    letterSent = signupLetterSent,
                    errorMessage = errorMessage,
                    infoMessage = infoMessage,
                    onSubmit = submit@{
                        // Валидация — 1-в-1 с tasks/auth.js (тексты сохранены)
                        clearStatus()
                        val lastName = signupLastName.trim()
                        val firstName = signupFirstName.trim()
                        val mail = signupEmail.trim()
                        if (lastName.isEmpty() || firstName.isEmpty()) {
                            errorMessage = "Укажите фамилию и имя."
                            return@submit
                        }
                        if (mail.isEmpty() || signupPassword.isEmpty()) {
                            errorMessage = "Заполните email и пароль."
                            return@submit
                        }
                        if (signupPassword.length < 6) {
                            errorMessage = "Пароль слишком короткий (минимум 6 символов)."
                            return@submit
                        }
                        if (signupRole == "teacher" && signupTeacherType == null) {
                            errorMessage = "Выберите: школьный учитель или репетитор."
                            return@submit
                        }
                        if (signupRole == "student" && signupGrade == null) {
                            errorMessage = "Выберите класс."
                            return@submit
                        }
                        runAction {
                            val hasSession = app.auth.signUp(
                                email = mail,
                                password = signupPassword,
                                role = signupRole,
                                firstName = firstName,
                                lastName = lastName,
                                teacherType = signupTeacherType,
                                studentGrade = signupGrade,
                            )
                            if (hasSession) {
                                app.reloadProfile()
                            } else {
                                infoMessage =
                                    "Письмо отправлено. Подтвердите почту по ссылке из письма, затем войдите."
                                signupLetterSent = true
                            }
                        }
                    },
                    onResend = {
                        runAction {
                            app.auth.resendSignupEmail(signupEmail)
                            infoMessage = "Письмо отправлено повторно."
                        }
                    },
                )
                AuthTab.Reset -> ResetForm(
                    email = resetEmail, onEmail = { resetEmail = it },
                    isLoading = isLoading,
                    letterSent = resetLetterSent,
                    errorMessage = errorMessage,
                    infoMessage = infoMessage,
                    onSubmit = {
                        runAction {
                            app.auth.sendPasswordReset(resetEmail)
                            infoMessage =
                                "Письмо отправлено. Откройте ссылку из письма, чтобы задать новый пароль."
                            resetLetterSent = true
                        }
                    },
                )
            }
        }
    }
}

// MARK: Формы

@Composable
private fun LoginForm(
    email: String, onEmail: (String) -> Unit,
    password: String, onPassword: (String) -> Unit,
    isLoading: Boolean,
    errorMessage: String?, infoMessage: String?,
    onForgot: () -> Unit, onGoogle: () -> Unit, onSubmit: () -> Unit,
) {
    val colors = EgeTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("С возвращением", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(
            "Войдите, чтобы продолжить подготовку к ЕГЭ.",
            color = colors.textDim, fontSize = EgeDims.fsMd,
        )

        GoogleButton(enabled = !isLoading, onClick = onGoogle)
        OrDivider()

        LabeledField("Email") {
            AuthTextField(email, onEmail, "you@example.com", KeyboardType.Email, testTag = "loginEmail")
        }
        LabeledField("Пароль") {
            PasswordField(password, onPassword, testTag = "loginPassword")
        }
        Text(
            "Забыли пароль?",
            color = colors.accent,
            fontSize = EgeDims.fsXs,
            modifier = Modifier.clickable(onClick = onForgot),
        )

        StatusViews(errorMessage, infoMessage)

        PrimaryButton(
            text = "Войти",
            onClick = onSubmit,
            enabled = !isLoading && email.isNotEmpty() && password.isNotEmpty(),
            loading = isLoading,
            modifier = Modifier.testTag("loginSubmit"),
        )
    }
}

@Composable
private fun SignupForm(
    role: String, onRole: (String) -> Unit,
    lastName: String, onLastName: (String) -> Unit,
    firstName: String, onFirstName: (String) -> Unit,
    grade: Int?, onGrade: (Int?) -> Unit,
    teacherType: String?, onTeacherType: (String?) -> Unit,
    email: String, onEmail: (String) -> Unit,
    password: String, onPassword: (String) -> Unit,
    isLoading: Boolean, letterSent: Boolean,
    errorMessage: String?, infoMessage: String?,
    onSubmit: () -> Unit, onResend: () -> Unit,
) {
    val colors = EgeTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Регистрация", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)

        LabeledField("Кто вы?") {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RoleChip("Ученик", active = role == "student") { onRole("student") }
                RoleChip("Учитель", active = role == "teacher") { onRole("teacher") }
            }
        }

        LabeledField("Фамилия") {
            AuthTextField(lastName, onLastName, "Иванов", testTag = "signupLastName")
        }
        LabeledField("Имя") {
            AuthTextField(firstName, onFirstName, "Иван", testTag = "signupFirstName")
        }

        if (role == "student") {
            LabeledField("Класс") {
                DropdownField(
                    value = grade?.toString() ?: "Выберите класс",
                    options = (5..11).map { it.toString() },
                    onSelect = { onGrade(it.toIntOrNull()) },
                    testTag = "signupGrade",
                )
            }
        } else {
            LabeledField("Тип преподавателя") {
                DropdownField(
                    value = when (teacherType) {
                        "school" -> "Школьный учитель"
                        "tutor" -> "Репетитор"
                        else -> "Выберите вариант"
                    },
                    options = listOf("Школьный учитель", "Репетитор"),
                    onSelect = { onTeacherType(if (it == "Школьный учитель") "school" else "tutor") },
                    testTag = "signupTeacherType",
                )
            }
        }

        LabeledField("Email") {
            AuthTextField(email, onEmail, "you@example.com", KeyboardType.Email, testTag = "signupEmail")
        }
        LabeledField("Пароль (минимум 6 символов)") {
            PasswordField(password, onPassword, testTag = "signupPassword")
        }

        StatusViews(errorMessage, infoMessage)

        PrimaryButton(
            text = "Зарегистрироваться",
            onClick = onSubmit,
            enabled = !isLoading,
            loading = isLoading,
            modifier = Modifier.testTag("signupSubmit"),
        )

        if (letterSent) {
            SecondaryButton(
                text = "Отправить письмо ещё раз",
                onClick = onResend,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ResetForm(
    email: String, onEmail: (String) -> Unit,
    isLoading: Boolean, letterSent: Boolean,
    errorMessage: String?, infoMessage: String?,
    onSubmit: () -> Unit,
) {
    val colors = EgeTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Сброс пароля", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(
            "Пришлём письмо со ссылкой для смены пароля. Смена пароля произойдёт " +
                "на сайте, после этого войдите здесь с новым паролем.",
            color = colors.textDim, fontSize = EgeDims.fsMd,
        )

        LabeledField("Email") {
            AuthTextField(email, onEmail, "you@example.com", KeyboardType.Email, testTag = "resetEmail")
        }

        StatusViews(errorMessage, infoMessage)

        PrimaryButton(
            text = "Отправить письмо",
            onClick = onSubmit,
            enabled = !isLoading && email.isNotEmpty() && !letterSent,
            loading = isLoading,
            modifier = Modifier.testTag("resetSubmit"),
        )
    }
}

// MARK: Общие куски

@Composable
private fun GoogleButton(enabled: Boolean, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    Box(Modifier.fillMaxWidth()) {
        SecondaryButton(
            text = "G  Продолжить с Google",
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("googleSignIn"),
        )
    }
}

@Composable
private fun OrDivider() {
    val colors = EgeTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(colors.borderLight)
        )
        Text(
            "или по почте",
            color = colors.textDim,
            fontSize = EgeDims.fsXs,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(colors.borderLight)
        )
    }
}

@Composable
private fun StatusViews(errorMessage: String?, infoMessage: String?) {
    val colors = EgeTheme.colors
    if (errorMessage != null) {
        Text(
            errorMessage,
            color = colors.danger,
            fontSize = EgeDims.fsMd,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(EgeDims.radiusSm))
                .background(colors.dangerBg)
                .padding(10.dp)
                .testTag("authError"),
        )
    }
    if (infoMessage != null) {
        Text(
            infoMessage,
            color = colors.success,
            fontSize = EgeDims.fsMd,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(EgeDims.radiusSm))
                .background(colors.successBg)
                .padding(10.dp)
                .testTag("authInfo"),
        )
    }
}

@Composable
private fun LabeledField(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = EgeTheme.colors.textDim, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Medium)
        content()
    }
}

@Composable
private fun AuthTextField(
    value: String,
    onValue: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    testTag: String = "",
) {
    val colors = EgeTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        placeholder = { Text(placeholder, color = colors.textDim) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(EgeDims.radiusSm),
        colors = authFieldColors(),
        modifier = Modifier
            .fillMaxWidth()
            .testTag(testTag),
    )
}

@Composable
private fun PasswordField(value: String, onValue: (String) -> Unit, testTag: String = "") {
    val colors = EgeTheme.colors
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        placeholder = { Text("••••••••", color = colors.textDim) },
        singleLine = true,
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            Text(
                if (show) "Скрыть" else "Показать",
                color = colors.textDim,
                fontSize = EgeDims.fs2xs,
                modifier = Modifier
                    .clickable { show = !show }
                    .padding(end = 8.dp),
            )
        },
        shape = RoundedCornerShape(EgeDims.radiusSm),
        colors = authFieldColors(),
        modifier = Modifier
            .fillMaxWidth()
            .testTag(testTag),
    )
}

@Composable
private fun authFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = EgeTheme.colors.text,
    unfocusedTextColor = EgeTheme.colors.text,
    focusedContainerColor = EgeTheme.colors.panel,
    unfocusedContainerColor = EgeTheme.colors.panel,
    focusedBorderColor = EgeTheme.colors.accent,
    unfocusedBorderColor = EgeTheme.colors.border,
    cursorColor = EgeTheme.colors.accent,
)

@Composable
private fun RoleChip(title: String, active: Boolean, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    Text(
        title,
        modifier = Modifier
            .clip(RoundedCornerShape(EgeDims.radiusPill))
            .background(if (active) colors.accentLight else colors.surface2)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 14.dp)
            .testTag("role_$title"),
        color = if (active) colors.accent else colors.textDim,
        fontSize = EgeDims.fsMd,
        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
    )
}

@Composable
private fun DropdownField(
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    testTag: String = "",
) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Text(
            value,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(EgeDims.radiusSm))
                .background(colors.panel)
                .clickable { open = true }
                .padding(12.dp)
                .testTag(testTag),
            color = colors.text,
            fontSize = EgeDims.fsMd,
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt) },
                    onClick = {
                        onSelect(opt)
                        open = false
                    },
                    modifier = Modifier.testTag("${testTag}_$opt"),
                )
            }
        }
    }
}
