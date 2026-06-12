package ru.egetrainer.core.models

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import ru.egetrainer.core.interpolationText

// MARK: content/tasks/index.json

/** Запись каталога тем (index.json или RPC catalog_index_like_v1). */
@Serializable
data class CatalogEntry(
    val id: String,
    val title: String? = null,
    val type: String? = null, // "group" у секций
    val parent: String? = null,
    val path: String? = null, // content/tasks/<dir>/<topic>.json
    val enabled: Boolean? = null,
    val hidden: Boolean? = null,
) {
    val isSection: Boolean get() = type == "group"
    val isSelectableTopic: Boolean
        get() = parent != null && enabled != false && hidden != true && path != null
}

// MARK: Манифест темы (content/tasks/<dir>/<topic>.json)

@Serializable
data class TopicManifest(
    val topic: String? = null,
    val title: String? = null,
    val types: List<TaskType>? = null,
)

@Serializable
data class TaskType(
    val id: String? = null,
    val title: String? = null,
    val defaults: TypeDefaults? = null,
    // Контент использует оба написания ключа (зеркало TaskType.init(from:) iOS).
    @SerialName("answer_spec") val answerSpecSnake: AnswerSpecRaw? = null,
    @SerialName("answerSpec") val answerSpecCamel: AnswerSpecRaw? = null,
    @SerialName("stem_template") val stemTemplate: String? = null,
    val stem: String? = null,
    val figure: Figure? = null,
    val prototypes: List<Prototype>? = null,
) {
    val answerSpec: AnswerSpecRaw? get() = answerSpecSnake ?: answerSpecCamel
}

@Serializable
data class TypeDefaults(
    val difficulty: Int? = null,
    val normalize: List<String>? = null,
)

/** answer_spec из контента (поля могут перекрываться defaults). */
@Serializable
data class AnswerSpecRaw(
    val type: String? = null,   // "string" | "number"
    val format: String? = null, // "ege_decimal" | null
    val tolerance: Tolerance? = null,
    val accept: List<AcceptPattern>? = null,
    val normalize: List<String>? = null,
)

@Serializable
data class Tolerance(
    val abs: Double? = null,
    val rel: Double? = null,
)

@Serializable
data class AcceptPattern(
    val exact: String? = null,
    val regex: String? = null,
    val flags: String? = null,
)

@Serializable
data class Prototype(
    val id: String? = null,
    val stem: String? = null,
    val params: Map<String, JsonElement>? = null,
    val figure: Figure? = null,
    val answer: PrototypeAnswer? = null,
    val difficulty: Int? = null,
)

/** answer.text иногда числовой в JSON — кастомный декод (зеркало PrototypeAnswer iOS). */
@Serializable(with = PrototypeAnswerSerializer::class)
data class PrototypeAnswer(
    val text: String? = null,
    val value: Double? = null,
)

object PrototypeAnswerSerializer : KSerializer<PrototypeAnswer> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("PrototypeAnswer")

    override fun deserialize(decoder: Decoder): PrototypeAnswer {
        val input = decoder as? JsonDecoder
            ?: throw IllegalStateException("PrototypeAnswer: only JSON supported")
        val obj = input.decodeJsonElement().jsonObject
        val textEl = obj["text"]
        val text = when {
            textEl == null || textEl is JsonNull -> null
            textEl is JsonPrimitive && textEl.isString -> textEl.content
            textEl is JsonPrimitive ->
                textEl.doubleOrNull?.let { interpolationText(it) } ?: textEl.content
            else -> null
        }
        val valueEl = obj["value"]
        val value = (valueEl as? JsonPrimitive)?.let {
            if (it.isString) it.content.toDoubleOrNull() else it.doubleOrNull
        }
        return PrototypeAnswer(text = text, value = value)
    }

    override fun serialize(encoder: Encoder, value: PrototypeAnswer) {
        throw UnsupportedOperationException("PrototypeAnswer encode не используется")
    }
}

@Serializable
data class Figure(
    val img: String? = null,
    val alt: String? = null,
)

// MARK: Собранный вопрос для прохождения (зеркало buildQuestion из hw.js)

data class RunQuestion(
    val topicId: String,
    val topicTitle: String,
    val questionId: String,
    val stem: String,
    val figure: Figure? = null,
    val difficulty: Int,
    val spec: ResolvedAnswerSpec,
) {
    val id: String get() = questionId
}

/** Спецификация ответа после слияния defaults + answer_spec + answer прототипа. */
data class ResolvedAnswerSpec(
    val type: String, // "string" | "number" | прочее
    val format: String? = null,
    val tolerance: Tolerance? = null,
    val accept: List<AcceptPattern>? = null,
    val normalize: List<String> = emptyList(),
    val text: String? = null,
    val value: Double? = null,
)

/** Результат проверки ответа. */
data class AnswerCheckResult(
    val correct: Boolean,
    val chosenText: String,
    val normalizedText: String,
    val correctText: String,
)
