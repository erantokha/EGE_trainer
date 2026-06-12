package ru.egetrainer.app.screens.student

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.egetrainer.app.AppState
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.app.screens.shared.AttemptSummaryHeader
import ru.egetrainer.app.screens.shared.QuestionReviewCard
import ru.egetrainer.app.screens.shared.QuestionRunCard
import ru.egetrainer.app.designsystem.DrawOverlayHost
import ru.egetrainer.app.pdf.PdfExportButton
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.AnswerChecker
import ru.egetrainer.core.services.TrainingDraftStore

/** Параметры запуска тренировки (порт RunPayload). */
data class RunPayload(
    val questions: List<RunQuestion>,
    val shuffled: Boolean,
    val initialAnswers: Map<String, String> = emptyMap(),
)

/**
 * Тренировка — порт TrainingRunView.swift: прохождение задач, локальная
 * проверка, черновик при каждом вводе и «Прервать», запись попытки
 * write_answer_events_v1, экран результата с фильтром «только неверные».
 */
@Composable
fun TrainingRunScreen(app: AppState, payload: RunPayload, onClose: () -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    val questions = payload.questions

    val answers = remember { mutableStateMapOf<String, String>().apply { putAll(payload.initialAnswers) } }
    val startedAt = remember { System.currentTimeMillis() }
    var showConfirm by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<AttemptQuestion>?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }

    fun saveDraft() {
        app.draftStore.save(
            TrainingDraftStore.Draft(
                refs = questions.map { QuestionRef(it.topicId, it.questionId) },
                answers = answers.toMap(),
                mode = "list",
                shuffle = payload.shuffled,
                savedAtMs = System.currentTimeMillis(),
            )
        )
    }

    fun finish() {
        isSubmitting = true
        val finishedAt = System.currentTimeMillis()
        val perQuestionMs = if (questions.isEmpty()) 0
        else ((finishedAt - startedAt) / questions.size).toInt()
        val items = questions.map { q ->
            val check = AnswerChecker.check(q.spec, answers[q.questionId] ?: "")
            AttemptQuestion(
                questionId = q.questionId, topicId = q.topicId, correct = check.correct,
                chosenText = check.chosenText, correctText = check.correctText,
                normalizedText = check.normalizedText, timeMs = perQuestionMs,
                difficulty = q.difficulty,
            )
        }
        scope.launch {
            try {
                app.student.writeTrainingAttempt(
                    questions = items,
                    startedAtMs = startedAt,
                    finishedAtMs = finishedAt,
                    topicIds = questions.map { it.topicId }.distinct(),
                )
            } catch (e: Exception) {
                saveError = e.message
            }
            app.draftStore.clear()
            results = items
            isSubmitting = false
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg),
    ) {
        // Шапка: Прервать/Закрыть + заголовок
        Row(
            Modifier
                .fillMaxWidth()
                .background(colors.panel)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(
                if (results == null) "Прервать" else "Закрыть",
                color = colors.accent,
                fontSize = EgeDims.fsMd,
                modifier = Modifier
                    .clickable {
                        if (results == null) saveDraft()
                        onClose()
                    }
                    .testTag("trainingClose"),
            )
            Spacer(Modifier.weight(1f))
            Text(
                "Тренировка",
                color = colors.text,
                fontSize = EgeDims.fsLg,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.weight(1f))
            if (results == null) PdfExportButton(questions, defaultTitle = "Тренировка")
        }

        val res = results
        if (res != null) {
            TrainingReviewContent(
                app = app,
                items = res,
                questions = questions,
                durationMs = (System.currentTimeMillis() - startedAt).toInt(),
                saveError = saveError,
                onNewSession = onClose,
            )
        } else {
            DrawOverlayHost {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text("Всего задач: ${questions.size}", color = colors.textDim, fontSize = EgeDims.fsMd)
                }
                itemsIndexed(questions, key = { _, q -> q.questionId }) { idx, q ->
                    QuestionRunCard(
                        index = idx,
                        question = q,
                        answer = answers[q.questionId] ?: "",
                        onAnswer = {
                            answers[q.questionId] = it
                            saveDraft()
                        },
                    )
                }
                item {
                    val emptyCount = questions.count { (answers[it.questionId] ?: "").trim().isEmpty() }
                    PrimaryButton(
                        text = "Завершить",
                        onClick = { if (emptyCount > 0) showConfirm = true else finish() },
                        enabled = !isSubmitting,
                        loading = isSubmitting,
                        modifier = Modifier
                            .padding(top = 8.dp)
                            .testTag("trainingFinish"),
                    )
                }
            }
            }
        }
    }

    if (showConfirm) {
        val emptyCount = questions.count { (answers[it.questionId] ?: "").trim().isEmpty() }
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            containerColor = colors.panel,
            title = {
                Text(
                    "Не заполнено $emptyCount из ${questions.size}. Завершить тренировку?",
                    color = colors.text, fontSize = EgeDims.fsLg,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { showConfirm = false; finish() },
                    modifier = Modifier.testTag("confirmFinish"),
                ) { Text("Завершить", color = colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }) {
                    Text("Продолжить решать", color = colors.textDim)
                }
            },
        )
    }
}

/**
 * Отчёт тренировки — порт TrainingReviewScreen.swift: сводка, «Только
 * неверные (N)», карточки разбора с видео и «Решить аналог», «Новая сессия».
 */
@Composable
fun TrainingReviewContent(
    app: AppState,
    items: List<AttemptQuestion>,
    questions: List<RunQuestion>,
    durationMs: Int,
    saveError: String?,
    onNewSession: () -> Unit,
) {
    val colors = EgeTheme.colors
    var onlyWrong by remember { mutableStateOf(false) }
    var analogTarget by remember { mutableStateOf<AttemptQuestion?>(null) }

    val wrongCount = items.count { it.correct != true }
    val indexed = items.mapIndexed { i, it -> Pair(i, it) }
    val visible = if (onlyWrong) indexed.filter { it.second.correct != true } else indexed
    val correct = items.count { it.correct == true }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("Отчет и статистика", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        item { AttemptSummaryHeader(correct, items.size, durationMs) }
        if (saveError != null) {
            item {
                Text(
                    "Результат показан, но не сохранился в статистику: $saveError",
                    color = colors.warnText, fontSize = EgeDims.fsXs,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.warnBg)
                        .padding(10.dp),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (wrongCount > 0) {
                    SecondaryButton(
                        text = if (onlyWrong) "Все задачи" else "Только неверные ($wrongCount)",
                        onClick = { onlyWrong = !onlyWrong },
                        modifier = Modifier.testTag("onlyWrongToggle"),
                    )
                }
                SecondaryButton(
                    text = "Новая сессия",
                    onClick = onNewSession,
                    modifier = Modifier.testTag("newSession"),
                )
            }
        }
        itemsIndexed(visible, key = { _, p -> p.second.questionId ?: p.first.toString() }) { _, pair ->
            val (idx, item) = pair
            val q = questions.firstOrNull { it.questionId == item.questionId }
            QuestionReviewCard(
                index = idx,
                item = item,
                stem = q?.stem,
                figure = q?.figure,
                onAnalog = if (item.questionId != null && item.topicId != null) {
                    { analogTarget = item }
                } else null,
            )
        }
    }

    analogTarget?.let { target ->
        if (target.questionId != null && target.topicId != null) {
            AnalogRunSheet(
                app = app,
                topicId = target.topicId!!,
                baseQuestionId = target.questionId!!,
                onDismiss = { analogTarget = null },
            )
        }
    }
}
