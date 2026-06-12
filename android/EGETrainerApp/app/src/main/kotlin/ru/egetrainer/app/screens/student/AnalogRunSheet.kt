package ru.egetrainer.app.screens.student

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import ru.egetrainer.app.AppState
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EmptyStateView
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.screens.shared.QuestionReviewCard
import ru.egetrainer.app.screens.shared.QuestionRunCard
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.AnswerChecker

/**
 * «Решить аналог» — порт AnalogRunView.swift (tasks/analog.js): другой
 * вариант того же типа, проверка, разбор, «Решить ещё аналог», запись с
 * meta.kind='hw_analog' + base/analog id.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalogRunSheet(
    app: AppState,
    topicId: String,
    baseQuestionId: String,
    onDismiss: () -> Unit,
) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var question by remember { mutableStateOf<RunQuestion?>(null) }
    var usedIds by remember { mutableStateOf(setOf<String>()) }
    var answer by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AttemptQuestion?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var noMoreVariants by remember { mutableStateOf(false) }
    var startedAt by remember { mutableStateOf(System.currentTimeMillis()) }
    var loadSeq by remember { mutableIntStateOf(0) }

    LaunchedEffect(loadSeq) {
        isLoading = true
        result = null
        answer = ""
        startedAt = System.currentTimeMillis()
        try {
            val q = app.content.analogQuestion(topicId, baseQuestionId, usedIds)
            if (q != null) {
                usedIds = usedIds + q.questionId
                question = q
            } else {
                noMoreVariants = true
            }
        } catch (e: Exception) {
            noMoreVariants = true
        }
        isLoading = false
    }

    fun check(q: RunQuestion) {
        val finishedAt = System.currentTimeMillis()
        val check = AnswerChecker.check(q.spec, answer)
        val item = AttemptQuestion(
            questionId = q.questionId, topicId = q.topicId, correct = check.correct,
            chosenText = check.chosenText, correctText = check.correctText,
            normalizedText = check.normalizedText,
            timeMs = (finishedAt - startedAt).toInt(), difficulty = q.difficulty,
        )
        result = item
        scope.launch {
            // запись как на вебе: meta.kind='hw_analog' + base/analog id
            runCatching {
                app.student.writeTrainingAttempt(
                    questions = listOf(item),
                    startedAtMs = startedAt,
                    finishedAtMs = finishedAt,
                    topicIds = listOf(q.topicId),
                    extraMeta = JsonObject(
                        mapOf(
                            "kind" to JsonPrimitive("hw_analog"),
                            "base_question_id" to JsonPrimitive(baseQuestionId),
                            "analog_question_id" to JsonPrimitive(q.questionId),
                        )
                    ),
                )
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.bg,
    ) {
        Column(
            Modifier
                .fillMaxHeight(0.9f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            when {
                isLoading -> LoadingStateView("Подбираем аналог...")
                noMoreVariants -> EmptyStateView(
                    title = "Аналогов больше нет",
                    subtitle = "Вы решили все варианты этого задания.",
                )
                else -> question?.let { q ->
                    val res = result
                    if (res != null) {
                        QuestionReviewCard(index = 0, item = res, stem = q.stem, figure = q.figure)
                        PrimaryButton(
                            text = "Решить ещё аналог",
                            onClick = { loadSeq += 1 },
                            modifier = Modifier.testTag("analogNext"),
                        )
                    } else {
                        QuestionRunCard(index = 0, question = q, answer = answer, onAnswer = { answer = it })
                        PrimaryButton(
                            text = "Проверить",
                            onClick = { check(q) },
                            enabled = answer.trim().isNotEmpty(),
                            modifier = Modifier.testTag("analogCheck"),
                        )
                    }
                }
            }
        }
    }
}
