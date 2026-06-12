package ru.egetrainer.app.screens.teacher

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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import ru.egetrainer.app.designsystem.BadgeStyle
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.ErrorStateView
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.LoadingStateView
import ru.egetrainer.app.designsystem.MetricHelpIcon
import ru.egetrainer.app.designsystem.PrimaryButton
import ru.egetrainer.app.designsystem.SecondaryButton
import ru.egetrainer.app.designsystem.StatusBadge
import ru.egetrainer.app.designsystem.TopicProgressBar
import ru.egetrainer.app.screens.shared.CountStepper
import ru.egetrainer.app.screens.shared.ProtoPickerSheet
import ru.egetrainer.core.models.CatalogEntry
import ru.egetrainer.core.models.FilterCounts
import ru.egetrainer.core.models.PickSection
import ru.egetrainer.core.models.PickTopic
import ru.egetrainer.core.models.PickingScreen
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.models.StudentListItem
import ru.egetrainer.core.services.ContentService
import ru.egetrainer.core.services.ResolveRequest
import ru.egetrainer.core.services.ScoreForecast
import ru.egetrainer.core.services.StudentPickEngine
import ru.egetrainer.core.services.StudentPickEngine.ProtoPick
import kotlin.math.roundToInt

private val FILTERS: List<Pair<String?, String>> = listOf(
    null to "Без фильтра",
    "unseen_low" to "Не решал / мало решал",
    "stale" to "Давно решал",
    "unstable" to "Нестабильно решает",
    "weak_spots" to "Слабые места",
)

/** Что открыть из главной учителя поверх неё. */
sealed class TeacherHomeNav {
    data class Preview(val student: StudentListItem?, val requests: List<ResolveRequest>,
                       val filterId: String?, val shuffle: Boolean, val preAssembled: List<RunQuestion>) : TeacherHomeNav()
    data class Start(val questions: List<RunQuestion>) : TeacherHomeNav()
    data class Create(val student: StudentListItem?, val prePicked: List<QuestionRef>) : TeacherHomeNav()
    data class Card(val student: StudentListItem) : TeacherHomeNav()
}

/**
 * Главная учителя — порт TeacherHomeView.swift (home_teacher.html): выбор
 * ученика, прогноз, фильтры+бейджи, аккордеон teacher-scope, модалка
 * прототипов с датами, нижний бар [глаз | Начать | Создать ДЗ].
 */
@Composable
fun TeacherHomeScreen(app: AppState, onNav: (TeacherHomeNav) -> Unit) {
    val colors = EgeTheme.colors
    val scope = rememberCoroutineScope()

    var students by remember { mutableStateOf<List<StudentListItem>>(emptyList()) }
    var selectedStudent by remember { mutableStateOf<StudentListItem?>(null) }
    var picking by remember { mutableStateOf<PickingScreen?>(null) }
    var forecast by remember { mutableStateOf<ScoreForecast.Result?>(null) }
    var catalogSections by remember { mutableStateOf<List<Pair<CatalogEntry, List<CatalogEntry>>>>(emptyList()) }

    var counts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var sectionCounts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var protoCounts by remember { mutableStateOf<Map<String, ProtoPick>>(emptyMap()) }
    var expanded by remember { mutableStateOf<Set<String>>(emptySet()) }
    var filterId by remember { mutableStateOf<String?>(null) }
    var shuffleTasks by remember { mutableStateOf(false) }

    var isLoadingStudents by remember { mutableStateOf(true) }
    var isLoadingScreen by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showStudentSearch by remember { mutableStateOf(false) }
    var protoModalTopic by remember { mutableStateOf<Pair<String, String?>?>(null) }

    var assembledBase by remember { mutableStateOf<List<RunQuestion>?>(null) }
    var assembled by remember { mutableStateOf<List<RunQuestion>?>(null) }
    var isAssembling by remember { mutableStateOf(false) }

    val totalSelected = counts.values.sum() + sectionCounts.values.sum() +
        protoCounts.values.sumOf { it.count }

    fun resolveRequests(): List<ResolveRequest> = buildList {
        protoCounts.entries.sortedBy { it.key }.forEach { add(ResolveRequest("proto", it.key, it.value.count)) }
        counts.entries.sortedBy { it.key }.filter { it.value > 0 }.forEach { add(ResolveRequest("topic", it.key, it.value)) }
        sectionCounts.entries.sortedBy { it.key }.filter { it.value > 0 }.forEach { add(ResolveRequest("section", it.key, it.value)) }
    }

    LaunchedEffect(Unit) {
        isLoadingStudents = true
        runCatching { app.teacher.listMyStudents() }.onSuccess { students = it }
            .onFailure { errorMessage = it.message }
        isLoadingStudents = false
        if (catalogSections.isEmpty()) {
            catalogSections = runCatching { app.content.sectionsWithTopics() }.getOrDefault(emptyList())
        }
    }

    suspend fun reloadScreen() {
        val s = selectedStudent ?: return
        isLoadingScreen = true
        errorMessage = null
        runCatching { app.teacher.pickingScreen(s.studentId, filterId = filterId) }
            .onSuccess { picking = it }
            .onFailure { errorMessage = it.message; isLoadingScreen = false; return }
        runCatching { app.student.analytics(scope = "teacher", studentId = s.studentId) }.getOrNull()?.let { a ->
            forecast = ScoreForecast.compute(a.topics.orEmpty())
        }
        isLoadingScreen = false
    }

    fun selectStudent(s: StudentListItem) {
        selectedStudent = s
        counts = emptyMap(); sectionCounts = emptyMap(); protoCounts = emptyMap()
        picking = null; forecast = null
        scope.launch { reloadScreen() }
    }

    LaunchedEffect(shuffleTasks, assembledBase) {
        assembled = assembledBase?.let { if (shuffleTasks) it.shuffled() else it }
    }

    // Фоновая сборка подборки (teacher-scope: resolvePickedWithTopUp по RPC)
    LaunchedEffect(counts, sectionCounts, protoCounts, filterId, selectedStudent) {
        assembledBase = null; assembled = null
        if (totalSelected == 0) { isAssembling = false; return@LaunchedEffect }
        isAssembling = true
        delay(700)
        val student = selectedStudent
        val qs: List<RunQuestion> = if (student != null) {
            val picked = runCatching {
                app.teacher.resolvePickedWithTopUp(student.studentId, resolveRequests(), filterId)
            }.getOrDefault(emptyList())
            val refs = picked.map { QuestionRef(it.topicId ?: "", it.questionId) }
            runCatching { app.content.buildQuestions(refs) }.getOrDefault(emptyList())
        } else {
            // P6-5: без ученика — клиентский подбор по каталогу
            runCatching {
                StudentPickEngine.pick(
                    StudentPickEngine.Selection(counts, sectionCounts, protoCounts),
                    catalogSections, null, app.student, app.content,
                )
            }.getOrDefault(emptyList())
        }
        assembledBase = qs.sortedWith { a, b ->
            if (ContentService.numericIdLess(a.questionId, b.questionId)) -1
            else if (ContentService.numericIdLess(b.questionId, a.questionId)) 1 else 0
        }
        isAssembling = false
    }

    Box(Modifier.fillMaxSize().background(colors.bg)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                EyebrowText("Подготовка к ЕГЭ по профильной математике")
                Text(
                    if (selectedStudent == null) "Выберите ученика" else "Подбор задач",
                    color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    StudentPickerButton(
                        selected = selectedStudent,
                        loading = isLoadingStudents,
                        onClick = { if (students.isNotEmpty()) showStudentSearch = true },
                        onClear = {
                            selectedStudent = null; picking = null; forecast = null
                            counts = emptyMap(); sectionCounts = emptyMap(); protoCounts = emptyMap()
                        },
                        modifier = Modifier.weight(1f),
                    )
                    if (selectedStudent != null) {
                        Box(
                            Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(EgeDims.radiusMd))
                                .background(colors.panel)
                                .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusMd))
                                .clickable { onNav(TeacherHomeNav.Card(selectedStudent!!)) }
                                .testTag("studentCardBtn"),
                            contentAlignment = Alignment.Center,
                        ) { Text("👤", fontSize = EgeDims.fsLg) }
                    }
                }
            }
            item { TeacherForecastCard(forecast) }
            errorMessage?.let { msg -> item { ErrorStateView(msg) { scope.launch { reloadScreen() } } } }

            // Ряд контролов
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (selectedStudent != null) {
                        Box(Modifier.weight(1.2f)) {
                            FilterDropdown(filterId, picking) {
                                filterId = it
                                scope.launch { reloadScreen() }
                            }
                        }
                    }
                    SecondaryButton(
                        text = "Выбрать все",
                        onClick = {
                            // +1 в каждую секцию (bulkPickAll), и для teacher, и для каталога
                            val secs = picking?.sections?.map { it.sectionId } ?: catalogSections.map { it.first.id }
                            sectionCounts = secs.associateWith { (sectionCounts[it] ?: 0) + 1 }
                        },
                        modifier = Modifier.weight(1f).testTag("selectAll"),
                    )
                    SecondaryButton(
                        text = "Сбросить",
                        onClick = { counts = emptyMap(); sectionCounts = emptyMap(); protoCounts = emptyMap() },
                        modifier = Modifier.weight(1f).testTag("resetAll"),
                    )
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Перемешать задачи", color = colors.textDim, fontSize = EgeDims.fsMd)
                    Spacer(Modifier.weight(1f))
                    Switch(shuffleTasks, { shuffleTasks = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent),
                        modifier = Modifier.testTag("shuffleToggle"))
                }
            }
            if (selectedStudent == null) {
                item {
                    Text(
                        "Ученик не выбран — статистика недоступна, но подборку можно собрать и распечатать.",
                        color = colors.textDim, fontSize = EgeDims.fsXs,
                    )
                }
            }

            when {
                isLoadingScreen -> item { LoadingStateView("Загружаем статистику ученика...") }
                picking != null -> items(picking!!.sections.orEmpty(), key = { it.sectionId }) { section ->
                    TeacherSectionRow(
                        section = section,
                        expanded = expanded.contains(section.sectionId),
                        counts = counts, sectionCounts = sectionCounts, protoCounts = protoCounts,
                        onToggle = {
                            expanded = if (expanded.contains(section.sectionId)) expanded - section.sectionId
                            else (expanded + section.sectionId).also {
                                selectedStudent?.let { s ->
                                    section.topics.orEmpty().forEach { t ->
                                        scope.launch { runCatching { app.protoStats.load(s.studentId, t.topicId) } }
                                    }
                                }
                            }
                        },
                        onSectionDelta = { d -> sectionCounts = adjustSection(sectionCounts, counts, section.sectionId,
                            section.topics.orEmpty().map { it.topicId }, d).first.also { counts = adjustSection(sectionCounts, counts, section.sectionId, section.topics.orEmpty().map { it.topicId }, d).second } },
                        onTopicDelta = { tid, d ->
                            val next = ((counts[tid] ?: 0) + d).coerceAtLeast(0)
                            counts = if (next == 0) counts - tid else counts + (tid to next)
                        },
                        onTopicTap = { protoModalTopic = it.topicId to it.title },
                    )
                }
                else -> items(catalogSections, key = { it.first.id }) { (section, topics) ->
                    CatalogSectionRow(
                        section = section, topics = topics,
                        expanded = expanded.contains(section.id),
                        counts = counts, sectionCounts = sectionCounts, protoCounts = protoCounts,
                        onToggle = { expanded = if (expanded.contains(section.id)) expanded - section.id else expanded + section.id },
                        onSectionDelta = { d ->
                            val (sc, c) = adjustSection(sectionCounts, counts, section.id, topics.map { it.id }, d)
                            sectionCounts = sc; counts = c
                        },
                        onTopicDelta = { tid, d ->
                            val next = ((counts[tid] ?: 0) + d).coerceAtLeast(0)
                            counts = if (next == 0) counts - tid else counts + (tid to next)
                        },
                        onTopicTap = { protoModalTopic = it.id to it.title },
                    )
                }
            }
        }

        // Нижний бар [глаз-предпросмотр | Начать | Создать ДЗ]
        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(colors.panel)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(EgeDims.radiusMd)).background(colors.panel)
                    .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusMd))
                    .clickable(enabled = !assembled.isNullOrEmpty()) {
                        onNav(TeacherHomeNav.Preview(selectedStudent, resolveRequests(), filterId, shuffleTasks, assembled.orEmpty()))
                    }.testTag("previewBtn"),
                contentAlignment = Alignment.Center,
            ) {
                Box(contentAlignment = Alignment.TopEnd) {
                    Text("👁", fontSize = EgeDims.fsLg)
                    val n = assembled?.size ?: 0
                    if (n > 0) {
                        Text("$n", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.clip(RoundedCornerShape(EgeDims.radiusPill)).background(colors.accent)
                                .padding(horizontal = 4.dp))
                    }
                }
            }
            SecondaryButton(
                text = "Начать",
                onClick = { assembled?.takeIf { it.isNotEmpty() }?.let { onNav(TeacherHomeNav.Start(it)) } },
                enabled = !assembled.isNullOrEmpty(),
                modifier = Modifier.weight(1f).testTag("startBtn"),
            )
            Box(Modifier.weight(1f)) {
                PrimaryButton(
                    text = "Создать ДЗ",
                    onClick = {
                        val refs = assembled.orEmpty().map { QuestionRef(it.topicId, it.questionId) }
                        onNav(TeacherHomeNav.Create(selectedStudent, refs))
                    },
                    enabled = !assembled.isNullOrEmpty(),
                    modifier = Modifier.testTag("createHwBtn"),
                )
            }
        }
    }

    if (showStudentSearch) {
        StudentSearchSheet(students, onDismiss = { showStudentSearch = false }) { s ->
            showStudentSearch = false
            selectStudent(s)
        }
    }
    protoModalTopic?.let { (tid, title) ->
        ProtoPickerSheet(
            app = app, topicId = tid, topicTitle = "$tid. ${title ?: ""}",
            studentId = selectedStudent?.studentId, // teacher-scope: proto_last3_for_teacher_v1 + даты
            protoCounts = protoCounts, onProtoCounts = { protoCounts = it },
            onDismiss = { protoModalTopic = null },
        )
    }
}

/** −1: сначала section-бакет, затем самая нагруженная подтема. Возвращает (sectionCounts, counts). */
private fun adjustSection(
    sectionCounts: Map<String, Int>, counts: Map<String, Int>,
    sectionId: String, topicIds: List<String>, delta: Int,
): Pair<Map<String, Int>, Map<String, Int>> {
    if (delta > 0) {
        return (sectionCounts + (sectionId to (sectionCounts[sectionId] ?: 0) + 1)) to counts
    }
    val n = sectionCounts[sectionId] ?: 0
    if (n > 0) {
        val sc = if (n == 1) sectionCounts - sectionId else sectionCounts + (sectionId to n - 1)
        return sc to counts
    }
    val target = topicIds.filter { (counts[it] ?: 0) > 0 }.maxByOrNull { counts[it] ?: 0 } ?: return sectionCounts to counts
    val next = (counts[target] ?: 0) - 1
    val c = if (next == 0) counts - target else counts + (target to next)
    return sectionCounts to c
}

@Composable
private fun StudentPickerButton(
    selected: StudentListItem?, loading: Boolean,
    onClick: () -> Unit, onClear: () -> Unit, modifier: Modifier = Modifier,
) {
    val colors = EgeTheme.colors
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(EgeDims.radiusMd)).background(colors.panel)
            .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusMd))
            .clickable(onClick = onClick).padding(14.dp).testTag("studentPicker"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🔍 ", fontSize = EgeDims.fsMd)
        Text(
            selected?.displayName ?: if (loading) "Загрузка учеников..." else "Выберите ученика...",
            color = if (selected == null) colors.textDim else colors.text, fontSize = EgeDims.fsMd,
            maxLines = 1, modifier = Modifier.weight(1f),
        )
        if (selected != null) {
            Text("✕", color = colors.textDim, fontSize = EgeDims.fsMd,
                modifier = Modifier.clickable(onClick = onClear).padding(start = 6.dp))
        }
    }
}

@Composable
private fun TeacherForecastCard(forecast: ScoreForecast.Result?) {
    val colors = EgeTheme.colors
    EgeCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EyebrowText("Прогноз ЕГЭ"); Spacer(Modifier.width(4.dp)); MetricHelpIcon("forecast")
            Spacer(Modifier.weight(1f))
            Text("первичные ", color = colors.textDim, fontSize = EgeDims.fsMd)
            Text(forecast?.primaryText ?: "—", color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold)
        }
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 4.dp)) {
            Text(forecast?.secondary?.toString() ?: "—", color = colors.text, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Text(" из 100 баллов", color = colors.textDim, fontSize = EgeDims.fsMd, modifier = Modifier.padding(bottom = 5.dp))
            Spacer(Modifier.weight(1f))
            Text(
                forecast?.let { "+${ScoreForecast.deltaToGoal(it.secondary)} до цели" } ?: "+— до цели",
                color = colors.accent, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 5.dp),
            )
        }
        Box(Modifier.fillMaxWidth().padding(top = 8.dp).height(8.dp).clip(RoundedCornerShape(EgeDims.radiusPill)).background(colors.panel2)) {
            Box(Modifier.fillMaxWidth(((forecast?.secondary ?: 0) / 100f).coerceIn(0f, 1f)).height(8.dp)
                .clip(RoundedCornerShape(EgeDims.radiusPill)).background(colors.accent))
        }
    }
}

@Composable
private fun FilterDropdown(filterId: String?, picking: PickingScreen?, onSelect: (String?) -> Unit) {
    val colors = EgeTheme.colors
    var open by remember { mutableStateOf(false) }
    fun count(key: String): Int = picking?.sections.orEmpty().sumOf { filterCount(it.filterCounts, key) }
    val title = FILTERS.firstOrNull { it.first == filterId }?.second ?: "Без фильтра"
    Box {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(EgeDims.radiusMd)).background(colors.panel)
                .border(1.dp, if (filterId == null) colors.border else colors.accent, RoundedCornerShape(EgeDims.radiusMd))
                .clickable { open = true }.padding(vertical = 12.dp, horizontal = 10.dp).testTag("filterDropdown"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, color = if (filterId == null) colors.text else colors.accent, fontSize = EgeDims.fsSm,
                fontWeight = FontWeight.Medium, maxLines = 1, modifier = Modifier.weight(1f))
            Text(" ▾", color = colors.textDim, fontSize = EgeDims.fsXs)
        }
        androidx.compose.material3.DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            FILTERS.forEach { (id, name) ->
                val c = id?.let { count(it) } ?: 0
                val label = if (c > 0) "$name ($c)" else name
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(if (id == filterId) "✓ $label" else label) },
                    onClick = { onSelect(id); open = false },
                    modifier = Modifier.testTag("filter_${id ?: "none"}"),
                )
            }
        }
    }
}

private fun filterCount(c: FilterCounts?, key: String): Int = when (key) {
    "stale" -> c?.stale ?: 0
    "unstable" -> c?.unstable ?: 0
    "unseen_low" -> c?.unseenLow ?: 0
    "weak_spots" -> c?.weakSpots ?: 0
    else -> 0
}

@Composable
private fun TeacherSectionRow(
    section: PickSection, expanded: Boolean,
    counts: Map<String, Int>, sectionCounts: Map<String, Int>, protoCounts: Map<String, ProtoPick>,
    onToggle: () -> Unit, onSectionDelta: (Int) -> Unit,
    onTopicDelta: (String, Int) -> Unit, onTopicTap: (PickTopic) -> Unit,
) {
    val colors = EgeTheme.colors
    val topics = section.topics.orEmpty()
    val sectionCount = topics.sumOf { counts[it.topicId] ?: 0 } + (sectionCounts[section.sectionId] ?: 0)
    val pct = run {
        val vals = topics.mapNotNull { it.progress?.subtopicLast3AvgPct }
        if (vals.isEmpty()) null else (vals.map { Math.rint(it) }.sum() / vals.size).roundToInt()
    }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 12.dp)) {
            Row(Modifier.weight(1f).clickable(onClick = onToggle).testTag("section_${section.sectionId}"),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (expanded) "▾" else "▸", color = colors.textDim, fontSize = EgeDims.fsXs)
                Text("${section.sectionId}. ${section.title ?: ""}", color = colors.text,
                    fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
            }
            CountStepper(sectionCount, onSectionDelta, "secStepper_${section.sectionId}")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopicProgressBar(pct) }
            if (pct != null) Text(" $pct%", color = colors.text, fontSize = EgeDims.fsMd, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp))
        }
        if (expanded) {
            Column(Modifier.padding(start = 14.dp, top = 8.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                topics.forEach { topic ->
                    TeacherTopicRow(topic, counts[topic.topicId] ?: 0,
                        protoCounts.values.filter { it.topicId == topic.topicId }.sumOf { it.count },
                        onTap = { onTopicTap(topic) }, onDelta = { onTopicDelta(topic.topicId, it) })
                }
            }
        }
        HorizontalDivider(color = colors.borderLight)
    }
}

@Composable
private fun TeacherTopicRow(topic: PickTopic, count: Int, protoInTopic: Int, onTap: () -> Unit, onDelta: (Int) -> Unit) {
    val colors = EgeTheme.colors
    val pct = topic.progress?.subtopicLast3AvgPct?.let { it.roundToInt() }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).clickable(onClick = onTap).testTag("topic_${topic.topicId}"),
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${topic.topicId}. ${topic.title ?: ""}", color = colors.text, fontSize = EgeDims.fsMd,
                    modifier = Modifier.weight(1f, fill = false))
                if (protoInTopic > 0) {
                    Text("+$protoInTopic", color = Color.White, fontSize = EgeDims.fs2xs, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 6.dp).clip(RoundedCornerShape(EgeDims.radiusPill))
                            .background(colors.accent).padding(horizontal = 6.dp, vertical = 1.dp))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(90.dp)) { TopicProgressBar(pct) }
                if (pct != null) Text(" $pct%", color = colors.textDim, fontSize = EgeDims.fsXs, modifier = Modifier.padding(start = 8.dp))
                topic.coverage?.let { cov ->
                    Text("  ${cov.coveredProtoCount ?: 0}/${cov.totalProtoCount ?: 0}", color = colors.textDim, fontSize = EgeDims.fs2xs)
                }
            }
            // бейджи состояний
            val st = topic.topicState
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (st?.isNotSeen == true) StatusBadge("не решал", BadgeStyle.Neutral)
                if (st?.isStale == true) StatusBadge("давно не решал", BadgeStyle.Warning)
                if (st?.isUnstable == true) StatusBadge("нестабильно", BadgeStyle.Warning)
                if ((topic.progress?.subtopicLast3AvgPct ?: 100.0) < 40 && st?.isNotSeen != true)
                    StatusBadge("слабое", BadgeStyle.Danger)
            }
        }
        CountStepper(count, onDelta, "topicStepper_${topic.topicId}")
    }
}

@Composable
private fun CatalogSectionRow(
    section: CatalogEntry, topics: List<CatalogEntry>, expanded: Boolean,
    counts: Map<String, Int>, sectionCounts: Map<String, Int>, protoCounts: Map<String, ProtoPick>,
    onToggle: () -> Unit, onSectionDelta: (Int) -> Unit,
    onTopicDelta: (String, Int) -> Unit, onTopicTap: (CatalogEntry) -> Unit,
) {
    val colors = EgeTheme.colors
    val sectionCount = topics.sumOf { counts[it.id] ?: 0 } + (sectionCounts[section.id] ?: 0)
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 12.dp)) {
            Row(Modifier.weight(1f).clickable(onClick = onToggle).testTag("section_${section.id}"),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (expanded) "▾" else "▸", color = colors.textDim, fontSize = EgeDims.fsXs)
                Text("${section.id}. ${section.title ?: ""}", color = colors.text,
                    fontSize = EgeDims.fsLg, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
            }
            CountStepper(sectionCount, onSectionDelta, "secStepper_${section.id}")
        }
        if (expanded) {
            Column(Modifier.padding(start = 14.dp, top = 4.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                topics.forEach { topic ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f).clickable { onTopicTap(topic) }.testTag("topic_${topic.id}"),
                            verticalAlignment = Alignment.CenterVertically) {
                            Text("${topic.id}. ${topic.title ?: ""}", color = colors.text, fontSize = EgeDims.fsMd,
                                modifier = Modifier.weight(1f, fill = false))
                            val n = protoCounts.values.filter { it.topicId == topic.id }.sumOf { it.count }
                            if (n > 0) Text("+$n", color = Color.White, fontSize = EgeDims.fs2xs, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 6.dp).clip(RoundedCornerShape(EgeDims.radiusPill))
                                    .background(colors.accent).padding(horizontal = 6.dp, vertical = 1.dp))
                        }
                        CountStepper(counts[topic.id] ?: 0, { onTopicDelta(topic.id, it) }, "topicStepper_${topic.id}")
                    }
                }
            }
        }
        HorizontalDivider(color = colors.borderLight)
    }
}

/** Поиск-автодополнение ученика (порт StudentSearchPicker.swift). */
@androidx.compose.runtime.Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun StudentSearchSheet(students: List<StudentListItem>, onDismiss: () -> Unit, onSelect: (StudentListItem) -> Unit) {
    val colors = EgeTheme.colors
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, students) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) students
        else students.mapNotNull { s ->
            val name = s.displayName.lowercase()
            val words = name.split(" ")
            val rank = when {
                words.firstOrNull()?.startsWith(q) == true -> 0
                words.drop(1).any { it.startsWith(q) } -> 1
                name.contains(q) -> 2
                s.email?.lowercase()?.contains(q) == true -> 3
                else -> null
            }
            rank?.let { s to it }
        }.sortedBy { it.second }.map { it.first }
    }
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.bg,
    ) {
        androidx.compose.material3.OutlinedTextField(
            value = query, onValueChange = { query = it },
            placeholder = { Text("Поиск по имени или email", color = colors.textDim) },
            singleLine = true,
            shape = RoundedCornerShape(EgeDims.radiusSm),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("studentSearch"),
        )
        LazyColumn(Modifier.fillMaxHeight(0.8f).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            items(filtered, key = { it.studentId }) { s ->
                Column(Modifier.fillMaxWidth().clickable { onSelect(s) }
                    .padding(vertical = 10.dp).testTag("studentOpt_${s.studentId}")) {
                    Text(s.displayName, color = colors.text, fontSize = EgeDims.fsMd)
                    s.email?.let { Text(it, color = colors.textDim, fontSize = EgeDims.fsXs) }
                }
                HorizontalDivider(color = colors.borderLight)
            }
        }
    }
}
