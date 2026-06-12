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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.StatusBadge
import ru.egetrainer.app.screens.shared.AttemptSummaryHeader
import ru.egetrainer.app.screens.shared.QuestionReviewCard
import ru.egetrainer.core.models.AnalyticsScreen
import ru.egetrainer.core.models.Counter
import ru.egetrainer.core.models.Figure
import ru.egetrainer.core.models.HomeworkAttempt
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.StudentAttemptRow
import ru.egetrainer.core.models.StudentListItem
import kotlin.math.roundToInt

/** Карточка ученика — порт StudentCardView.swift: метрики, история работ, отвязка. */
@Composable
fun StudentCardScreen(app: AppState, student: StudentListItem, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var attempts by remember { mutableStateOf<List<StudentAttemptRow>>(emptyList()) }
    var analytics by remember { mutableStateOf<AnalyticsScreen?>(null) }
    var metricsDays by remember { mutableStateOf(30) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showAll by remember { mutableStateOf(false) }
    var attemptReview by remember { mutableStateOf<String?>(null) }
    var showUnlink by remember { mutableStateOf(false) }
    var unlinkError by remember { mutableStateOf<String?>(null) }
    var showFullStats by remember { mutableStateOf(false) }

    suspend fun loadAnalytics() {
        analytics = runCatching { app.student.analytics("teacher", student.studentId, metricsDays) }.getOrNull()
    }
    suspend fun load() {
        isLoading = attempts.isEmpty()
        errorMessage = null
        runCatching { app.teacher.studentAttempts(student.studentId) }
            .onSuccess { attempts = it }.onFailure { errorMessage = it.message }
        isLoading = false
        loadAnalytics()
    }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(metricsDays) { if (analytics != null) loadAnalytics() }

    if (showFullStats) {
        Column(Modifier.fillMaxSize().background(colors.bg)) {
            FlowHeaderC("Статистика ученика") { showFullStats = false }
            ru.egetrainer.app.screens.stats.StatsScreen(app, studentId = student.studentId)
        }
        return
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        FlowHeaderC("Карточка ученика", onBack)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                EgeCard {
                    Text(student.displayName, color = colors.text, fontSize = EgeDims.fsXl, fontWeight = FontWeight.Bold)
                    val sub = listOfNotNull(student.studentGrade?.let { "$it класс" }, student.email).joinToString("  ")
                    if (sub.isNotEmpty()) Text(sub, color = colors.textDim, fontSize = EgeDims.fsXs)
                }
            }
            // Метрики
            item {
                EgeCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Метрики", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        MetricsDaysDropdown(metricsDays) { metricsDays = it }
                    }
                    val o = analytics?.overall
                    if (o != null) {
                        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            metricCell(colors, "Последние 10", counterText(o.last10))
                            metricCell(colors, "За период", counterText(o.period))
                            metricCell(colors, "Всё время", counterText(o.allTime))
                        }
                    } else {
                        Text("Статистика загружается...", color = colors.textDim, fontSize = EgeDims.fsXs,
                            modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
            // Работы
            item {
                EgeCard {
                    Text("Выполненные работы", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
                    when {
                        isLoading -> LoadingStateView("Загрузка...")
                        errorMessage != null -> Text(errorMessage!!, color = colors.danger, fontSize = EgeDims.fsMd)
                        attempts.isEmpty() -> Text("Ученик ещё не сдал ни одной работы.", color = colors.textDim,
                            fontSize = EgeDims.fsMd, modifier = Modifier.padding(top = 6.dp))
                        else -> {
                            val list = if (showAll) attempts else attempts.take(5)
                            list.forEach { a -> AttemptRow(a) { attemptReview = a.attemptId } }
                            if (attempts.size > 5 && !showAll) {
                                Text("Показать все (${attempts.size})", color = colors.accent, fontSize = EgeDims.fsMd,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(top = 6.dp).clickable { showAll = true })
                            }
                        }
                    }
                }
            }
            item {
                Box(Modifier.clickable { showFullStats = true }.testTag("fullStats")) {
                    EgeCard(padding = 14.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Полная статистика ученика", color = colors.accent, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                            Spacer(Modifier.weight(1f))
                            Text("›", color = colors.textDim, fontSize = EgeDims.fsLg)
                        }
                    }
                }
            }
            unlinkError?.let { item { Text(it, color = colors.danger, fontSize = EgeDims.fsXs) } }
            item {
                Text("Отвязать ученика", color = colors.danger, fontSize = EgeDims.fsXs,
                    modifier = Modifier.clickable { showUnlink = true }.testTag("unlinkBtn"))
            }
        }
    }

    val reviewId = attemptReview
    if (reviewId != null) {
        AttemptReviewSheet(app, reviewId) { attemptReview = null }
    }
    if (showUnlink) {
        AlertDialog(
            onDismissRequest = { showUnlink = false },
            containerColor = colors.panel,
            title = { Text("Отвязать ученика ${student.displayName}?", color = colors.text) },
            text = { Text("Вы перестанете видеть его статистику и назначать ДЗ.", color = colors.textDim) },
            confirmButton = {
                TextButton(onClick = {
                    showUnlink = false
                    scope.launch {
                        try { app.teacher.removeStudent(student.studentId); onBack() }
                        catch (e: Exception) { unlinkError = e.message }
                    }
                }) { Text("Отвязать", color = colors.danger) }
            },
            dismissButton = { TextButton(onClick = { showUnlink = false }) { Text("Отмена", color = colors.textDim) } },
        )
    }
}

private fun counterText(c: Counter?): String {
    if (c == null || c.total == 0) return "—"
    return "${c.correct}/${c.total} · ${(c.correct.toDouble() / c.total * 100).roundToInt()}%"
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.metricCell(
    colors: ru.egetrainer.app.designsystem.EgeColors, title: String, value: String,
) {
    Column(
        Modifier.weight(1f).clip(RoundedCornerShape(EgeDims.radiusSm)).background(colors.surface2).padding(8.dp)
    ) {
        Text(title, color = colors.textDim, fontSize = EgeDims.fs2xs)
        Text(value, color = colors.text, fontSize = EgeDims.fsSm, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AttemptRow(a: StudentAttemptRow, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    val correct = a.correct ?: 0
    val total = a.total ?: 0
    val good = total > 0 && correct.toDouble() / total >= 0.5
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 6.dp).testTag("attempt_${a.attemptId}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(a.homeworkTitle ?: "Работа", color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
            Text(Fmt.dateTime(a.finishedAt), color = colors.textDim, fontSize = EgeDims.fsXs)
        }
        StatusBadge("$correct/$total", if (good) BadgeStyle.Success else BadgeStyle.Danger)
        Text(" ›", color = colors.textDim, fontSize = EgeDims.fsMd)
    }
}

@Composable
private fun MetricsDaysDropdown(value: Int, onSelect: (Int) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Text("$value дн ▾", color = colors.accent, fontSize = EgeDims.fsSm,
            modifier = Modifier.clickable { open = true }.testTag("metricsDays"))
        DropdownMenu(open, { open = false }) {
            listOf(7, 14, 30, 90).forEach { d ->
                DropdownMenuItem(text = { Text("$d дней") }, onClick = { onSelect(d); open = false })
            }
        }
    }
}

/** Просмотр попытки ученика — порт AttemptReviewView.swift (полноэкранно). */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AttemptReviewSheet(app: AppState, attemptId: String, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    var attempt by remember { mutableStateOf<HomeworkAttempt?>(null) }
    var stems by remember { mutableStateOf<Map<String, Pair<String, Figure?>>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(attemptId) {
        isLoading = true
        try {
            val a = app.homework.attemptForTeacher(attemptId)
            attempt = a
            val refs = a.payload?.questions.orEmpty().mapNotNull { q ->
                q.questionId?.let { QuestionRef(q.topicId ?: "", it) }
            }
            runCatching { app.content.buildQuestions(refs) }.getOrNull()?.let { qs ->
                stems = qs.associate { it.questionId to (it.stem to it.figure) }
            }
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
    }

    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onBack,
        sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.bg,
    ) {
        val a = attempt
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            when {
                isLoading -> item { LoadingStateView("Загружаем результат...") }
                errorMessage != null -> item { Text(errorMessage!!, color = colors.danger, fontSize = EgeDims.fsMd) }
                a != null -> {
                    val items = a.payload?.questions.orEmpty()
                    val correct = a.correct ?: items.count { it.correct == true }
                    val total = a.total ?: items.size
                    item {
                        Text(a.homeworkTitle ?: a.payload?.title ?: "Работа", color = colors.text,
                            fontSize = EgeDims.fsXl, fontWeight = FontWeight.Bold)
                        a.studentName?.let { Text("Ученик: $it", color = colors.textDim, fontSize = EgeDims.fsMd) }
                        a.finishedAt?.let { Text("Сдано: ${Fmt.dateTime(it)}", color = colors.textDim, fontSize = EgeDims.fsXs) }
                    }
                    item { AttemptSummaryHeader(correct, total, a.durationMs) }
                    itemsIndexed(items, key = { i, it -> it.questionId ?: i.toString() }) { idx, item ->
                        QuestionReviewCard(idx, item, stems[item.questionId]?.first, stems[item.questionId]?.second, onAnalog = null)
                    }
                }
            }
        }
    }
}

@Composable
private fun FlowHeaderC(title: String, onBack: () -> Unit) {
    val colors = EgeTheme.colors
    Row(
        Modifier.fillMaxWidth().background(colors.panel).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("‹ Назад", color = colors.accent, fontSize = EgeDims.fsMd,
            modifier = Modifier.clickable(onClick = onBack).testTag("cardBack"))
        Spacer(Modifier.weight(1f))
        Text(title, color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
    }
}
