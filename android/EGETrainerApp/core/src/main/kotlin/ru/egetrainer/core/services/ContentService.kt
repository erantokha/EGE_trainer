package ru.egetrainer.core.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import ru.egetrainer.core.AppJson
import ru.egetrainer.core.models.CatalogEntry
import ru.egetrainer.core.models.Figure
import ru.egetrainer.core.models.Prototype
import ru.egetrainer.core.models.QuestionRef
import ru.egetrainer.core.models.ResolvedAnswerSpec
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.models.TaskType
import ru.egetrainer.core.models.TopicManifest
import ru.egetrainer.core.interpolationText
import ru.egetrainer.core.stringValue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Контент задач: статические JSON продакшен-сайта (content/tasks).
 * Порт ContentService.swift (зеркало loadCatalog/ensureManifest/findProto/
 * buildQuestion из tasks/hw.js). Singleton — ContentService.shared.
 */
class ContentService internal constructor(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build(),
) {
    companion object {
        val shared = ContentService()

        /**
         * Базовый id прототипа (без последнего числового сегмента) —
         * baseIdFromProtoId из app/video_solutions.js / picker_common.js.
         * Готча: НЕ хардкодить число сегментов (темы 2/3-сегментные).
         */
        fun baseId(of: String): String {
            val parts = of.split(".")
            if (parts.size >= 4 && parts.last().toIntOrNull() != null) {
                return parts.dropLast(1).joinToString(".")
            }
            return of
        }

        /** Числовое сравнение id по сегментам ("1.10" < "2.1") — порядок варианта по номерам. */
        fun numericIdLess(a: String, b: String): Boolean {
            val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
            val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(pa.size, pb.size)) {
                val x = pa.getOrElse(i) { 0 }
                val y = pb.getOrElse(i) { 0 }
                if (x != y) return x < y
            }
            return false
        }
    }

    private val catalogMutex = Mutex()
    private val videoMutex = Mutex()

    @Volatile
    private var catalog: List<CatalogEntry>? = null

    @Volatile
    private var topicById: Map<String, CatalogEntry> = emptyMap()

    private val manifestCache = ConcurrentHashMap<String, TopicManifest>()

    @Volatile
    private var videoMap: Map<String, String>? = null

    // MARK: Сеть

    private suspend fun fetch(url: String): Pair<ByteArray, Int> =
        withContext(Dispatchers.IO) {
            http.newCall(Request.Builder().url(url).get().build()).execute().use { resp ->
                Pair(resp.body?.bytes() ?: ByteArray(0), resp.code)
            }
        }

    // MARK: Каталог

    suspend fun loadCatalog(): List<CatalogEntry> {
        catalog?.let { return it }
        return catalogMutex.withLock {
            catalog?.let { return@withLock it }
            val (data, status) = fetch("${SupabaseConfig.CONTENT_BASE_URL}/content/tasks/index.json")
            if (status != 200) throw SupabaseError.Http(status, "Каталог задач недоступен")
            val entries = AppJson.decodeFromString(ListSerializer(CatalogEntry.serializer()), data.decodeToString())
            topicById = entries.filter { it.parent != null }.associateBy { it.id }
            catalog = entries
            entries
        }
    }

    /** Секции с вложенными темами для аккордеона тренировки. */
    suspend fun sectionsWithTopics(): List<Pair<CatalogEntry, List<CatalogEntry>>> {
        val entries = loadCatalog()
        val sections = entries.filter { it.isSection }
        val topics = entries.filter { it.isSelectableTopic }
        return sections.map { sec ->
            Pair(sec, topics.filter { it.parent == sec.id }.sortedWith { a, b ->
                if (numericIdLess(a.id, b.id)) -1 else if (numericIdLess(b.id, a.id)) 1 else 0
            })
        }.sortedWith { a, b ->
            if (numericIdLess(a.first.id, b.first.id)) -1 else if (numericIdLess(b.first.id, a.first.id)) 1 else 0
        }
    }

    /** Тема каталога по id (для модалки прототипов с PickTopic учителя). */
    suspend fun topicEntry(id: String): CatalogEntry? {
        loadCatalog()
        return topicById[id]
    }

    // MARK: Манифесты

    suspend fun manifest(topic: CatalogEntry): TopicManifest? {
        val path = topic.path ?: return null
        manifestCache[path]?.let { return it }
        val (data, status) = fetch("${SupabaseConfig.CONTENT_BASE_URL}/$path")
        if (status != 200) return null
        val man = runCatching {
            AppJson.decodeFromString(TopicManifest.serializer(), data.decodeToString())
        }.getOrNull() ?: return null
        manifestCache[path] = man
        return man
    }

    /**
     * Поиск темы: точный id, затем по убывающим префиксам question_id
     * (готча нерегулярной иерархии id — как в buildFixedQuestions hw.js).
     */
    private suspend fun resolveTopic(topicId: String, questionId: String): CatalogEntry? {
        loadCatalog()
        topicById[topicId]?.let { return it }
        val parts = questionId.split(".")
        if (parts.size >= 2) {
            for (len in (parts.size - 1) downTo 2) {
                val candidate = parts.subList(0, len).joinToString(".")
                topicById[candidate]?.let { return it }
            }
        }
        return null
    }

    // MARK: Сборка вопросов

    /**
     * frozen_questions/fixed refs -> готовые вопросы (порт buildFixedQuestions).
     * Манифесты уникальных тем грузятся ПАРАЛЛЕЛЬНО (урок iOS-аудита:
     * последовательная загрузка 12 манифестов = 3,6 с, параллельная = 0,4 с),
     * затем вопросы собираются из кэша в порядке refs.
     */
    suspend fun buildQuestions(refs: List<QuestionRef>): List<RunQuestion> {
        // 1) уникальные темы подборки
        val topicByRef = mutableMapOf<String, CatalogEntry>()
        val uniqueTopics = mutableMapOf<String, CatalogEntry>()
        for (ref in refs) {
            val topic = resolveTopic(ref.topicId, ref.questionId) ?: continue
            topicByRef[ref.questionId] = topic
            topic.path?.let { uniqueTopics[it] = topic }
        }

        // 2) параллельный прогрев кэша манифестов
        coroutineScope {
            uniqueTopics.values
                .filter { manifestCache[it.path ?: ""] == null }
                .map { topic -> async { runCatching { manifest(topic) } } }
                .forEach { it.await() }
        }

        // 3) сборка из кэша
        val out = mutableListOf<RunQuestion>()
        for (ref in refs) {
            val topic = topicByRef[ref.questionId] ?: continue
            val man = manifest(topic) ?: continue
            val found = findProto(man, ref.questionId) ?: continue
            out.add(buildQuestion(man, found.first, found.second))
        }
        return out
    }

    /**
     * Случайные прототипы темы для тренировки — клиентский подбор со спредом
     * «вширь»: двухпроходная ротация по базовым прототипам, как
     * pickByProtoRotation в picker.js (проход 1 — только новые базы,
     * проход 2 — добор любыми).
     */
    suspend fun randomQuestions(
        topic: CatalogEntry,
        count: Int,
        excluding: Set<String> = emptySet(),
    ): List<RunQuestion> {
        val man = manifest(topic) ?: return emptyList()
        val pool = mutableListOf<Pair<TaskType, Prototype>>()
        for (type in man.types.orEmpty()) {
            for (proto in type.prototypes.orEmpty()) {
                val pid = proto.id ?: continue
                if (!excluding.contains(pid)) pool.add(Pair(type, proto))
            }
        }
        pool.shuffle()
        val picked = rotateByBase(pool, count) { it.second.id }
        return picked.map { buildQuestion(man, it.first, it.second) }
    }

    /**
     * Случайные задачи по ЦЕЛОЙ секции (счётчик на секции) — пул всех
     * прототипов всех подтем секции + та же двухпроходная ротация по базам.
     */
    suspend fun randomQuestionsInSection(
        topics: List<CatalogEntry>,
        count: Int,
        excluding: Set<String> = emptySet(),
    ): List<RunQuestion> {
        val pool = mutableListOf<Triple<TopicManifest, TaskType, Prototype>>()
        for (topic in topics) {
            val man = manifest(topic) ?: continue
            for (type in man.types.orEmpty()) {
                for (proto in type.prototypes.orEmpty()) {
                    val pid = proto.id ?: continue
                    if (!excluding.contains(pid)) pool.add(Triple(man, type, proto))
                }
            }
        }
        pool.shuffle()
        val picked = rotateByBase(pool, count) { it.third.id }
        return picked.map { buildQuestion(it.first, it.second, it.third) }
    }

    /** Двухпроходная ротация по базовым прототипам (общий примитив спреда «вширь»). */
    private fun <T> rotateByBase(pool: List<T>, count: Int, idOf: (T) -> String?): List<T> {
        val usedBases = mutableSetOf<String>()
        val picked = mutableListOf<T>()
        for (item in pool) {
            if (picked.size >= count) break
            val base = baseId(idOf(item) ?: "")
            if (!usedBases.contains(base)) {
                usedBases.add(base)
                picked.add(item)
            }
        }
        if (picked.size < count) {
            val pickedIds = picked.mapNotNull(idOf).toSet()
            for (item in pool) {
                if (picked.size >= count) break
                val id = idOf(item)
                if (id != null && !pickedIds.contains(id)) picked.add(item)
            }
        }
        return picked
    }

    // MARK: Модалка прототипов

    /**
     * Карточка модалки прототипов — порт buildProtoModalCards (picker.js):
     * группировка прототипов ВНУТРИ типа по базовому id; multi-группа
     * получает заголовок по baseId, одиночная — по type.id.
     */
    data class ProtoCard(
        val id: String,            // baseId (unic) — ключ карточки
        val title: String,
        val previewStem: String,
        val previewFigure: Figure?, // рисунок первого варианта
        val topicId: String,
        val cap: Int,              // вариантов в группе
        val protoIds: List<String>, // все id вариантов (для question_stats учителя)
    )

    suspend fun protoCards(topic: CatalogEntry): List<ProtoCard> {
        val man = manifest(topic) ?: return emptyList()
        val cards = mutableListOf<ProtoCard>()
        for (type in man.types.orEmpty()) {
            val groups = mutableMapOf<String, MutableList<Prototype>>()
            val order = mutableListOf<String>()
            for (proto in type.prototypes.orEmpty()) {
                val pid = proto.id ?: continue
                val base = baseId(pid)
                if (groups[base] == null) order.add(base)
                groups.getOrPut(base) { mutableListOf() }.add(proto)
            }
            val multi = order.size > 1
            for (base in order) {
                val protos = groups[base] ?: continue
                val first = protos.firstOrNull() ?: continue
                val q = buildQuestion(man, type, first)
                cards.add(
                    ProtoCard(
                        id = base,
                        title = "${if (multi) base else (type.id ?: base)} ${type.title ?: ""}",
                        previewStem = q.stem,
                        previewFigure = q.figure,
                        topicId = man.topic ?: topic.id,
                        cap = protos.size,
                        protoIds = protos.mapNotNull { it.id },
                    )
                )
            }
        }
        return cards
    }

    /** Случайные варианты конкретного базового прототипа (для счётчика модалки). */
    suspend fun randomQuestionsForProto(
        topic: CatalogEntry,
        baseId: String,
        count: Int,
        excluding: Set<String> = emptySet(),
    ): List<RunQuestion> {
        val man = manifest(topic) ?: return emptyList()
        val pool = mutableListOf<Pair<TaskType, Prototype>>()
        for (type in man.types.orEmpty()) {
            for (proto in type.prototypes.orEmpty()) {
                val pid = proto.id ?: continue
                if (!excluding.contains(pid) && Companion.baseId(pid) == baseId) {
                    pool.add(Pair(type, proto))
                }
            }
        }
        pool.shuffle()
        return pool.take(count).map { buildQuestion(man, it.first, it.second) }
    }

    // MARK: «Решить аналог» (порт pickAnalogQuestion из tasks/analog.js)

    /**
     * Аналог: другой вариант того же ТИПА задания, исключая исходный вариант
     * и уже решённые аналоги. null — вариантов не осталось.
     */
    suspend fun analogQuestion(
        topicId: String,
        baseQuestionId: String,
        usedIds: Set<String>,
    ): RunQuestion? {
        val topic = resolveTopic(topicId, baseQuestionId) ?: return null
        val man = manifest(topic) ?: return null
        // тип, содержащий исходный прототип
        val baseType = man.types.orEmpty().firstOrNull { type ->
            type.prototypes.orEmpty().any { it.id == baseQuestionId }
        } ?: return null
        val exclude = usedIds + baseQuestionId
        val candidates = baseType.prototypes.orEmpty().filter {
            val id = it.id ?: return@filter false
            !exclude.contains(id)
        }
        val picked = candidates.randomOrNull() ?: return null
        return buildQuestion(man, baseType, picked)
    }

    // MARK: Внутренняя сборка

    private fun findProto(man: TopicManifest, questionId: String): Pair<TaskType, Prototype>? {
        for (type in man.types.orEmpty()) {
            for (proto in type.prototypes.orEmpty()) {
                if (proto.id == questionId) return Pair(type, proto)
            }
        }
        return null
    }

    private fun buildQuestion(manifest: TopicManifest, type: TaskType, proto: Prototype): RunQuestion {
        val params = proto.params ?: emptyMap()
        val stemTpl = proto.stem ?: type.stemTemplate ?: type.stem ?: ""
        val stem = interpolate(stemTpl, params)
        val figure = proto.figure ?: type.figure

        // слияние defaults + answer_spec (зеркало computeAnswer)
        val defaults = type.defaults
        val spec = type.answerSpec
        val resolved = ResolvedAnswerSpec(
            type = spec?.type ?: "number",
            format = spec?.format,
            tolerance = spec?.tolerance,
            accept = spec?.accept,
            normalize = spec?.normalize ?: defaults?.normalize ?: emptyList(),
            text = proto.answer?.text,
            value = proto.answer?.value,
        )

        return RunQuestion(
            topicId = manifest.topic ?: "",
            topicTitle = manifest.title ?: "",
            questionId = proto.id ?: "",
            stem = stem,
            figure = figure,
            difficulty = proto.difficulty ?: defaults?.difficulty ?: 1,
            spec = resolved,
        )
    }

    /** Подстановка "\${key}" из params (паритет интерполяции stem-шаблонов веба). */
    internal fun interpolate(tpl: String, params: Map<String, kotlinx.serialization.json.JsonElement>): String {
        val marker = "\${"
        if (!tpl.contains(marker)) return tpl
        val result = StringBuilder()
        var rest = tpl
        while (true) {
            val start = rest.indexOf(marker)
            if (start < 0) break
            result.append(rest, 0, start)
            rest = rest.substring(start + marker.length)
            val end = rest.indexOf('}')
            if (end >= 0) {
                val key = rest.substring(0, end)
                result.append(params[key]?.interpolationText ?: "")
                rest = rest.substring(end + 1)
            } else {
                result.append(marker)
            }
        }
        result.append(rest)
        return result.toString()
    }

    // MARK: Картинки и видео

    /** Абсолютный URL картинки задачи (figure.img — относительный путь content/...). */
    fun figureURL(figure: Figure?): String? {
        val img = figure?.img?.takeIf { it.isNotEmpty() } ?: return null
        if (img.startsWith("http")) return img
        return "${SupabaseConfig.CONTENT_BASE_URL}/${img.trimStart('/')}"
    }

    /**
     * Карта видео-решений Rutube: proto_id -> url (content/video/rutube_map.json),
     * фоллбэк по base_id (id без последнего сегмента) — как в app/video_solutions.js.
     */
    suspend fun videoURL(forQuestionId: String): String? {
        if (videoMap == null) {
            videoMutex.withLock {
                if (videoMap == null) {
                    videoMap = runCatching { loadVideoMap() }.getOrDefault(emptyMap())
                }
            }
        }
        val map = videoMap ?: return null
        map[forQuestionId]?.let { return it }
        // фоллбэк: совпадение по base (без последнего числового сегмента)
        val parts = forQuestionId.split(".")
        if (parts.size >= 4 && parts.last().toIntOrNull() != null) {
            val base = parts.dropLast(1).joinToString(".")
            map[base]?.let { return it }
            for ((k, v) in map) {
                if (k.startsWith("$base.")) return v
            }
        }
        return null
    }

    /** Снэпшот карты видео (для harness-проверок и предзагрузки). */
    suspend fun videoMapSnapshot(): Map<String, String> {
        videoURL("__warmup__") // прогрев карты (ключа заведомо нет)
        return videoMap ?: emptyMap()
    }

    private suspend fun loadVideoMap(): Map<String, String> {
        val (data, status) = fetch("${SupabaseConfig.CONTENT_BASE_URL}/content/video/rutube_map.json")
        if (status != 200) return emptyMap()
        val raw = runCatching {
            AppJson.parseToJsonElement(data.decodeToString()) as? JsonObject
        }.getOrNull() ?: return emptyMap()
        val map = mutableMapOf<String, String>()
        for ((k, v) in raw) {
            val s = v.stringValue
            if (!s.isNullOrEmpty()) {
                map[k] = normalizeVideoURL(s)
            } else {
                val urlInObj = (v as? JsonObject)?.get("url")?.stringValue
                if (!urlInObj.isNullOrEmpty()) map[k] = normalizeVideoURL(urlInObj)
            }
        }
        return map
    }

    private fun normalizeVideoURL(raw: String): String {
        var s = raw.trim()
        if (s.startsWith("//")) s = "https:$s"
        if (!s.startsWith("http")) s = "https://$s"
        return s
    }

    private fun JsonPrimitive?.orEmptyContent(): String = this?.content ?: ""
}
