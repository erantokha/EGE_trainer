package ru.egetrainer.app.screens.teacher

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.egetrainer.app.AppState
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.app.screens.shared.PreviewQuestionCard
import ru.egetrainer.app.designsystem.DrawOverlayHost
import ru.egetrainer.app.pdf.PdfExportButton
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.models.StudentListItem
import ru.egetrainer.core.services.ResolveRequest
import ru.egetrainer.core.services.TeacherService
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Заголовок-бар вспомогательных экранов учителя. */
@Composable
private fun FlowHeader(title: String, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    Row(
        Modifier.fillMaxWidth().background(colors.panel).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("‹ Назад", color = colors.accent, fontSize = EgeDims.fsMd,
            modifier = Modifier.clickable(onClick = onBack).testTag("flowBack"))
        Spacer(Modifier.weight(1f))
        Text(title, color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
    }
}

/**
 * Предпросмотр «Добавленные задачи» — порт AddedTasksPreviewSheet.swift:
 * «Показано X из Y», честный shortage, ответы скрываемые, session-ссылка,
 * «Создать ДЗ из подборки».
 */
@Composable
fun TeacherPreviewScreen(
    app: AppState,
    student: StudentListItem?,
    requests: List<ResolveRequest>,
    filterId: String?,
    shuffle: Boolean,
    preAssembled: List<RunQuestion>,
    onBack: () -> Unit,
    onCreateHW: (List<QuestionRef>) -> Unit,
) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val questions = remember { mutableStateListOf<RunQuestion>().apply { addAll(preAssembled) } }
    val requestedTotal = requests.sumOf { it.n }
    var shareURL by remember { mutableStateOf<String?>(null) }
    var isSharing by remember { mutableStateOf(false) }

    val filterTitle = when (filterId) {
        "unseen_low" -> "Нерешённое"; "stale" -> "Давно не решал"
        "unstable" -> "Нестабильно"; "weak_spots" -> "Слабые места"; else -> null
    }
    val shortage = if (questions.size < requestedTotal)
        "Доступно ${questions.size} из $requestedTotal: в выбранных темах больше нет уникальных задач (не хватило ${requestedTotal - questions.size})."
    else null

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        FlowHeaderWithPdf("Добавленные задачи", questions, onBack)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Показано: ${questions.size} из $requestedTotal", color = colors.textDim,
                        fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                    if (filterTitle != null) {
                        Text("фильтр: $filterTitle", color = colors.accent, fontSize = EgeDims.fsXs,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(start = 8.dp).clip(RoundedCornerShape(EgeDims.radiusPill))
                                .background(colors.accentLight).padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                if (shortage != null) {
                    Text(shortage, color = colors.warnText, fontSize = EgeDims.fsXs,
                        modifier = Modifier.padding(top = 6.dp).fillMaxWidth()
                            .clip(RoundedCornerShape(EgeDims.radiusSm)).background(colors.warnBg).padding(8.dp)
                            .testTag("shortage"))
                }
            }
            itemsIndexed(questions, key = { _, q -> q.questionId }) { idx, q ->
                PreviewQuestionCard(idx, q, answerStyle = false, // ответы скрываемые
                    onDelete = { questions.removeAll { it.questionId == q.questionId } })
            }
            if (questions.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (shareURL != null) {
                            SecondaryButton("Поделиться ссылкой на подборку",
                                onClick = { shareText(ctx, shareURL!!) },
                                modifier = Modifier.fillMaxWidth().testTag("shareLink"))
                        } else {
                            SecondaryButton(
                                text = if (isSharing) "Создаём ссылку..." else "Создать ссылку на подборку",
                                onClick = {
                                    isSharing = true
                                    scope.launch {
                                        val refs = questions.map { QuestionRef(it.topicId, it.questionId) }
                                        runCatching { app.teacher.createSessionLink("list", shuffle, refs) }
                                            .getOrNull()?.let { shareURL = it.url }
                                        isSharing = false
                                    }
                                },
                                enabled = !isSharing,
                                modifier = Modifier.fillMaxWidth().testTag("makeLink"),
                            )
                        }
                        PrimaryButton("Создать ДЗ из этой подборки",
                            onClick = { onCreateHW(questions.map { QuestionRef(it.topicId, it.questionId) }) },
                            modifier = Modifier.testTag("createFromPreview"))
                    }
                }
            }
        }
    }
}

/** «Начать» — лист подборки со скрытыми ответами (порт TeacherListView.swift). */
@Composable
fun TeacherListScreen(questions: List<RunQuestion>, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        FlowHeaderWithPdf("Подборка", questions, onBack)
        DrawOverlayHost {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Text("Всего задач: ${questions.size}", color = colors.textDim, fontSize = EgeDims.fsMd) }
                itemsIndexed(questions, key = { _, q -> q.questionId }) { idx, q ->
                    PreviewQuestionCard(idx, q, answerStyle = false) // ответы раскрываются тапом, без записи
                }
            }
        }
    }
}

/** Шапка с PDF-кнопкой (с ответами по умолчанию — для учителя). */
@Composable
private fun FlowHeaderWithPdf(title: String, questions: List<RunQuestion>, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    Row(
        Modifier.fillMaxWidth().background(colors.panel).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("‹ Назад", color = colors.accent, fontSize = EgeDims.fsMd,
            modifier = Modifier.clickable(onClick = onBack).testTag("flowBack"))
        Spacer(Modifier.weight(1f))
        Text(title, color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        PdfExportButton(questions, defaultTitle = "Подборка задач", answersDefault = true)
    }
}

/** Создание ДЗ — порт CreateHomeworkView.swift. */
@Composable
fun CreateHomeworkScreen(
    app: AppState,
    student: StudentListItem?,
    prePicked: List<QuestionRef>,
    onBack: () -> Unit,
) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current

    var title by remember { mutableStateOf("ДЗ " + LocalDate.now().format(DateTimeFormatter.ofPattern("dd.MM"))) }
    var description by remember { mutableStateOf("") }
    var shuffle by remember { mutableStateOf(false) }
    var assignedStudent by remember { mutableStateOf(student) }
    var allStudents by remember { mutableStateOf<List<StudentListItem>>(student?.let { listOf(it) } ?: emptyList()) }
    var assignMenuOpen by remember { mutableStateOf(false) }
    var questions by remember { mutableStateOf<List<RunQuestion>>(emptyList()) }
    var showTasks by remember { mutableStateOf(false) }
    var isResolving by remember { mutableStateOf(true) }
    var isCreating by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<TeacherService.CreatedHomework?>(null) }

    LaunchedEffect(Unit) {
        runCatching { app.teacher.listMyStudents() }.getOrNull()?.let { allStudents = it }
        questions = runCatching { app.content.buildQuestions(prePicked) }.getOrDefault(emptyList())
        isResolving = false
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        FlowHeader("Создание ДЗ", onBack)
        val createdHw = created
        if (createdHw != null) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    EgeCard {
                        Text(
                            assignedStudent?.let { "ДЗ создано и назначено ученику ${it.displayName}" }
                                ?: "ДЗ создано без назначения",
                            color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.testTag("hwCreated"),
                        )
                        Text(
                            if (assignedStudent != null) "Задание уже появилось у ученика в «Мои ДЗ». Можно отправить прямую ссылку:"
                            else "Отправьте ученику прямую ссылку на задание:",
                            color = colors.textDim, fontSize = EgeDims.fsSm, modifier = Modifier.padding(top = 6.dp),
                        )
                        Text(createdHw.url, color = colors.accent, fontSize = EgeDims.fsXs,
                            modifier = Modifier.padding(top = 6.dp).fillMaxWidth()
                                .clip(RoundedCornerShape(EgeDims.radiusSm)).background(colors.surface2).padding(10.dp))
                        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            SecondaryButton("Поделиться", onClick = { shareText(ctx, createdHw.url) })
                        }
                    }
                    PrimaryButton("Готово", onClick = onBack, modifier = Modifier.padding(top = 14.dp))
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    EgeCard {
                        Text("Кому", color = colors.textDim, fontSize = EgeDims.fsXs, fontWeight = FontWeight.SemiBold)
                        Box {
                            Row(
                                Modifier.fillMaxWidth().padding(top = 4.dp).clip(RoundedCornerShape(EgeDims.radiusSm))
                                    .background(colors.surface2).clickable { assignMenuOpen = true }.padding(10.dp)
                                    .testTag("assignPicker"),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(assignedStudent?.displayName ?: "Не назначать",
                                        color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                                    assignedStudent?.email?.let { Text(it, color = colors.textDim, fontSize = EgeDims.fsXs) }
                                }
                                Text("▾", color = colors.textDim, fontSize = EgeDims.fsXs)
                            }
                            androidx.compose.material3.DropdownMenu(assignMenuOpen, { assignMenuOpen = false }) {
                                allStudents.forEach { s ->
                                    androidx.compose.material3.DropdownMenuItem(
                                        text = { Text(if (s.id == assignedStudent?.id) "✓ ${s.displayName}" else s.displayName) },
                                        onClick = { assignedStudent = s; assignMenuOpen = false })
                                }
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text("Не назначать") },
                                    onClick = { assignedStudent = null; assignMenuOpen = false },
                                    modifier = Modifier.testTag("assignNone"))
                            }
                        }
                        if (assignedStudent == null) {
                            Text("ДЗ будет создано без назначения — отправьте ученику ссылку.",
                                color = colors.textDim, fontSize = EgeDims.fsXs, modifier = Modifier.padding(top = 4.dp))
                        }
                        Text("Название", color = colors.textDim, fontSize = EgeDims.fsXs,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                        FlowField(title, { title = it }, "Название ДЗ", "hwTitle")
                        Text("Описание (необязательно)", color = colors.textDim, fontSize = EgeDims.fsXs,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                        FlowField(description, { description = it }, "Комментарий для ученика", "hwDesc")
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Перемешать задачи", color = colors.textDim, fontSize = EgeDims.fsMd)
                            Spacer(Modifier.weight(1f))
                            Switch(shuffle, { shuffle = it }, colors = SwitchDefaults.colors(checkedTrackColor = colors.accent))
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(EgeDims.radiusMd)).background(colors.panel)
                        .clickable { showTasks = !showTasks }.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text("Добавленные задачи: ${questions.size}", color = colors.text,
                            fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        Text(if (showTasks) "▲" else "▼", color = colors.textDim, fontSize = EgeDims.fsXs)
                    }
                }
                if (showTasks) {
                    itemsIndexed(questions, key = { _, q -> q.questionId }) { idx, q ->
                        PreviewQuestionCard(idx, q, answerStyle = false,
                            onDelete = { questions = questions.filter { it.questionId != q.questionId } })
                    }
                }
                errorMessage?.let { item { ErrorStateView(it) } }
                item {
                    PrimaryButton(
                        text = if (assignedStudent == null) "Создать ДЗ" else "Создать и назначить",
                        onClick = {
                            isCreating = true; errorMessage = null
                            scope.launch {
                                try {
                                    created = app.teacher.createHomework(
                                        title = title, description = description.trim().ifEmpty { null },
                                        shuffle = shuffle,
                                        questions = questions.map { QuestionRef(it.topicId, it.questionId) },
                                        assignToStudentId = assignedStudent?.studentId,
                                    )
                                } catch (e: Exception) {
                                    errorMessage = "Не удалось создать ДЗ: ${e.message}"
                                }
                                isCreating = false
                            }
                        },
                        enabled = !isCreating && !isResolving && questions.isNotEmpty() && title.trim().isNotEmpty(),
                        loading = isCreating,
                        modifier = Modifier.testTag("submitCreate"),
                    )
                }
            }
        }
    }
}

@Composable
private fun FlowField(value: String, onValue: (String) -> Unit, placeholder: String, tag: String) {
    val colors = EgeTheme.colors
    androidx.compose.material3.OutlinedTextField(
        value = value, onValueChange = onValue,
        placeholder = { Text(placeholder, color = colors.textDim) },
        singleLine = true, shape = RoundedCornerShape(EgeDims.radiusSm),
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.text, unfocusedTextColor = colors.text,
            focusedContainerColor = colors.panel, unfocusedContainerColor = colors.panel,
            focusedBorderColor = colors.accent, unfocusedBorderColor = colors.border, cursorColor = colors.accent,
        ),
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag(tag),
    )
}
