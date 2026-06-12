package ru.egetrainer.app.screens.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.egetrainer.app.AppState
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.FigureView
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.MathText
import ru.egetrainer.core.models.ProtoLast3Stat
import ru.egetrainer.core.services.ContentService
import ru.egetrainer.core.services.StudentPickEngine.ProtoPick
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/**
 * Модалка выбора прототипов внутри подтемы — порт #protoPickerModal веба и
 * ProtoPickerSheet.swift: карточки уникальных прототипов (превью условия),
 * степперы с капом, бейджи «X/3» и давности (WMB3/WMB5, антифлеш WFX1).
 * studentId == null — self-режим (proto_last3_for_self_v1).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtoPickerSheet(
    app: AppState,
    topicId: String,
    topicTitle: String,
    studentId: String?,
    protoCounts: Map<String, ProtoPick>,
    onProtoCounts: (Map<String, ProtoPick>) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = EgeTheme.colors
    var cards by remember { mutableStateOf<List<ContentService.ProtoCard>>(emptyList()) }
    var stats by remember { mutableStateOf<Map<String, ProtoLast3Stat>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(topicId) {
        // Антифлеш (WFX1): прогретая статистика рендерится сразу
        app.protoStats.get(studentId ?: "self", topicId)?.let { stats = it }
        try {
            val topic = app.content.topicEntry(topicId)
            if (topic == null) {
                errorMessage = "Тема не найдена в каталоге."
            } else {
                cards = app.content.protoCards(topic)
            }
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
        if (stats.isEmpty()) {
            stats = app.protoStats.load(studentId, topicId)
        }
    }

    val selectedTotal = cards.sumOf { protoCounts[it.id]?.count ?: 0 }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.bg,
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                topicTitle,
                color = colors.text,
                fontSize = EgeDims.fsLg,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text(
                "Выбрано: $selectedTotal",
                color = colors.accent,
                fontSize = EgeDims.fsMd,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.testTag("protoSelectedTotal"),
            )
        }
        LazyColumn(
            modifier = Modifier
                .fillMaxHeight(0.85f)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (isLoading) {
                item { LoadingStateView("Загружаем прототипы...") }
            } else if (errorMessage != null) {
                item { Text(errorMessage!!, color = colors.danger, fontSize = EgeDims.fsMd) }
            } else {
                items(cards, key = { it.id }) { card ->
                    ProtoCardRow(
                        card = card,
                        stat = stats[card.id],
                        count = protoCounts[card.id]?.count ?: 0,
                        onDelta = { delta ->
                            val cur = protoCounts[card.id]?.count ?: 0
                            val next = (cur + delta).coerceIn(0, card.cap)
                            val updated = protoCounts.toMutableMap()
                            if (next == 0) updated.remove(card.id)
                            else updated[card.id] = ProtoPick(card.topicId, next)
                            onProtoCounts(updated)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProtoCardRow(
    card: ContentService.ProtoCard,
    stat: ProtoLast3Stat?,
    count: Int,
    onDelta: (Int) -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard(padding = 14.dp) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                card.title,
                color = colors.text,
                fontSize = EgeDims.fsMd,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            ProtoBadges(stat)
        }
        Box(Modifier.padding(top = 8.dp)) {
            MathText(card.previewStem, fontSizeSp = 15)
        }
        FigureView(card.previewFigure, Modifier.padding(top = 8.dp), maxHeight = 140.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("вариантов: ${card.cap}", color = colors.textDim, fontSize = EgeDims.fsXs)
            Spacer(Modifier.weight(1f))
            CountStepper(count = count, onChange = onDelta, tag = "protoStepper_${card.id}")
        }
    }
}

/** Бейджи WMB3/WMB5: «X/3» цветом badgeClassByPct + дата давности (заливки, белый текст). */
@Composable
private fun ProtoBadges(stat: ProtoLast3Stat?) {
    val colors = EgeTheme.colors
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val t = stat?.last3Total ?: 0
        if (stat != null && t > 0) {
            val correct = stat.last3Correct ?: 0
            val pct = (correct.toDouble() / t * 100).roundToInt()
            BadgePill("$correct/$t", pctFill(pct))
        } else {
            Text(
                "не решал",
                color = colors.textDim,
                fontSize = EgeDims.fs2xs,
                modifier = Modifier
                    .clip(RoundedCornerShape(EgeDims.radiusPill))
                    .background(colors.surface2)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
        val lastAt = stat?.lastAttemptAt
        if (lastAt != null) {
            val instant = Fmt.parseISO(lastAt)
            if (instant != null) {
                val days = (System.currentTimeMillis() - instant.toEpochMilli()) / 86_400_000.0
                val fill = when {
                    days < 7 -> EgeTheme.colors.success
                    days < 14 -> Color(0xFF84CC16)
                    days <= 30 -> Color(0xFFD97706)
                    else -> EgeTheme.colors.danger
                }
                val text = DateTimeFormatter.ofPattern("dd.MM.yy")
                    .format(instant.atZone(ZoneId.systemDefault()))
                BadgePill(text, fill)
            }
        }
    }
}

@Composable
private fun BadgePill(text: String, fill: Color) {
    Text(
        text,
        color = Color.White,
        fontSize = EgeDims.fs2xs,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(EgeDims.radiusPill))
            .background(fill)
            .padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** badgeClassByPct (заливки модалки): ≥90 зелёный, ≥70 салатовый, ≥50 жёлтый, <50 красный. */
@Composable
private fun pctFill(pct: Int): Color = when {
    pct >= 90 -> EgeTheme.colors.success
    pct >= 70 -> Color(0xFF84CC16)
    pct >= 50 -> Color(0xFFD97706)
    else -> EgeTheme.colors.danger
}

/** Счётчик «− N +» как на вебе (порт CountStepper). */
@Composable
fun CountStepper(count: Int, onChange: (Int) -> Unit, tag: String = "stepper") {
    val colors = EgeTheme.colors
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        StepperButton("−", "${tag}_minus") { onChange(-1) }
        Box(
            modifier = Modifier
                .width(44.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(EgeDims.radiusSm))
                .background(colors.panel)
                .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusSm)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "$count",
                color = colors.text,
                fontSize = EgeDims.fsLg,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("${tag}_count"),
            )
        }
        StepperButton("+", "${tag}_plus") { onChange(1) }
    }
}

@Composable
private fun StepperButton(label: String, tag: String, onClick: () -> Unit) {
    val colors = EgeTheme.colors
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(CircleShape)
            .background(colors.panel)
            .border(1.dp, colors.border, CircleShape)
            .clickable(onClick = onClick)
            .testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
    }
}
