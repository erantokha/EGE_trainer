package ru.egetrainer.app.screens.stats

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
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
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.MetricCard
import ru.egetrainer.app.designsystem.StatusBadge
import ru.egetrainer.core.models.AnalyticsScreen
import kotlin.math.roundToInt

private val DAY_OPTIONS = listOf(7, 14, 30, 90)
private val SOURCE_OPTIONS = listOf("all" to "всё", "hw" to "ДЗ", "test" to "тренировка")

/**
 * Статистика ученика — порт StatsView.swift (tasks/stats.html):
 * период/источник, метрики (последние 10 / период / всё время), покрытие,
 * «Что тренировать сейчас», темы с подтемами. studentId != null — teacher-scope.
 */
@Composable
fun StatsScreen(app: AppState, studentId: String? = null) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()
    var analytics by remember { mutableStateOf<AnalyticsScreen?>(null) }
    var days by remember { mutableStateOf(30) }
    var source by remember { mutableStateOf("all") }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var expandedSections by remember { mutableStateOf<Set<String>>(emptySet()) }

    suspend fun load() {
        isLoading = analytics == null
        errorMessage = null
        try {
            analytics = app.student.analytics(
                scope = if (studentId == null) "self" else "teacher",
                studentId = studentId, days = days, source = source,
            )
        } catch (e: Exception) {
            errorMessage = e.message
        }
        isLoading = false
    }

    LaunchedEffect(days, source) { load() }

    LazyColumn(
        Modifier.fillMaxSize().background(colors.bg),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (studentId == null) {
            item {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text("Статистика", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                LabeledDropdown("ПЕРИОД", "$days дней", DAY_OPTIONS.map { "$it дней" }, "periodDropdown") { idx ->
                    days = DAY_OPTIONS[idx]
                }
                LabeledDropdown("ИСТОЧНИК", SOURCE_OPTIONS.first { it.first == source }.second,
                    SOURCE_OPTIONS.map { it.second }, "sourceDropdown") { idx ->
                    source = SOURCE_OPTIONS[idx].first
                }
            }
        }
        when {
            isLoading -> item { LoadingStateView("Считаем статистику...") }
            errorMessage != null -> item { ErrorStateView(errorMessage!!) { scope.launch { load() } } }
            analytics != null -> statsContent(analytics!!, days, colors.textDim, expandedSections) { id ->
                expandedSections = if (expandedSections.contains(id)) expandedSections - id else expandedSections + id
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.statsContent(
    a: AnalyticsScreen,
    days: Int,
    textDim: androidx.compose.ui.graphics.Color,
    expanded: Set<String>,
    onToggle: (String) -> Unit,
) {
    val topics = a.topics.orEmpty()
    val covered = topics.count { (it.coverage?.unicsAttempted ?: 0) > 0 }

    item {
        Text(
            "Изучено подтем: $covered из ${topics.size}",
            color = textDim, fontSize = 14.sp,
        )
    }
    a.overall?.last10?.let { c ->
        item { MetricCard("Последние 10", "${c.pct ?: 0}%", "Верно/всего: ${c.ratioText}", (c.pct ?: 0) >= 50) }
    }
    a.overall?.period?.let { c ->
        item { MetricCard("$days дней", "${c.pct ?: 0}%", "Верно/всего: ${c.ratioText}", (c.pct ?: 0) >= 50) }
    }
    a.overall?.allTime?.let { c ->
        item { MetricCard("Всё время", "${c.pct ?: 0}%", "Верно/всего: ${c.ratioText}", (c.pct ?: 0) >= 50) }
    }
    item { CoverageCard(a) }
    a.overall?.lastSeenAt?.let { ls ->
        item { Text("Последняя активность: ${Fmt.dateTime(ls)}", color = textDim, fontSize = 12.sp) }
    }
    item { WeakTopicsCard(a) }
    item { TopicsListCard(a, expanded, onToggle) }
}

@Composable
private fun CoverageCard(a: AnalyticsScreen) {
    val colors = EgeTheme.colors
    val attempted = a.topics.orEmpty().sumOf { it.coverage?.unicsAttempted ?: 0 }
    val total = a.topics.orEmpty().sumOf { it.coverage?.unicsTotal ?: 0 }
    EgeCard {
        Text("ПОКРЫТИЕ ТЕМ", color = colors.textDim, fontSize = EgeDims.fsXs, fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 4.dp)) {
            Text("$attempted/$total", color = colors.text, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text(" типов задач", color = colors.textDim, fontSize = EgeDims.fsMd,
                modifier = Modifier.padding(bottom = 4.dp, start = 6.dp))
        }
    }
}

@Composable
private fun WeakTopicsCard(a: AnalyticsScreen) {
    val colors = EgeTheme.colors
    val weak = a.topics.orEmpty()
        .filter { it.derived?.performanceState == "weak" }
        .sortedBy { it.subtopicLast3AvgPct ?: 0.0 }
        .take(5)
    if (weak.isEmpty()) return
    EgeCard {
        Text("Что тренировать сейчас", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.padding(top = 6.dp))
        weak.forEach { topic ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .clip(RoundedCornerShape(EgeDims.radiusSm))
                    .background(colors.bg)
                    .padding(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("${topic.topicId}. ${topic.title ?: ""}", color = colors.text,
                        fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium)
                    topic.coverage?.let { cov ->
                        Text(
                            "Охват ${cov.unicsAttempted ?: 0}/${cov.unicsTotal ?: 0} типов, " +
                                "точность ${(topic.subtopicLast3AvgPct ?: 0.0).roundToInt()}%",
                            color = colors.textDim, fontSize = EgeDims.fsXs,
                        )
                    }
                }
                StatusBadge("Нужно подтянуть", BadgeStyle.Warning)
            }
        }
    }
}

@Composable
private fun TopicsListCard(a: AnalyticsScreen, expanded: Set<String>, onToggle: (String) -> Unit) {
    val colors = EgeTheme.colors
    val sections = a.sections.orEmpty()
    val topics = a.topics.orEmpty()
    EgeCard {
        Text("Темы", color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold)
        sections.forEach { section ->
            Column {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onToggle(section.sectionId) }
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${section.sectionId}. ${section.title ?: ""}", color = colors.text,
                        fontSize = EgeDims.fsMd, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    section.allTime?.pct?.let {
                        Text("$it%", color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(end = 8.dp))
                    }
                    Text(if (expanded.contains(section.sectionId)) "▲" else "▼",
                        color = colors.textDim, fontSize = 10.sp)
                }
                if (expanded.contains(section.sectionId)) {
                    topics.filter { it.sectionId == section.sectionId }.forEach { topic ->
                        Row(Modifier.fillMaxWidth().padding(start = 8.dp, top = 3.dp, bottom = 3.dp)) {
                            Text("${topic.topicId}. ${topic.title ?: ""}", color = colors.text,
                                fontSize = EgeDims.fsXs, modifier = Modifier.weight(1f))
                            val pct = topic.allTime?.pct
                            if (pct != null) {
                                Text("$pct%", color = if (pct >= 50) colors.success else colors.danger,
                                    fontSize = EgeDims.fsXs, fontWeight = FontWeight.SemiBold)
                            } else {
                                Text("—", color = colors.textDim, fontSize = EgeDims.fsXs)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LabeledDropdown(label: String, value: String, options: List<String>, tag: String, onSelect: (Int) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    Column {
        Text(label, color = colors.textDim, fontSize = EgeDims.fs2xs, fontWeight = FontWeight.SemiBold)
        Box {
            Row(
                Modifier
                    .clip(RoundedCornerShape(EgeDims.radiusSm))
                    .background(colors.panel)
                    .clickable { open = true }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .testTag(tag),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(value, color = colors.text, fontSize = EgeDims.fsMd)
                Text(" ▾", color = colors.textDim, fontSize = EgeDims.fsXs)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEachIndexed { idx, opt ->
                    DropdownMenuItem(text = { Text(opt) }, onClick = { onSelect(idx); open = false })
                }
            }
        }
    }
}
