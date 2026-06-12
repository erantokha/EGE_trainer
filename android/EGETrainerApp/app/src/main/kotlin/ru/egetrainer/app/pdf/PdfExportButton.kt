package ru.egetrainer.app.pdf

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.core.models.RunQuestion

/**
 * Кнопка «PDF» с диалогом параметров (заголовок, с ответами) и share —
 * порт PDFExportButton.swift (диалог печати print_btn.js).
 */
@Composable
fun PdfExportButton(
    questions: List<RunQuestion>,
    defaultTitle: String = "",
    answersDefault: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = EgeTheme.colors
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var showOptions by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf(defaultTitle) }
    var withAnswers by remember { mutableStateOf(answersDefault) }
    var isGenerating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Text(
        "PDF",
        color = if (questions.isEmpty()) colors.textDim else colors.accent,
        fontSize = EgeDims.fsMd,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clickable(enabled = questions.isNotEmpty()) {
                title = defaultTitle; withAnswers = answersDefault; error = null; showOptions = true
            }
            .padding(horizontal = 8.dp)
            .testTag("pdfButton"),
    )

    if (showOptions) {
        AlertDialog(
            onDismissRequest = { showOptions = false },
            containerColor = colors.panel,
            title = { Text("Экспорт в PDF", color = colors.text) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = title, onValueChange = { title = it },
                        placeholder = { Text("Заголовок (необязательно)", color = colors.textDim) },
                        singleLine = true, shape = RoundedCornerShape(EgeDims.radiusSm),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = colors.text, unfocusedTextColor = colors.text,
                            focusedContainerColor = colors.panel, unfocusedContainerColor = colors.panel,
                            focusedBorderColor = colors.accent, unfocusedBorderColor = colors.border, cursorColor = colors.accent,
                        ),
                        modifier = Modifier.fillMaxWidth().testTag("pdfTitle"),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("С ответами", color = colors.textDim, fontSize = EgeDims.fsMd)
                        Switch(withAnswers, { withAnswers = it },
                            colors = SwitchDefaults.colors(checkedTrackColor = colors.accent),
                            modifier = Modifier.testTag("pdfAnswers"))
                    }
                    error?.let { Text(it, color = colors.danger, fontSize = EgeDims.fsSm) }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        isGenerating = true; error = null
                        scope.launch {
                            try {
                                PdfExporter.printViaSystem(ctx, title, questions, withAnswers)
                                showOptions = false
                            } catch (e: Exception) {
                                error = "Не удалось создать PDF: ${e.message}"
                            }
                            isGenerating = false
                        }
                    },
                    enabled = !isGenerating,
                    modifier = Modifier.testTag("pdfCreate"),
                ) { Text(if (isGenerating) "Готовим PDF..." else "Создать PDF", color = colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = { showOptions = false }) { Text("Закрыть", color = colors.textDim) }
            },
        )
    }
}
