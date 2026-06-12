package ru.egetrainer.app.screens.teacher

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import ru.egetrainer.app.designsystem.BadgeStyle
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EmptyStateView
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.StatusBadge
import ru.egetrainer.core.models.OutgoingStudentRequest
import ru.egetrainer.core.models.StudentListItem
import ru.egetrainer.core.models.StudentSummary
import ru.egetrainer.core.services.SupabaseError

/**
 * «Мои ученики» — порт MyStudentsView.swift: приглашение по email (consent),
 * pending с отменой, поиск, фильтр «Проблемные», селекты period/source,
 * переход в карточку. studentCard → onOpenCard.
 */
@Composable
fun MyStudentsScreen(app: AppState, onOpenCard: (StudentListItem) -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var students by remember { mutableStateOf<List<StudentListItem>>(emptyList()) }
    var summaries by remember { mutableStateOf<Map<String, StudentSummary>>(emptyMap()) }
    var pending by remember { mutableStateOf<List<OutgoingStudentRequest>>(emptyList()) }
    var inviteEmail by remember { mutableStateOf("") }
    var inviteMessage by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isInviting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var problemsOnly by remember { mutableStateOf(false) }
    var summaryDays by remember { mutableStateOf(30) }
    var summarySource by remember { mutableStateOf("all") }
    var cancelTarget by remember { mutableStateOf<OutgoingStudentRequest?>(null) }

    fun formPct(s: StudentSummary?): Double {
        val t = s?.last10Total ?: 0
        return if (t > 0) (s?.last10Correct ?: 0).toDouble() / t * 100 else 0.0
    }
    val visible = run {
        var list = students
        val q = searchQuery.trim().lowercase()
        if (q.isNotEmpty()) list = list.filter {
            it.displayName.lowercase().contains(q) || (it.email?.lowercase()?.contains(q) ?: false)
        }
        if (!problemsOnly) list else list.sortedWith(compareBy(
            { formPct(summaries[it.studentId]) },
            { summaries[it.studentId]?.activityTotal ?: 0 },
            { it.displayName },
        ))
    }

    suspend fun loadSummaries() {
        runCatching { app.teacher.studentsSummary(summaryDays, summarySource) }.getOrNull()?.let { rows ->
            summaries = rows.associateBy { it.studentId }
        }
    }
    suspend fun load() {
        isLoading = students.isEmpty()
        errorMessage = null
        try {
            students = app.teacher.listMyStudents()
            loadSummaries()
            pending = runCatching { app.teacher.outgoingRequests() }.getOrDefault(emptyList())
                .filter { (it.status ?: "pending") == "pending" }
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
    }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(summaryDays, summarySource) { if (students.isNotEmpty()) loadSummaries() }

    LazyColumn(
        Modifier.fillMaxSize().background(colors.bg),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            EyebrowText("Подготовка к ЕГЭ по профильной математике")
            Text("Мои ученики", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        // Приглашение
        item {
            EgeCard {
                Text("Пригласить ученика", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
                Text("Ученик получит запрос и должен подтвердить его в своём профиле — только после этого вы увидите его статистику.",
                    color = colors.textDim, fontSize = EgeDims.fsXs, modifier = Modifier.padding(top = 4.dp))
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = inviteEmail, onValueChange = { inviteEmail = it },
                        placeholder = { Text("email ученика", color = colors.textDim) },
                        singleLine = true, shape = RoundedCornerShape(EgeDims.radiusSm),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = colors.text, unfocusedTextColor = colors.text,
                            focusedContainerColor = colors.panel, unfocusedContainerColor = colors.panel,
                            focusedBorderColor = colors.accent, unfocusedBorderColor = colors.border, cursorColor = colors.accent,
                        ),
                        modifier = Modifier.weight(1f).testTag("inviteEmail"),
                    )
                    Box(Modifier.width(130.dp)) {
                        PrimaryButton(
                            text = "Пригласить",
                            onClick = {
                                isInviting = true; inviteMessage = null
                                val email = inviteEmail.trim()
                                scope.launch {
                                    try {
                                        app.teacher.inviteStudent(email)
                                        inviteMessage = "Запрос отправлен на $email. Ученик подтвердит его в профиле." to false
                                        inviteEmail = ""
                                        load()
                                    } catch (e: SupabaseError) {
                                        inviteMessage = humanInviteError(e) to true
                                    } catch (e: Exception) {
                                        inviteMessage = (e.message ?: "Ошибка") to true
                                    }
                                    isInviting = false
                                }
                            },
                            enabled = !isInviting && inviteEmail.trim().isNotEmpty(),
                            loading = isInviting,
                            modifier = Modifier.testTag("inviteBtn"),
                        )
                    }
                }
                inviteMessage?.let { (text, isError) ->
                    Text(text, color = if (isError) colors.danger else colors.success,
                        fontSize = EgeDims.fsSm, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        // Pending
        if (pending.isNotEmpty()) {
            item {
                EgeCard {
                    Text("Ожидают подтверждения", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
                    pending.forEach { req ->
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(req.studentEmail ?: "—", color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                                Text("Отправлено: ${Fmt.dateTime(req.createdAt)}", color = colors.textDim, fontSize = EgeDims.fsXs)
                            }
                            StatusBadge("ожидает", BadgeStyle.Warning)
                            Text("Отменить", color = colors.danger, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(start = 10.dp).clickable { cancelTarget = req }.testTag("cancel_${req.requestId}"))
                        }
                    }
                }
            }
        }
        when {
            isLoading -> item { LoadingStateView("Загружаем учеников...") }
            errorMessage != null -> item { ErrorStateView(errorMessage!!) { scope.launch { load() } } }
            students.isEmpty() -> item {
                EmptyStateView("Пока нет подтверждённых учеников",
                    "Отправьте приглашение по email — ученик подтвердит его в своём профиле.")
            }
            else -> {
                // Контролы: поиск, «Проблемные», период/источник
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = searchQuery, onValueChange = { searchQuery = it },
                            placeholder = { Text("Поиск по имени или email", color = colors.textDim) },
                            singleLine = true, shape = RoundedCornerShape(EgeDims.radiusSm),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = colors.text, unfocusedTextColor = colors.text,
                                focusedContainerColor = colors.panel, unfocusedContainerColor = colors.panel,
                                focusedBorderColor = colors.accent, unfocusedBorderColor = colors.border, cursorColor = colors.accent,
                            ),
                            modifier = Modifier.fillMaxWidth().testTag("studentSearch"),
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Проблемные", color = colors.textDim, fontSize = EgeDims.fsXs)
                            Switch(problemsOnly, { problemsOnly = it },
                                colors = SwitchDefaults.colors(checkedTrackColor = colors.accent),
                                modifier = Modifier.testTag("problemsToggle"))
                            Spacer(Modifier.weight(1f))
                            MiniDropdown("$summaryDays дн", listOf(7, 14, 30, 90).map { "$it дн" }, "daysSel") {
                                summaryDays = listOf(7, 14, 30, 90)[it]
                            }
                            Spacer(Modifier.width(8.dp))
                            MiniDropdown(
                                when (summarySource) { "hw" -> "ДЗ"; "test" -> "Тест"; else -> "Всё" },
                                listOf("Всё", "ДЗ", "Тест"), "sourceSel") {
                                summarySource = listOf("all", "hw", "test")[it]
                            }
                        }
                    }
                }
                items(visible, key = { it.studentId }) { s ->
                    StudentCard(s, summaries[s.studentId]) { onOpenCard(s) }
                }
            }
        }
    }

    cancelTarget?.let { req ->
        AlertDialog(
            onDismissRequest = { cancelTarget = null },
            containerColor = colors.panel,
            title = { Text("Отменить приглашение ${req.studentEmail ?: ""}?", color = colors.text) },
            confirmButton = {
                TextButton(onClick = {
                    cancelTarget = null
                    scope.launch { runCatching { app.teacher.cancelRequest(req.requestId) }; load() }
                }) { Text("Отменить приглашение", color = colors.danger) }
            },
            dismissButton = { TextButton(onClick = { cancelTarget = null }) { Text("Назад", color = colors.textDim) } },
        )
    }
}

private fun humanInviteError(e: SupabaseError): String {
    val raw = e.userMessage + (e.message ?: "")
    return when {
        raw.contains("ALREADY_LINKED") -> "Этот ученик уже привязан к вам."
        raw.contains("ALREADY_PENDING") -> "Запрос этому ученику уже отправлен и ждёт подтверждения."
        raw.contains("NOT_FOUND") || raw.contains("USER_NOT_FOUND") ->
            "Пользователь с таким email не найден. Попросите ученика сначала зарегистрироваться."
        raw.contains("SELF") -> "Нельзя пригласить самого себя."
        else -> e.userMessage
    }
}

@Composable
private fun StudentCard(s: StudentListItem, summary: StudentSummary?, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    Box(Modifier.clickable(onClick = onClick).testTag("student_${s.studentId}")) {
        EgeCard(padding = 14.dp) {
            Row {
                Column(Modifier.weight(1f)) {
                    Text(s.displayName, color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.SemiBold)
                    val sub = listOfNotNull(s.studentGrade?.let { "$it класс" }, s.email).joinToString("  ")
                    if (sub.isNotEmpty()) Text(sub, color = colors.textDim, fontSize = EgeDims.fsXs)
                }
                Text("›", color = colors.textDim, fontSize = EgeDims.fsLg)
            }
            if (summary != null) {
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    metric(colors, "Активность", "${summary.activityTotal ?: 0}")
                    val l10 = summary.last10Total ?: 0
                    metric(colors, "Последние 10", if (l10 > 0) "${summary.last10Correct ?: 0}/$l10" else "—")
                    metric(colors, "Покрытие", "${summary.coveredTopicsAllTime ?: 0} подтем")
                }
                summary.lastSeenAt?.let {
                    Text("Был(а): ${Fmt.dateTime(it)}", color = colors.textDim, fontSize = EgeDims.fs2xs,
                        modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}

@Composable
private fun metric(colors: ru.egetrainer.app.designsystem.EgeColors, title: String, value: String) {
    Column {
        Text(title.uppercase(), color = colors.textDim, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
        Text(value, color = colors.text, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun MiniDropdown(value: String, options: List<String>, tag: String, onSelect: (Int) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Text("$value ▾", color = colors.accent, fontSize = EgeDims.fsSm,
            modifier = Modifier.clickable { open = true }.testTag(tag))
        DropdownMenu(open, { open = false }) {
            options.forEachIndexed { i, o -> DropdownMenuItem(text = { Text(o) }, onClick = { onSelect(i); open = false }) }
        }
    }
}
