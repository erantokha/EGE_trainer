package ru.egetrainer.app.screens.homework

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
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
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.app.designsystem.StatusBadge
import ru.egetrainer.app.screens.shared.AttemptSummaryHeader
import ru.egetrainer.app.screens.shared.QuestionReviewCard
import ru.egetrainer.app.screens.shared.QuestionRunCard
import ru.egetrainer.app.screens.student.AnalogRunSheet
import ru.egetrainer.app.designsystem.DrawOverlayHost
import ru.egetrainer.app.pdf.PdfExportButton
import ru.egetrainer.core.models.AttemptPayload
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.HomeworkArchiveItem
import ru.egetrainer.core.models.HomeworkListItem
import ru.egetrainer.core.models.HomeworkSummary
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.AnswerChecker
import kotlin.math.roundToInt

/** Внутренний роутер ДЗ-таба: список / архив / выполнение по токену. */
private sealed class HwNav {
    data object List : HwNav()
    data object Archive : HwNav()
    data class Run(val token: String) : HwNav()
}

/**
 * Таб «Мои ДЗ» — порт MyHomeworksView/HomeworkArchiveView/HomeworkRunView.swift:
 * список со статусами, архив с пагинацией, выполнение по токену.
 */
@Composable
fun MyHomeworksScreen(app: AppState) {
    var nav by remember { mutableStateOf<HwNav>(HwNav.List) }
    when (val n = nav) {
        is HwNav.List -> HomeworkListScreen(
            app = app,
            onOpen = { nav = HwNav.Run(it) },
            onArchive = { nav = HwNav.Archive },
        )
        is HwNav.Archive -> HomeworkArchiveScreen(
            app = app,
            onOpen = { nav = HwNav.Run(it) },
            onBack = { nav = HwNav.List },
        )
        is HwNav.Run -> HomeworkRunScreen(
            app = app,
            token = n.token,
            onBack = { nav = HwNav.List; app.refreshHomeworkBadge() },
        )
    }
}

@Composable
private fun HomeworkListScreen(app: AppState, onOpen: (String) -> Unit, onArchive: () -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    var summary by remember { mutableStateOf<HomeworkSummary?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        isLoading = summary == null
        errorMessage = null
        try {
            val s = app.homework.myHomeworksSummary()
            // счёт «верно N из M» для сданных добираем из попытки (как my_homeworks.js)
            val enriched = s.items.map { item ->
                if (item.isSubmitted && item.correct == null) {
                    val a = runCatching { app.homework.attempt(item.token) }.getOrNull()
                    item.copy(correct = a?.correct, total = a?.total)
                } else item
            }
            summary = s.copy(items = enriched)
            app.setPendingHomeworks(s.pendingCount)
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
    }

    LaunchedEffect(Unit) { load() }

    LazyColumn(
        Modifier.fillMaxSize().background(colors.bg),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            EyebrowText("Подготовка к ЕГЭ по профильной математике")
            Text("Мои ДЗ", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        summary?.let { s ->
            item {
                Text(
                    "Несданные: ${s.pendingCount}    Всего: ${s.totalCount}",
                    color = colors.textDim, fontSize = EgeDims.fsMd,
                )
            }
        }
        when {
            isLoading -> item { LoadingStateView("Загружаем список ДЗ...") }
            errorMessage != null -> item { ErrorStateView(errorMessage!!) { scope.launch { load() } } }
            summary?.items.isNullOrEmpty() -> item {
                ru.egetrainer.app.designsystem.EmptyStateView(
                    title = "Пока нет домашних заданий",
                    subtitle = "Когда преподаватель назначит ДЗ, оно появится здесь.",
                )
            }
            else -> {
                items(summary!!.items, key = { it.id }) { item ->
                    HomeworkCard(item) { onOpen(item.token) }
                }
                if ((summary?.archiveCount ?: 0) > 0) {
                    item {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(EgeDims.radiusMd))
                                .background(colors.panel)
                                .border(1.dp, colors.borderLight, RoundedCornerShape(EgeDims.radiusMd))
                                .clickable(onClick = onArchive)
                                .padding(14.dp)
                                .testTag("archiveLink"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "Архив работ (${summary!!.archiveCount})",
                                color = colors.accent, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.weight(1f))
                            Text("›", color = colors.accent, fontSize = EgeDims.fsLg)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeworkCard(item: HomeworkListItem, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    val title = if (item.isSubmitted && item.correct != null && item.total != null)
        "${item.displayTitle} — верно ${item.correct} из ${item.total}"
    else item.displayTitle
    androidx.compose.foundation.layout.Box(Modifier.clickable(onClick = onClick).testTag("hw_${item.id}")) {
        EgeCard(padding = 14.dp) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    title,
                    color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                StatusBadge(
                    text = if (item.isSubmitted) "Сдано" else "Не сдано",
                    style = if (item.isSubmitted) BadgeStyle.Success else BadgeStyle.Danger,
                )
            }
            Text(
                if (item.isSubmitted) Fmt.dateTime(item.submittedAt)
                else "Назначено: ${Fmt.dateTime(item.assignedAt)}",
                color = colors.textDim, fontSize = EgeDims.fsXs,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

@Composable
private fun HomeworkArchiveScreen(app: AppState, onOpen: (String) -> Unit, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    val items = remember { mutableStateListOf<HomeworkArchiveItem>() }
    var offset by remember { mutableStateOf(10) } // первые 10 — на «Мои ДЗ»
    var hasMore by remember { mutableStateOf(true) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val pageSize = 50

    suspend fun loadMore() {
        if (isLoading) return
        isLoading = true
        errorMessage = null
        try {
            val page = app.homework.archive(offset, pageSize)
            items.addAll(page)
            offset += page.size
            hasMore = page.size >= pageSize
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
    }

    LaunchedEffect(Unit) { if (items.isEmpty()) loadMore() }

    LazyColumn(
        Modifier.fillMaxSize().background(colors.bg),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "‹ Назад",
                    color = colors.accent, fontSize = EgeDims.fsMd,
                    modifier = Modifier.clickable(onClick = onBack).testTag("archiveBack"),
                )
            }
            Text("Архив работ", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        if (errorMessage != null) {
            item { ErrorStateView(errorMessage!!) { scope.launch { loadMore() } } }
        } else if (items.isEmpty() && !isLoading && !hasMore) {
            item {
                ru.egetrainer.app.designsystem.EmptyStateView(
                    title = "Архив пока пуст",
                    subtitle = "Старые домашние задания будут появляться здесь.",
                )
            }
        }
        items(items, key = { it.id }) { item ->
            val title = if (item.isSubmitted && item.correct != null && item.total != null)
                "${item.displayTitle} — верно ${item.correct} из ${item.total}"
            else item.displayTitle
            androidx.compose.foundation.layout.Box(
                Modifier.then(
                    if (item.token != null) Modifier.clickable { onOpen(item.token!!) } else Modifier
                )
            ) {
                EgeCard(padding = 14.dp) {
                    Row(verticalAlignment = Alignment.Top) {
                        Text(
                            title,
                            color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f),
                        )
                        StatusBadge(
                            text = if (item.isSubmitted) "Сдано" else "Не сдано",
                            style = if (item.isSubmitted) BadgeStyle.Success else BadgeStyle.Danger,
                        )
                    }
                    val parts = listOfNotNull(
                        item.assignedAt?.let { "Назначено: ${Fmt.dateTime(it)}" },
                        item.submittedAt?.let { "Сдано: ${Fmt.dateTime(it)}" },
                    )
                    if (parts.isNotEmpty()) {
                        Text(parts.joinToString(" · "), color = colors.textDim, fontSize = EgeDims.fsXs,
                            modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
        if (isLoading) {
            item { LoadingStateView("Загружаем...") }
        } else if (hasMore) {
            item {
                SecondaryButton(
                    text = "Загрузить ещё",
                    onClick = { scope.launch { loadMore() } },
                    modifier = Modifier.fillMaxWidth().testTag("loadMore"),
                )
            }
        }
    }
}

/** Выполнение ДЗ по токену — порт HomeworkRunView.swift. */
@Composable
private fun HomeworkRunScreen(app: AppState, token: String, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var phase by remember { mutableStateOf<HwRunPhase>(HwRunPhase.Loading) }
    val answers = remember { mutableStateMapOf<String, String>() }
    var startedAt by remember { mutableStateOf(System.currentTimeMillis()) }
    var showConfirm by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        phase = HwRunPhase.Loading
        try {
            val homework = app.homework.homework(token)
            if (homework.isActive == false) {
                phase = HwRunPhase.Error("Ссылка на это ДЗ больше не активна."); return
            }
            val refs = homework.questionRefs
            if (refs.isEmpty()) {
                phase = HwRunPhase.Error("Состав ДЗ пуст. Возможно, это session-ссылка — откройте её в веб-версии."); return
            }
            val questions = app.content.buildQuestions(refs)
            if (questions.isEmpty()) {
                phase = HwRunPhase.Error("Не удалось загрузить условия задач. Проверьте интернет."); return
            }
            val studentName = app.profile?.hwStudentName ?: "Ученик"
            val started = app.homework.startAttempt(token, studentName)
            if (started.alreadyExists == true) {
                val attempt = runCatching { app.homework.attempt(token) }.getOrNull()
                if (attempt?.isFinished == true && attempt.payload?.questions?.isNotEmpty() == true) {
                    phase = HwRunPhase.Result(
                        title = attempt.homeworkTitle ?: attempt.payload?.title ?: "Домашнее задание",
                        correct = attempt.correct ?: 0, total = attempt.total ?: 0,
                        durationMs = attempt.durationMs, items = attempt.payload?.questions.orEmpty(),
                        questions = questions, justSubmitted = false,
                    )
                    return
                }
            }
            startedAt = System.currentTimeMillis()
            phase = HwRunPhase.Run(homework.title ?: "Домашнее задание", started.resolvedAttemptId, homework.homeworkId, questions)
        } catch (e: Exception) {
            phase = HwRunPhase.Error(e.message ?: "Не удалось открыть ДЗ.")
        }
    }

    fun submit() {
        val run = phase as? HwRunPhase.Run ?: return
        val attemptId = run.attemptId ?: run { phase = HwRunPhase.Error("Не удалось начать попытку."); return }
        isSubmitting = true
        val finishedAt = System.currentTimeMillis()
        val durationMs = (finishedAt - startedAt).toInt()
        val perQ = if (run.questions.isEmpty()) 0 else durationMs / run.questions.size
        val items = run.questions.map { q ->
            val c = AnswerChecker.check(q.spec, answers[q.questionId] ?: "")
            AttemptQuestion(
                questionId = q.questionId, topicId = q.topicId, correct = c.correct,
                chosenText = c.chosenText, correctText = c.correctText,
                normalizedText = c.normalizedText, timeMs = perQ, difficulty = q.difficulty,
            )
        }
        val correct = items.count { it.correct == true }
        scope.launch {
            try {
                val result = app.homework.submitAttempt(
                    attemptId = attemptId,
                    payload = AttemptPayload(
                        title = run.title, homeworkId = run.homeworkId,
                        studentName = app.profile?.hwStudentName, questions = items,
                    ),
                    total = items.size, correct = correct, durationMs = durationMs,
                )
                phase = HwRunPhase.Result(
                    title = run.title, correct = result.correct ?: correct,
                    total = result.total ?: items.size, durationMs = result.durationMs,
                    items = items, questions = run.questions, justSubmitted = true,
                )
                app.refreshHomeworkBadge()
            } catch (e: Exception) {
                submitError = e.message // ответы не теряем
            }
            isSubmitting = false
        }
    }

    LaunchedEffect(token) { load() }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        Row(
            Modifier.fillMaxWidth().background(colors.panel).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("‹ Мои ДЗ", color = colors.accent, fontSize = EgeDims.fsMd,
                modifier = Modifier.clickable(onClick = onBack).testTag("hwBack"))
            Spacer(Modifier.weight(1f))
        }
        when (val p = phase) {
            is HwRunPhase.Loading -> LoadingStateView("Проверяем доступ и собираем задачи...")
            is HwRunPhase.Error -> Column(Modifier.padding(16.dp)) {
                ErrorStateView(p.message) { scope.launch { load() } }
            }
            is HwRunPhase.Run -> DrawOverlayHost {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Всего задач: ${p.questions.size}", color = colors.textDim, fontSize = EgeDims.fsMd)
                            Spacer(Modifier.weight(1f))
                            PdfExportButton(p.questions, defaultTitle = p.title)
                        }
                    }
                    itemsIndexed(p.questions, key = { _, q -> q.questionId }) { idx, q ->
                        QuestionRunCard(idx, q, answers[q.questionId] ?: "") { answers[q.questionId] = it }
                    }
                    item {
                        val empty = p.questions.count { (answers[it.questionId] ?: "").trim().isEmpty() }
                        PrimaryButton(
                            text = "Завершить",
                            onClick = { if (empty > 0) showConfirm = true else submit() },
                            enabled = !isSubmitting, loading = isSubmitting,
                            modifier = Modifier.padding(top = 8.dp).testTag("hwFinish"),
                        )
                    }
                }
            }
            is HwRunPhase.Result -> HwResultContent(app, p)
        }
    }

    if (showConfirm) {
        val run = phase as? HwRunPhase.Run
        val empty = run?.questions?.count { (answers[it.questionId] ?: "").trim().isEmpty() } ?: 0
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            containerColor = colors.panel,
            title = { Text("Не заполнено $empty из ${run?.questions?.size ?: 0}. Сдать домашнее задание?", color = colors.text) },
            confirmButton = {
                TextButton(onClick = { showConfirm = false; submit() }, modifier = Modifier.testTag("hwConfirm")) {
                    Text("Сдать", color = colors.danger)
                }
            },
            dismissButton = { TextButton(onClick = { showConfirm = false }) { Text("Продолжить решать", color = colors.textDim) } },
        )
    }
    if (submitError != null) {
        AlertDialog(
            onDismissRequest = { submitError = null },
            containerColor = colors.panel,
            title = { Text("Не удалось сдать ДЗ", color = colors.text) },
            text = { Text(submitError!!, color = colors.textDim) },
            confirmButton = { TextButton(onClick = { submitError = null; submit() }) { Text("Повторить", color = colors.accent) } },
            dismissButton = { TextButton(onClick = { submitError = null }) { Text("Отмена", color = colors.textDim) } },
        )
    }
}

@Composable
private fun HwResultContent(app: AppState, p: HwRunPhase.Result) {
    val colors = EgeTheme.colors
    var onlyWrong by remember { mutableStateOf(false) }
    var analogTarget by remember { mutableStateOf<AttemptQuestion?>(null) }
    val wrong = p.items.count { it.correct != true }
    val visible = p.items.mapIndexed { i, it -> i to it }.filter { !onlyWrong || it.second.correct != true }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (p.justSubmitted) {
            item {
                val pct = if (p.total > 0) (p.correct.toDouble() / p.total * 100).roundToInt() else 0
                Text(
                    "ДЗ сдано! Верно ${p.correct} из ${p.total}. Точность $pct%.",
                    color = colors.success, fontSize = EgeDims.fsMd, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.fillMaxWidth().background(colors.successBg).padding(14.dp).testTag("hwSubmitted"),
                )
            }
        }
        item { Text("Отчет и статистика", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
        item { AttemptSummaryHeader(p.correct, p.total, p.durationMs) }
        if (wrong > 0) {
            item {
                SecondaryButton(
                    text = if (onlyWrong) "Все задачи" else "Только неверные ($wrong)",
                    onClick = { onlyWrong = !onlyWrong },
                )
            }
        }
        itemsIndexed(visible, key = { _, pr -> pr.second.questionId ?: pr.first.toString() }) { _, pr ->
            val (idx, item) = pr
            val q = p.questions.firstOrNull { it.questionId == item.questionId }
            QuestionReviewCard(idx, item, q?.stem, q?.figure,
                onAnalog = if (item.questionId != null && item.topicId != null) { { analogTarget = item } } else null)
        }
    }

    analogTarget?.let { t ->
        if (t.questionId != null && t.topicId != null) {
            AnalogRunSheet(app, t.topicId!!, t.questionId!!) { analogTarget = null }
        }
    }
}

private sealed class HwRunPhase {
    data object Loading : HwRunPhase()
    data class Error(val message: String) : HwRunPhase()
    data class Run(
        val title: String, val attemptId: String?, val homeworkId: String, val questions: List<RunQuestion>,
    ) : HwRunPhase()
    data class Result(
        val title: String, val correct: Int, val total: Int, val durationMs: Int?,
        val items: List<AttemptQuestion>, val questions: List<RunQuestion>, val justSubmitted: Boolean,
    ) : HwRunPhase()
}
