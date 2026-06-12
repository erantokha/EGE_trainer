package ru.egetrainer.app.screens.student

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.egetrainer.app.AppState
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.Fmt
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.MetricHelpIcon
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.app.designsystem.TopicProgressBar
import ru.egetrainer.app.screens.shared.CountStepper
import ru.egetrainer.app.screens.shared.ProtoPickerSheet
import ru.egetrainer.core.models.AnalyticsScreen
import ru.egetrainer.core.models.CatalogEntry
import ru.egetrainer.core.models.PickTopicState
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.ContentService
import ru.egetrainer.core.services.ScoreForecast
import ru.egetrainer.core.services.StudentPickEngine
import ru.egetrainer.core.services.StudentPickEngine.ProtoPick
import ru.egetrainer.core.services.TrainingDraftStore
import kotlin.math.roundToInt

/**
 * Главная ученика — порт StudentHomeView.swift (home_student.html):
 * прогноз, фильтры, аккордеон с счётчиками, модалка прототипов,
 * предпросмотр, черновик, нижний бар «Предпросмотр | Начать (N)».
 */
private val FILTERS: List<Pair<String?, String>> = listOf(
    null to "Без фильтра",
    "unseen_low" to "Не решал / мало решал",
    "stale" to "Давно решал",
    "unstable" to "Нестабильно решает",
    "weak_spots" to "Слабые места",
)

@Composable
fun StudentHomeScreen(app: AppState, onRun: (RunPayload) -> Unit, expandFirst: Boolean = false) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var sections by remember { mutableStateOf<List<Pair<CatalogEntry, List<CatalogEntry>>>>(emptyList()) }
    var analytics by remember { mutableStateOf<AnalyticsScreen?>(null) }
    var forecast by remember { mutableStateOf<ScoreForecast.Result?>(null) }
    var topicPctById by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var weakSectionIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    var counts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }          // CHOICE_TOPICS
    var sectionCounts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }   // CHOICE_SECTIONS
    var protoCounts by remember { mutableStateOf<Map<String, ProtoPick>>(emptyMap()) } // CHOICE_PROTOS
    var protoModalTopic by remember { mutableStateOf<CatalogEntry?>(null) }
    var expanded by remember { mutableStateOf<Set<String>>(emptySet()) }
    var shuffleTasks by remember { mutableStateOf(false) }

    var filterId by remember { mutableStateOf<String?>(null) }
    var topicStates by remember { mutableStateOf<Map<String, PickTopicState>>(emptyMap()) }
    var resumeDraft by remember { mutableStateOf<TrainingDraftStore.Draft?>(null) }

    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showPreview by remember { mutableStateOf(false) }

    // P4-1: фоновая сборка подборки (дебаунс через ключи LaunchedEffect)
    var assembledBase by remember { mutableStateOf<List<RunQuestion>?>(null) }
    var assembled by remember { mutableStateOf<List<RunQuestion>?>(null) }
    var isAssembling by remember { mutableStateOf(false) }
    var assembleSeq by remember { mutableIntStateOf(0) }

    val totalSelected = counts.values.sum() + sectionCounts.values.sum() +
        protoCounts.values.sumOf { it.count }

    suspend fun load() {
        isLoading = true
        errorMessage = null
        try {
            sections = app.content.sectionsWithTopics()
        } catch (e: Exception) {
            errorMessage = e.message ?: "Не удалось загрузить каталог."
            isLoading = false
            return
        }
        // Статистика не блокирует каталог
        runCatching {
            val a = app.student.analytics(scope = "self", days = 30, source = "all")
            analytics = a
            val topics = a.topics.orEmpty()
            val f = ScoreForecast.compute(topics)
            forecast = f
            topicPctById = topics.mapNotNull { t ->
                t.subtopicLast3AvgPct?.takeIf { it.isFinite() }
                    ?.let { t.topicId to kotlin.math.floor(it + 0.5).toInt() }
            }.toMap()
            weakSectionIds = f.sectionPctById.filterValues { it < 40 }.keys
        }
        isLoading = false
    }

    LaunchedEffect(Unit) {
        if (sections.isEmpty()) load()
        resumeDraft = app.draftStore.load()
        if (expandFirst) sections.firstOrNull()?.let { expanded = expanded + it.first.id }
    }

    // P5-2: «Перемешать» меняет порядок уже собранной подборки
    LaunchedEffect(shuffleTasks, assembledBase) {
        assembled = assembledBase?.let { if (shuffleTasks) it.shuffled() else it }
    }

    // P4-1: дебаунс-сборка при изменении выбора/фильтра
    LaunchedEffect(counts, sectionCounts, protoCounts, filterId) {
        assembledBase = null
        assembled = null
        assembleSeq += 1
        if (totalSelected == 0) {
            isAssembling = false
            return@LaunchedEffect
        }
        isAssembling = true
        val selection = StudentPickEngine.Selection(counts, sectionCounts, protoCounts)
        delay(700) // дебаунс степперов (отмена через рестарт эффекта)
        val qs = runCatching {
            StudentPickEngine.pick(selection, sections, filterId, app.student, app.content)
        }.getOrDefault(emptyList())
        // P6-1: без «Перемешать» — строгий порядок по номерам задач
        assembledBase = qs.sortedWith { a, b ->
            if (ContentService.numericIdLess(a.questionId, b.questionId)) -1
            else if (ContentService.numericIdLess(b.questionId, a.questionId)) 1 else 0
        }
        isAssembling = false
    }

    fun reloadTopicStates() {
        scope.launch {
            if (filterId == null) {
                topicStates = emptyMap()
                return@launch
            }
            runCatching { app.student.pickingScreenSelf(filterId) }.getOrNull()?.let { screen ->
                topicStates = screen.sections.orEmpty()
                    .flatMap { it.topics.orEmpty() }
                    .mapNotNull { t -> t.topicState?.let { t.topicId to it } }
                    .toMap()
            }
        }
    }

    /** Прогрев статистики прототипов раскрытой секции (порт WFX1). */
    fun warmSection(sectionId: String) {
        val pair = sections.firstOrNull { it.first.id == sectionId } ?: return
        pair.second.forEach { topic ->
            scope.launch { runCatching { app.protoStats.load(null, topic.id) } }
        }
    }

    Box(Modifier.fillMaxSize().background(colors.bg)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    EyebrowText("Подготовка к ЕГЭ по профильной математике")
                    Text(
                        "Выберите темы для тренировки",
                        color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Полоска показывает вашу точность по теме, число рядом — покрытие " +
                            "задач банка. Начните со слабых тем — это быстрее всего поднимает балл.",
                        color = colors.textDim, fontSize = EgeDims.fsMd,
                    )
                }
            }

            item { ForecastCard(forecast) }

            resumeDraft?.let { draft ->
                item {
                    ResumeCard(
                        draft = draft,
                        onResume = {
                            scope.launch {
                                val qs = runCatching { app.content.buildQuestions(draft.refs) }
                                    .getOrDefault(emptyList())
                                if (qs.isEmpty()) {
                                    app.draftStore.clear()
                                    resumeDraft = null
                                } else {
                                    // режим всегда списком (включая старые test-черновики)
                                    onRun(RunPayload(qs, shuffled = draft.shuffle, initialAnswers = draft.answers))
                                }
                            }
                        },
                        onDiscard = {
                            app.draftStore.clear()
                            resumeDraft = null
                        },
                    )
                }
            }

            errorMessage?.let { msg ->
                item { ErrorStateView(msg) { scope.launch { load() } } }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1.2f)) {
                        FilterDropdown(filterId) {
                            filterId = it
                            reloadTopicStates()
                        }
                    }
                    SecondaryButton(
                        text = "Выбрать все",
                        onClick = {
                            // «Выбрать все» — +1 в КАЖДУЮ СЕКЦИЮ (bulkPickAll веба)
                            sectionCounts = sections.associate { (sec, _) ->
                                sec.id to ((sectionCounts[sec.id] ?: 0) + 1)
                            }
                        },
                        modifier = Modifier.weight(1f).testTag("selectAll"),
                    )
                    SecondaryButton(
                        text = "Сбросить",
                        onClick = {
                            counts = emptyMap()
                            sectionCounts = emptyMap()
                            protoCounts = emptyMap()
                        },
                        modifier = Modifier.weight(1f).testTag("resetAll"),
                    )
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Перемешать задачи", color = colors.textDim, fontSize = EgeDims.fsMd)
                    Spacer(Modifier.weight(1f))
                    Switch(
                        checked = shuffleTasks,
                        onCheckedChange = { shuffleTasks = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent),
                        modifier = Modifier.testTag("shuffleToggle"),
                    )
                }
            }

            if (isLoading) {
                item { LoadingStateView("Загружаем каталог и статистику...") }
            } else {
                items(sections, key = { it.first.id }) { (section, topics) ->
                    SectionRow(
                        section = section,
                        topics = topics,
                        expanded = expanded.contains(section.id),
                        sectionCount = topics.sumOf { counts[it.id] ?: 0 } + (sectionCounts[section.id] ?: 0),
                        pct = forecast?.sectionPctById?.get(section.id),
                        coverageText = sectionCoverageText(analytics, section, topics),
                        isWeak = weakSectionIds.contains(section.id),
                        topicPctById = topicPctById,
                        counts = counts,
                        protoCounts = protoCounts,
                        stateBadge = { topicId -> stateBadgeText(filterId, topicStates, topicId) },
                        onToggle = {
                            expanded = if (expanded.contains(section.id)) expanded - section.id
                            else (expanded + section.id).also { warmSection(section.id) }
                        },
                        onSectionDelta = { delta ->
                            if (delta > 0) {
                                sectionCounts = sectionCounts + (section.id to (sectionCounts[section.id] ?: 0) + 1)
                            } else {
                                val n = sectionCounts[section.id] ?: 0
                                if (n > 0) {
                                    sectionCounts = if (n == 1) sectionCounts - section.id
                                    else sectionCounts + (section.id to n - 1)
                                } else {
                                    // −1: снимаем с самой нагруженной подтемы
                                    topics.filter { (counts[it.id] ?: 0) > 0 }
                                        .maxByOrNull { counts[it.id] ?: 0 }
                                        ?.let { target ->
                                            val next = (counts[target.id] ?: 0) - 1
                                            counts = if (next == 0) counts - target.id
                                            else counts + (target.id to next)
                                        }
                                }
                            }
                        },
                        onTopicDelta = { topic, delta ->
                            val next = ((counts[topic.id] ?: 0) + delta).coerceAtLeast(0)
                            counts = if (next == 0) counts - topic.id else counts + (topic.id to next)
                        },
                        onTopicTap = { protoModalTopic = it },
                    )
                }
            }
        }

        // Нижний бар «Предпросмотр | Начать (N)»
        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(colors.panel)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SecondaryButton(
                text = if (isAssembling) "Собираем..." else "Предпросмотр",
                onClick = { if (!assembled.isNullOrEmpty()) showPreview = true },
                enabled = !assembled.isNullOrEmpty(),
                modifier = Modifier.weight(1f).testTag("previewBtn"),
            )
            Box(Modifier.weight(1f)) {
                PrimaryButton(
                    text = "Начать" + if (totalSelected > 0) " ($totalSelected)" else "",
                    onClick = {
                        assembled?.takeIf { it.isNotEmpty() }?.let {
                            onRun(RunPayload(it, shuffled = shuffleTasks))
                        }
                    },
                    enabled = !assembled.isNullOrEmpty(),
                    modifier = Modifier.testTag("startBtn"),
                )
            }
        }
    }

    protoModalTopic?.let { topic ->
        ProtoPickerSheet(
            app = app,
            topicId = topic.id,
            topicTitle = "${topic.id}. ${topic.title ?: ""}",
            studentId = null, // self-режим: proto_last3_for_self_v1
            protoCounts = protoCounts,
            onProtoCounts = { protoCounts = it },
            onDismiss = { protoModalTopic = null },
        )
    }

    if (showPreview) {
        StudentPreviewSheet(
            initialQuestions = assembled.orEmpty(),
            onStart = { remaining ->
                showPreview = false
                onRun(RunPayload(remaining, shuffled = shuffleTasks))
            },
            onDismiss = { showPreview = false },
        )
    }
}

private fun stateBadgeText(
    filterId: String?,
    topicStates: Map<String, PickTopicState>,
    topicId: String,
): String? {
    if (filterId == null) return null
    val st = topicStates[topicId] ?: return null
    return when {
        st.isNotSeen == true -> "не решал"
        st.isLowSeen == true -> "мало решал"
        st.isStale == true -> "давно не решал"
        st.isUnstable == true -> "нестабильно"
        else -> null
    }
}

private fun sectionCoverageText(
    analytics: AnalyticsScreen?,
    section: CatalogEntry,
    topics: List<CatalogEntry>,
): String {
    val cov = analytics?.sections?.firstOrNull { it.sectionId == section.id }?.coverage
    val total = cov?.unicsTotal ?: return "${topics.size}/${topics.size}"
    return "${cov.unicsAttempted ?: 0}/$total"
}

@Composable
private fun ForecastCard(forecast: ScoreForecast.Result?) {
    val colors = EgeTheme.colors
    EgeCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EyebrowText("Прогноз ЕГЭ")
            Spacer(Modifier.width(4.dp))
            MetricHelpIcon("forecast")
            Spacer(Modifier.weight(1f))
            Text("первичные ", color = colors.textDim, fontSize = EgeDims.fsMd)
            Text(
                forecast?.primaryText ?: "—",
                color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("forecastPrimary"),
            )
            Spacer(Modifier.width(4.dp))
            MetricHelpIcon("primary")
        }
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 4.dp)) {
            Text(
                forecast?.secondary?.toString() ?: "—",
                color = colors.text, fontSize = 38.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("forecastSecondary"),
            )
            Text(
                " из 100 баллов",
                color = colors.textDim, fontSize = EgeDims.fsMd,
                modifier = Modifier.padding(bottom = 6.dp),
            )
            Spacer(Modifier.weight(1f))
            forecast?.let {
                Text(
                    "+${ScoreForecast.deltaToGoal(it.secondary)} до цели",
                    color = colors.accent, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
        }
        // Шкала с отметкой цели 70
        Box(
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .height(8.dp)
                .clip(RoundedCornerShape(EgeDims.radiusPill))
                .background(colors.panel2),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(((forecast?.secondary ?: 0) / 100f).coerceIn(0f, 1f))
                    .height(8.dp)
                    .clip(RoundedCornerShape(EgeDims.radiusPill))
                    .background(colors.accent),
            )
            Box(
                Modifier
                    .padding(start = 0.dp)
                    .fillMaxWidth(0.7f),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Box(Modifier.width(3.dp).height(14.dp).background(colors.accent2))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text("0", color = colors.textDim, fontSize = EgeDims.fsXs)
            Spacer(Modifier.weight(0.65f))
            Text("цель 70", color = colors.accent, fontSize = EgeDims.fsXs, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(0.35f))
            Text("100", color = colors.textDim, fontSize = EgeDims.fsXs)
        }
    }
}

@Composable
private fun ResumeCard(
    draft: TrainingDraftStore.Draft,
    onResume: () -> Unit,
    onDiscard: () -> Unit,
) {
    val colors = EgeTheme.colors
    EgeCard(padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Незавершённая тренировка",
                    color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${draft.refs.size} ${Fmt.plural(draft.refs.size, "задача", "задачи", "задач")}",
                    color = colors.textDim, fontSize = EgeDims.fsXs,
                )
            }
            Text(
                "Продолжить",
                color = Color.White,
                fontSize = EgeDims.fsMd,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(EgeDims.radiusMd))
                    .background(colors.accent)
                    .clickable(onClick = onResume)
                    .padding(horizontal = 14.dp, vertical = 9.dp)
                    .testTag("resumeBtn"),
            )
            Text(
                "✕",
                color = colors.textDim,
                fontSize = EgeDims.fsMd,
                modifier = Modifier
                    .padding(start = 10.dp)
                    .clickable(onClick = onDiscard)
                    .padding(6.dp)
                    .testTag("resumeDiscard"),
            )
        }
    }
}

@Composable
private fun FilterDropdown(filterId: String?, onSelect: (String?) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    val title = FILTERS.firstOrNull { it.first == filterId }?.second ?: "Без фильтра"
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(EgeDims.radiusMd))
                .background(colors.panel)
                .border(1.dp, if (filterId == null) colors.border else colors.accent, RoundedCornerShape(EgeDims.radiusMd))
                .clickable { open = true }
                .padding(vertical = 12.dp, horizontal = 10.dp)
                .testTag("filterDropdown"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                title,
                color = if (filterId == null) colors.text else colors.accent,
                fontSize = EgeDims.fsSm,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Text("▾", color = colors.textDim, fontSize = EgeDims.fsXs)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            FILTERS.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(if (id == filterId) "✓ $name" else name) },
                    onClick = {
                        onSelect(id)
                        open = false
                    },
                    modifier = Modifier.testTag("filter_${id ?: "none"}"),
                )
            }
        }
    }
}


@Composable
private fun SectionRow(
    section: CatalogEntry,
    topics: List<CatalogEntry>,
    expanded: Boolean,
    sectionCount: Int,
    pct: Int?,
    coverageText: String,
    isWeak: Boolean,
    topicPctById: Map<String, Int>,
    counts: Map<String, Int>,
    protoCounts: Map<String, ProtoPick>,
    stateBadge: (String) -> String?,
    onToggle: () -> Unit,
    onSectionDelta: (Int) -> Unit,
    onTopicDelta: (CatalogEntry, Int) -> Unit,
    onTopicTap: (CatalogEntry) -> Unit,
) {
    val colors = EgeTheme.colors
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 12.dp)) {
            Row(
                Modifier
                    .weight(1f)
                    .clickable(onClick = onToggle)
                    .testTag("section_${section.id}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (expanded) "▾" else "▸",
                    color = colors.textDim, fontSize = EgeDims.fsXs,
                )
                Column(Modifier.padding(start = 6.dp)) {
                    Text(
                        "${section.id}. ${section.title ?: ""}",
                        color = colors.text, fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold,
                    )
                    if (isWeak) {
                        Text("слабая тема", color = colors.textDim, fontSize = EgeDims.fs2xs)
                    }
                }
            }
            CountStepper(count = sectionCount, onChange = onSectionDelta, tag = "secStepper_${section.id}")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopicProgressBar(pct) }
            if (pct != null) {
                Text(
                    " $pct%",
                    color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            Text(
                coverageText,
                color = colors.textDim, fontSize = EgeDims.fsXs,
                modifier = Modifier.padding(start = 10.dp),
            )
        }

        if (expanded) {
            Column(
                Modifier.padding(start = 14.dp, top = 8.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                topics.forEach { topic ->
                    TopicRow(
                        topic = topic,
                        pct = topicPctById[topic.id],
                        count = counts[topic.id] ?: 0,
                        protoInTopic = protoCounts.values.filter { it.topicId == topic.id }.sumOf { it.count },
                        badge = stateBadge(topic.id),
                        onTap = { onTopicTap(topic) },
                        onDelta = { onTopicDelta(topic, it) },
                    )
                }
            }
        }
        HorizontalDivider(color = colors.borderLight)
    }
}

@Composable
private fun TopicRow(
    topic: CatalogEntry,
    pct: Int?,
    count: Int,
    protoInTopic: Int,
    badge: String?,
    onTap: () -> Unit,
    onDelta: (Int) -> Unit,
) {
    val colors = EgeTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier
                .weight(1f)
                .clickable(onClick = onTap)
                .testTag("topic_${topic.id}"),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${topic.id}. ${topic.title ?: ""}",
                    color = colors.text, fontSize = EgeDims.fsMd,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (protoInTopic > 0) {
                    Text(
                        "+$protoInTopic",
                        color = Color.White, fontSize = EgeDims.fs2xs, fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .clip(RoundedCornerShape(EgeDims.radiusPill))
                            .background(colors.accent)
                            .padding(horizontal = 6.dp, vertical = 1.dp)
                            .testTag("protoChip_${topic.id}"),
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(110.dp)) { TopicProgressBar(pct) }
                if (pct != null) {
                    Text(
                        " $pct%",
                        color = colors.textDim, fontSize = EgeDims.fsXs, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            if (badge != null) {
                Text(
                    badge,
                    color = colors.warnText, fontSize = EgeDims.fs2xs, fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(EgeDims.radiusPill))
                        .background(colors.warnBg)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        CountStepper(count = count, onChange = onDelta, tag = "topicStepper_${topic.id}")
    }
}
