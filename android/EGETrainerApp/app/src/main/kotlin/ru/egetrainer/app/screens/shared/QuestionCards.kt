package ru.egetrainer.app.screens.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.FigureView
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.MathText
import ru.egetrainer.app.designsystem.RutubePlayerSheet
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.core.models.AttemptQuestion
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.ContentService
import kotlin.math.roundToInt

/** Карточка задачи в режиме прохождения — порт QuestionRunCard (карточки tasks/hw.html). */
@Composable
fun QuestionRunCard(
    index: Int,
    question: RunQuestion,
    answer: String,
    onAnswer: (String) -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard(padding = 14.dp) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(EgeDims.radiusSm))
                    .background(colors.panel)
                    .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusSm)),
                contentAlignment = Alignment.Center,
            ) {
                Text("${index + 1}", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.Bold)
            }
            Box(Modifier.padding(start = 12.dp).weight(1f)) {
                MathText(question.stem)
            }
        }
        FigureView(question.figure, Modifier.padding(top = 10.dp))
        OutlinedTextField(
            value = answer,
            onValueChange = onAnswer,
            placeholder = { Text("Ответ", color = colors.textDim) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            shape = RoundedCornerShape(EgeDims.radiusSm),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = colors.text,
                unfocusedTextColor = colors.text,
                focusedContainerColor = colors.panel,
                unfocusedContainerColor = colors.panel,
                focusedBorderColor = colors.accent,
                unfocusedBorderColor = if (answer.isEmpty()) colors.border else colors.accent,
                cursorColor = colors.accent,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp)
                .testTag("answer_$index"),
        )
    }
}

/** Карточка разбора: верно/неверно, ваш/правильный ответ, видео, «Решить аналог». */
@Composable
fun QuestionReviewCard(
    index: Int,
    item: AttemptQuestion,
    stem: String?,
    figure: ru.egetrainer.core.models.Figure?,
    onAnalog: (() -> Unit)? = null,
) {
    val colors = EgeTheme.colors
    val isCorrect = item.correct == true
    var videoURL by remember(item.questionId) { mutableStateOf<String?>(null) }
    var showVideo by remember { mutableStateOf(false) }

    LaunchedEffect(item.questionId) {
        item.questionId?.let { videoURL = ContentService.shared.videoURL(it) }
    }

    EgeCard(padding = 14.dp) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(EgeDims.radiusSm))
                    .background(colors.panel)
                    .border(2.dp, if (isCorrect) colors.success else colors.danger, RoundedCornerShape(EgeDims.radiusSm)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${index + 1}",
                    color = if (isCorrect) colors.success else colors.danger,
                    fontSize = EgeDims.fsLg,
                    fontWeight = FontWeight.Bold,
                )
            }
            Box(Modifier.padding(start = 12.dp).weight(1f)) {
                if (stem != null) {
                    MathText(stem)
                } else {
                    Text("Задача ${item.questionId ?: ""}", color = colors.textDim, fontSize = EgeDims.fsMd)
                }
            }
        }
        FigureView(figure, Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row {
                Text("Ваш ответ: ", color = colors.text, fontSize = EgeDims.fsMd)
                Text(
                    item.chosenText?.takeIf { it.isNotEmpty() } ?: "—",
                    color = if (isCorrect) colors.success else colors.danger,
                    fontSize = EgeDims.fsMd,
                    fontWeight = FontWeight.Medium,
                )
            }
            Row {
                Text("Правильный ответ: ", color = colors.text, fontSize = EgeDims.fsMd)
                Text(
                    item.correctText ?: "—",
                    color = colors.textDim,
                    fontSize = EgeDims.fsMd,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        Row(
            Modifier.padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            videoURL?.let { url ->
                Text(
                    "▶ Видео-разбор",
                    color = colors.accent,
                    fontSize = EgeDims.fsMd,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(EgeDims.radiusPill))
                        .background(colors.accentLight)
                        .clickable { showVideo = true }
                        .padding(horizontal = 14.dp, vertical = 9.dp)
                        .testTag("videoBtn_$index"),
                )
            }
            if (onAnalog != null) {
                Text(
                    "⟳ Решить аналог",
                    color = colors.accent,
                    fontSize = EgeDims.fsMd,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(EgeDims.radiusPill))
                        .background(colors.accentLight)
                        .clickable(onClick = onAnalog)
                        .padding(horizontal = 14.dp, vertical = 9.dp)
                        .testTag("analogBtn_$index"),
                )
            }
        }
    }

    if (showVideo && videoURL != null) {
        RutubePlayerSheet(videoURL!!) { showVideo = false }
    }
}

/** Сводка результата «X/Y P%» + «Общее время» — как в hw.html. */
@Composable
fun AttemptSummaryHeader(correct: Int, total: Int, durationMs: Int?) {
    val colors = EgeTheme.colors
    val pct = if (total > 0) (correct.toDouble() / total * 100).roundToInt() else 0
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            "$correct/$total $pct%",
            color = colors.text,
            fontSize = EgeDims.fsLg,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(EgeDims.radiusMd))
                .background(if (pct >= 50) colors.successBg else colors.dangerBg)
                .padding(14.dp)
                .testTag("summaryScore"),
        )
        if (durationMs != null) {
            Text(
                "Общее время: ${Fmt.duration(durationMs)}",
                color = colors.text,
                fontSize = EgeDims.fsLg,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(EgeDims.radiusMd))
                    .background(colors.successBg.copy(alpha = 0.6f))
                    .padding(14.dp),
            )
        }
    }
}

/** Карточка предпросмотра — единый вид обеих ролей (порт PreviewQuestionCard). */
@Composable
fun PreviewQuestionCard(
    index: Int,
    question: RunQuestion,
    answerStyle: Boolean? = null, // null — без ответа (ученик); false — скрываемый; true — открытый
    onDelete: (() -> Unit)? = null,
) {
    val colors = EgeTheme.colors
    var answerExpanded by remember { mutableStateOf(false) }
    val answerText = Fmt.answer(question.spec.text, question.spec.value)

    EgeCard(padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(colors.accentLight),
                contentAlignment = Alignment.Center,
            ) {
                Text("${index + 1}", color = colors.accent, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold)
            }
            Text(
                question.topicId,
                color = colors.textDim,
                fontSize = EgeDims.fs2xs,
                modifier = Modifier.padding(start = 8.dp),
            )
            Spacer(Modifier.weight(1f))
            if (onDelete != null) {
                Text(
                    "✕",
                    color = colors.textDim,
                    fontSize = EgeDims.fsMd,
                    modifier = Modifier
                        .clickable(onClick = onDelete)
                        .padding(6.dp)
                        .testTag("previewDelete_$index"),
                )
            }
        }
        Box(Modifier.padding(top = 8.dp)) { MathText(question.stem, fontSizeSp = 15) }
        FigureView(question.figure, Modifier.padding(top = 8.dp), maxHeight = 160.dp)
        if (answerStyle != null) {
            if (answerStyle) {
                Row(Modifier.padding(top = 8.dp)) {
                    Text("Ответ: ", color = colors.textDim, fontSize = EgeDims.fsXs)
                    Text(answerText, color = colors.success, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Bold)
                }
            } else {
                // P6-2: тап-зона во всю ширину
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { answerExpanded = !answerExpanded }
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Ответ", color = colors.textDim, fontSize = EgeDims.fsXs)
                    if (answerExpanded) {
                        Text(
                            "  $answerText",
                            color = colors.success,
                            fontSize = EgeDims.fsMd,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Text(if (answerExpanded) "▲" else "▼", color = colors.textDim, fontSize = 10.sp)
                }
            }
        }
    }
}
