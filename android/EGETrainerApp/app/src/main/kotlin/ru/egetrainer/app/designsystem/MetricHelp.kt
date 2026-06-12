package ru.egetrainer.app.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup

/**
 * Подсказки к ключевым метрикам — порт app/ui/metric_help.js (словарь
 * METRIC_HELP, тексты 1-в-1) и MetricHelp.swift (поповер «?»).
 */
object MetricHelp {
    data class Entry(val label: String, val text: String)

    val MAP: Map<String, Entry> = mapOf(
        "coverage" to Entry("Покрытие", "Сколько типов заданий по теме ученик уже решал хотя бы один раз."),
        "form" to Entry("Форма", "Результаты по последним попыткам. Помогает понять, как ученик решает тему сейчас, а не за всё время."),
        "prototype" to Entry("Прототип", "Типовая модель задания ЕГЭ. Внутри одной темы может быть несколько прототипов с разными способами решения."),
        "weak" to Entry("Слабая тема", "Тема или прототип, где низкая точность или мало успешных попыток."),
        "stale" to Entry("Давно не решал", "Ученик давно не возвращался к этой теме или прототипу — стоит повторить."),
        "unstable" to Entry("Нестабильно", "Есть и верные, и неверные решения: результат пока не закрепился."),
        "accuracy" to Entry("Точность", "Доля верных решений среди попыток по этой теме, подтеме или прототипу."),
        "forecast" to Entry("Прогноз ЕГЭ", "Оценка ожидаемого результата на основе текущей статистики в тренажёре. Это не официальный результат, а ориентир для подготовки."),
        "primary" to Entry("Первичный балл", "Балл за задания до перевода в тестовую шкалу ЕГЭ."),
        "secondary" to Entry("Вторичный балл", "Итоговый балл по 100-балльной шкале после перевода первичных баллов."),
    )
}

/** Иконка «?» с поповером-подсказкой (порт .mh-icon / .mh-pop). */
@Composable
fun MetricHelpIcon(key: String, modifier: Modifier = Modifier) {
    val entry = MetricHelp.MAP[key] ?: return
    var open by remember { mutableStateOf(false) }
    val colors = EgeTheme.colors

    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(15.dp)
                .clip(CircleShape)
                .border(1.dp, colors.border, CircleShape)
                .clickable { open = !open },
            contentAlignment = Alignment.Center,
        ) {
            Text("?", color = colors.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        if (open) {
            Popup(onDismissRequest = { open = false }) {
                Column(
                    modifier = Modifier
                        .widthIn(max = 260.dp)
                        .clip(RoundedCornerShape(EgeDims.radiusSm))
                        .background(colors.panel)
                        .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusSm))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text(
                        entry.label,
                        color = colors.text,
                        fontSize = EgeDims.fsSm,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        entry.text,
                        color = colors.text,
                        fontSize = EgeDims.fsSm,
                        lineHeight = 18.sp,
                    )
                }
            }
        }
    }
}
