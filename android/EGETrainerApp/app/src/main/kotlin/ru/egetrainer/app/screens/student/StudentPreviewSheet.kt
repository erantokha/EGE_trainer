package ru.egetrainer.app.screens.student

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EmptyStateView
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.screens.shared.PreviewQuestionCard
import ru.egetrainer.core.models.RunQuestion

/**
 * Предпросмотр подборки ученика — порт StudentPreviewSheet.swift (кнопка
 * «Предпросмотр» нижнего бара главной): карточки условий БЕЗ ответов,
 * удаление, «Начать (N)» с оставшимися задачами.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentPreviewSheet(
    initialQuestions: List<RunQuestion>,
    onStart: (List<RunQuestion>) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = EgeTheme.colors
    var questions by remember { mutableStateOf(initialQuestions) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.bg,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxHeight(0.92f)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    "Показано: ${questions.size}",
                    color = colors.textDim,
                    fontSize = EgeDims.fsMd,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.testTag("previewCount"),
                )
            }
            if (questions.isEmpty()) {
                item {
                    EmptyStateView(title = "Подборка пуста", subtitle = "Вернитесь и выберите темы.")
                }
            }
            itemsIndexed(questions, key = { _, q -> q.questionId }) { idx, q ->
                PreviewQuestionCard(
                    index = idx,
                    question = q,
                    answerStyle = null, // ученик ответы не видит
                    onDelete = { questions = questions.filter { it.questionId != q.questionId } },
                )
            }
            if (questions.isNotEmpty()) {
                item {
                    PrimaryButton(
                        text = "Начать (${questions.size})",
                        onClick = { onStart(questions) },
                        modifier = Modifier
                            .padding(top = 6.dp)
                            .testTag("previewStart"),
                    )
                }
            }
        }
    }
}
