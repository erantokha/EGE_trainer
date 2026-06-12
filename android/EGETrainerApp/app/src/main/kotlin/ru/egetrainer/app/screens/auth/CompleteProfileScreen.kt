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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
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
 * Completion-шаг после Google-входа — порт CompleteProfileView.swift,
 * паритет tasks/google_complete.html: роль, ФИ, класс/тип → update_my_profile.
 */
@Composable
fun CompleteProfileScreen(app: AppState) {
    var role by remember { mutableStateOf("student") }
    var lastName by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var grade by remember { mutableStateOf<Int?>(null) }
    var teacherType by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val colors = EgeTheme.colors

    // Префилл из имеющегося профиля (как google_complete.js)
    LaunchedEffect(Unit) {
        app.profile?.let { p ->
            if (p.role == "teacher") role = "teacher"
            firstName = p.firstName ?: ""
            lastName = p.lastName ?: ""
            grade = p.studentGrade
            teacherType = p.teacherType
        }
    }

    fun save() {
        errorMessage = null
        val first = firstName.trim()
        val last = lastName.trim()
        if (first.isEmpty() || last.isEmpty()) {
            errorMessage = "Укажите фамилию и имя."
            return
        }
        if (role == "teacher" && teacherType == null) {
            errorMessage = "Выберите: школьный учитель или репетитор."
            return
        }
        if (role == "student" && grade == null) {
            errorMessage = "Выберите класс."
            return
        }
        isLoading = true
        scope.launch {
            try {
                app.auth.updateMyProfile(
                    firstName = first, lastName = last, role = role,
                    teacherType = teacherType, studentGrade = grade,
                )
                app.reloadProfile()
            } catch (e: SupabaseError) {
                errorMessage = e.userMessage
            } catch (e: Exception) {
                errorMessage = e.message
            } finally {
                isLoading = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandLogo(Modifier.padding(top = 48.dp, bottom = 20.dp))

        EgeCard(modifier = Modifier.padding(horizontal = 16.dp), padding = 20.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Завершите регистрацию", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("Расскажите о себе, чтобы настроить тренажёр.", color = colors.textDim, fontSize = EgeDims.fsMd)

                FieldLabel("Кто вы?")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("Ученик", role == "student") { role = "student" }
                    Chip("Учитель", role == "teacher") { role = "teacher" }
                }

                FieldLabel("Фамилия")
                CompleteField(lastName, { lastName = it }, "Иванов", "completeLastName")
                FieldLabel("Имя")
                CompleteField(firstName, { firstName = it }, "Иван", "completeFirstName")

                if (role == "student") {
                    FieldLabel("Класс")
                    CompleteDropdown(
                        value = grade?.toString() ?: "Выберите класс",
                        options = (5..11).map { it.toString() },
                        onSelect = { grade = it.toIntOrNull() },
                    )
                } else {
                    FieldLabel("Тип преподавателя")
                    CompleteDropdown(
                        value = when (teacherType) {
                            "school" -> "Школьный учитель"
                            "tutor" -> "Репетитор"
                            else -> "Выберите вариант"
                        },
                        options = listOf("Школьный учитель", "Репетитор"),
                        onSelect = { teacherType = if (it == "Школьный учитель") "school" else "tutor" },
                    )
                }

                errorMessage?.let {
                    Text(
                        it,
                        color = colors.danger,
                        fontSize = EgeDims.fsMd,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(EgeDims.radiusSm))
                            .background(colors.dangerBg)
                            .padding(10.dp),
                    )
                }

                PrimaryButton(
                    text = "Сохранить",
                    onClick = { save() },
                    enabled = !isLoading,
                    loading = isLoading,
                    modifier = Modifier.testTag("completeSave"),
                )
                SecondaryButton(
                    text = "Выйти",
                    onClick = { scope.launch { app.signOut() } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, color = EgeTheme.colors.textDim, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Medium)
}

@Composable
private fun Chip(title: String, active: Boolean, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    Text(
        title,
        modifier = Modifier
            .clip(RoundedCornerShape(EgeDims.radiusPill))
            .background(if (active) colors.accentLight else colors.surface2)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 14.dp),
        color = if (active) colors.accent else colors.textDim,
        fontSize = EgeDims.fsMd,
        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
    )
}

@Composable
private fun CompleteField(
    value: String,
    onValue: (String) -> Unit,
    placeholder: String,
    tag: String,
) {
    val colors = EgeTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        placeholder = { Text(placeholder, color = colors.textDim) },
        singleLine = true,
        shape = RoundedCornerShape(EgeDims.radiusSm),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.text,
            unfocusedTextColor = colors.text,
            focusedContainerColor = colors.panel,
            unfocusedContainerColor = colors.panel,
            focusedBorderColor = colors.accent,
            unfocusedBorderColor = colors.border,
            cursorColor = colors.accent,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag(tag),
    )
}

@Composable
private fun CompleteDropdown(value: String, options: List<String>, onSelect: (String) -> Unit) {
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
                .padding(12.dp),
            color = colors.text,
            fontSize = EgeDims.fsMd,
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { opt ->
                DropdownMenuItem(text = { Text(opt) }, onClick = {
                    onSelect(opt)
                    open = false
                })
            }
        }
    }
}
