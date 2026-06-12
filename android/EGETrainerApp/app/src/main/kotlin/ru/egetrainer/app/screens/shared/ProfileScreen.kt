package ru.egetrainer.app.screens.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.core.models.IncomingTeacherRequest
import ru.egetrainer.core.models.MyTeacher
import ru.egetrainer.core.models.OutgoingStudentRequest
import ru.egetrainer.core.services.SupabaseError

/**
 * Профиль — порт ProfileView.swift (паритет tasks/profile.html): данные
 * пользователя, редактирование, удаление аккаунта за двойным подтверждением;
 * у ученика — входящие consent-запросы и «Мои преподаватели»; у учителя —
 * исходящие приглашения (в iOS они в MyStudentsView — здесь временно в
 * профиле, пока кабинет не построен в WAND.3; решение зафиксировано).
 */
@Composable
fun ProfileScreen(app: AppState) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    val phase by app.phase.collectAsState()
    val profile = (phase as? AppState.Phase.SignedIn)?.profile
    val isStudent = profile?.isTeacher != true

    var incoming by remember { mutableStateOf<List<IncomingTeacherRequest>>(emptyList()) }
    var teachers by remember { mutableStateOf<List<MyTeacher>>(emptyList()) }
    var outgoing by remember { mutableStateOf<List<OutgoingStudentRequest>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var revokeTarget by remember { mutableStateOf<MyTeacher?>(null) }

    // Редактирование (паритет tasks/profile.js editMode)
    var isEditing by remember { mutableStateOf(false) }
    var editFirstName by remember { mutableStateOf("") }
    var editLastName by remember { mutableStateOf("") }
    var editGrade by remember { mutableStateOf<Int?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    // Удаление аккаунта (двойное подтверждение; live-вызов в приёмке запрещён)
    var showDeleteConfirm by remember { mutableStateOf(false) }

    suspend fun load() {
        isLoading = true
        loadError = null
        try {
            if (isStudent) {
                incoming = app.student.incomingTeacherRequests()
                    .filter { (it.status ?: "pending") == "pending" }
                teachers = app.student.myTeachers()
            } else {
                outgoing = app.teacher.outgoingRequests()
                    .filter { (it.status ?: "pending") == "pending" }
            }
        } catch (e: SupabaseError) {
            loadError = e.userMessage
        } catch (e: Exception) {
            loadError = e.message
        }
        isLoading = false
    }

    LaunchedEffect(isStudent) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        EyebrowText("Подготовка к ЕГЭ по профильной математике")
        Text("Профиль", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)

        // Карточка профиля
        EgeCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(colors.accentLight),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        (profile?.displayName ?: "?").take(1),
                        color = colors.accent,
                        fontSize = EgeDims.fs2xl,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Column(Modifier.padding(start = 12.dp).weight(1f)) {
                    Text(
                        profile?.displayName ?: "—",
                        color = colors.text,
                        fontSize = EgeDims.fsLg,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.testTag("profileName"),
                    )
                    Text(profile?.email ?: "", color = colors.textDim, fontSize = EgeDims.fsXs)
                }
                if (!isEditing) {
                    Text(
                        "Изменить",
                        color = colors.accent,
                        fontSize = EgeDims.fsXs,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clickable {
                                editFirstName = profile?.firstName ?: ""
                                editLastName = profile?.lastName ?: ""
                                editGrade = profile?.studentGrade
                                isEditing = true
                            }
                            .testTag("profileEdit"),
                    )
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 10.dp), color = colors.borderLight)

            if (isEditing) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    EditLabel("Фамилия")
                    EditField(editLastName, { editLastName = it }, "profileEditLastName")
                    EditLabel("Имя")
                    EditField(editFirstName, { editFirstName = it }, "profileEditFirstName")
                    if (isStudent) {
                        EditLabel("Класс")
                        GradeDropdown(editGrade) { editGrade = it }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) {
                            PrimaryButton(
                                text = "Сохранить",
                                onClick = {
                                    actionError = null
                                    val first = editFirstName.trim()
                                    val last = editLastName.trim()
                                    if (first.isEmpty() || last.isEmpty()) {
                                        actionError = "Укажите фамилию и имя."
                                    } else {
                                        isSaving = true
                                        scope.launch {
                                            try {
                                                app.auth.updateMyProfile(
                                                    firstName = first,
                                                    lastName = last,
                                                    role = if (profile?.isTeacher == true) "teacher" else "student",
                                                    teacherType = profile?.teacherType,
                                                    studentGrade = editGrade,
                                                )
                                                app.reloadProfile()
                                                isEditing = false
                                            } catch (e: SupabaseError) {
                                                actionError = e.userMessage
                                            } finally {
                                                isSaving = false
                                            }
                                        }
                                    }
                                },
                                enabled = !isSaving,
                                loading = isSaving,
                                modifier = Modifier.testTag("profileSave"),
                            )
                        }
                        SecondaryButton("Отмена", onClick = { isEditing = false }, enabled = !isSaving)
                    }
                }
            } else {
                InfoRow("Роль", if (profile?.isTeacher == true) "Учитель" else "Ученик")
                profile?.studentGrade?.let { InfoRow("Класс", "$it") }
            }
        }

        // Consent-блоки
        if (isStudent) {
            if (incoming.isNotEmpty()) {
                IncomingRequestsCard(incoming, onRespond = { req, accept ->
                    scope.launch {
                        actionError = null
                        try {
                            app.student.respondTeacherRequest(req.requestId, accept)
                            load()
                        } catch (e: SupabaseError) {
                            actionError = e.userMessage
                        }
                    }
                })
            }
            TeachersCard(
                teachers = teachers,
                isLoading = isLoading,
                loadError = loadError,
                onRevoke = { revokeTarget = it },
            )
        } else {
            OutgoingRequestsCard(outgoing, isLoading, loadError, onCancel = { req ->
                scope.launch {
                    actionError = null
                    try {
                        app.teacher.cancelRequest(req.requestId)
                        load()
                    } catch (e: SupabaseError) {
                        actionError = e.userMessage
                    }
                }
            })
        }

        actionError?.let {
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

        SecondaryButton(
            text = "Выйти из аккаунта",
            onClick = { scope.launch { app.signOut() } },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("profileSignOut"),
        )

        Text(
            "Удалить профиль",
            color = colors.danger,
            fontSize = EgeDims.fsXs,
            modifier = Modifier
                .clickable { showDeleteConfirm = true }
                .testTag("profileDelete"),
        )

        Text(
            "Смена пароля — через «Сброс пароля» на экране входа.",
            color = colors.textDim,
            fontSize = EgeDims.fsXs,
        )
        Spacer(Modifier.padding(bottom = 12.dp))
    }

    // Удаление: двойное подтверждение (порт confirmationDialog)
    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            containerColor = colors.panel,
            title = { Text("Удалить профиль безвозвратно?", color = colors.text) },
            text = {
                Text(
                    "Будут удалены попытки, связи с преподавателями и сам аккаунт.",
                    color = colors.textDim,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirm = false
                        scope.launch {
                            try {
                                app.auth.deleteMyAccount()
                                app.signOut()
                            } catch (e: SupabaseError) {
                                actionError = e.userMessage
                            }
                        }
                    },
                    modifier = Modifier.testTag("profileDeleteConfirm"),
                ) { Text("Да, удалить аккаунт", color = colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Отмена", color = colors.textDim)
                }
            },
        )
    }

    // Отвязка преподавателя: подтверждение
    revokeTarget?.let { t ->
        AlertDialog(
            onDismissRequest = { revokeTarget = null },
            containerColor = colors.panel,
            title = { Text("Отключить доступ преподавателя ${t.displayName}?", color = colors.text) },
            text = {
                Text(
                    "Он больше не увидит вашу статистику и не сможет назначать ДЗ.",
                    color = colors.textDim,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    revokeTarget = null
                    scope.launch {
                        actionError = null
                        try {
                            app.student.revokeTeacher(t.teacherId)
                            load()
                        } catch (e: SupabaseError) {
                            actionError = e.userMessage
                        }
                    }
                }) { Text("Отключить доступ", color = colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { revokeTarget = null }) {
                    Text("Отмена", color = colors.textDim)
                }
            },
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    val colors = EgeTheme.colors
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, color = colors.textDim, fontSize = EgeDims.fsMd)
        Spacer(Modifier.weight(1f))
        Text(value, color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EditLabel(text: String) {
    Text(text, color = EgeTheme.colors.textDim, fontSize = EgeDims.fsXs)
}

@Composable
private fun EditField(value: String, onValue: (String) -> Unit, tag: String) {
    val colors = EgeTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
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
private fun GradeDropdown(value: Int?, onSelect: (Int?) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Text(
            value?.toString() ?: "Не указан",
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
            DropdownMenuItem(text = { Text("Не указан") }, onClick = {
                onSelect(null)
                open = false
            })
            (5..11).forEach { g ->
                DropdownMenuItem(text = { Text("$g") }, onClick = {
                    onSelect(g)
                    open = false
                })
            }
        }
    }
}

@Composable
private fun IncomingRequestsCard(
    incoming: List<IncomingTeacherRequest>,
    onRespond: (IncomingTeacherRequest, Boolean) -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Запросы от преподавателей", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
            Text(
                "Преподаватель получит доступ к вашей статистике и сможет назначать ДЗ " +
                    "только после вашего подтверждения.",
                color = colors.textDim, fontSize = EgeDims.fsXs,
            )
            incoming.forEach { req ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(EgeDims.radiusSm))
                        .background(colors.accentLight.copy(alpha = 0.4f))
                        .padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        req.teacherName ?: req.teacherEmail ?: "Преподаватель",
                        color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium,
                    )
                    req.teacherEmail?.let { Text(it, color = colors.textDim, fontSize = EgeDims.fsXs) }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) {
                            PrimaryButton("Принять", onClick = { onRespond(req, true) })
                        }
                        SecondaryButton("Отклонить", onClick = { onRespond(req, false) })
                    }
                }
            }
        }
    }
}

@Composable
private fun TeachersCard(
    teachers: List<MyTeacher>,
    isLoading: Boolean,
    loadError: String?,
    onRevoke: (MyTeacher) -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Мои преподаватели", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
            when {
                isLoading && teachers.isEmpty() -> LoadingStateView()
                loadError != null -> Text(loadError, color = colors.danger, fontSize = EgeDims.fsMd)
                teachers.isEmpty() -> Text(
                    "Пока нет привязанных преподавателей.",
                    color = colors.textDim, fontSize = EgeDims.fsMd,
                )
                else -> teachers.forEach { t ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.displayName, color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                            t.teacherEmail?.let { Text(it, color = colors.textDim, fontSize = EgeDims.fsXs) }
                        }
                        Text(
                            "Отключить",
                            color = colors.danger,
                            fontSize = EgeDims.fsXs,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.clickable { onRevoke(t) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OutgoingRequestsCard(
    outgoing: List<OutgoingStudentRequest>,
    isLoading: Boolean,
    loadError: String?,
    onCancel: (OutgoingStudentRequest) -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Мои приглашения ученикам", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
            when {
                isLoading && outgoing.isEmpty() -> LoadingStateView()
                loadError != null -> Text(loadError, color = colors.danger, fontSize = EgeDims.fsMd)
                outgoing.isEmpty() -> Text(
                    "Нет ожидающих приглашений. Пригласить ученика можно будет из кабинета «Мои ученики» (WAND.3).",
                    color = colors.textDim, fontSize = EgeDims.fsMd,
                )
                else -> outgoing.forEach { req ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                req.studentEmail ?: "—",
                                color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium,
                            )
                            Text("ожидает подтверждения", color = colors.textDim, fontSize = EgeDims.fsXs)
                        }
                        Text(
                            "Отменить",
                            color = colors.danger,
                            fontSize = EgeDims.fsXs,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.clickable { onCancel(req) },
                        )
                    }
                }
            }
        }
    }
}
