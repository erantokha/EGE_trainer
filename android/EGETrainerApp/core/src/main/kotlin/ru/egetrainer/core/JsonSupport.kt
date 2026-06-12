package ru.egetrainer.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * Единый Json-конфиг ядра (зеркало терпимости JSONDecoder в iOS:
 * незнакомые ключи игнорируются, null-поля не сериализуются явно).
 */
val AppJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = false
}

/** Хелперы динамического JSON — порт computed-свойств JSONValue.swift. */

val JsonElement.stringValue: String?
    get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

val JsonElement.doubleValue: Double?
    get() = when (this) {
        is JsonPrimitive -> if (isString) content.toDoubleOrNull() else doubleOrNull
        else -> null
    }

val JsonElement.boolValue: Boolean?
    get() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toBooleanStrictOrNull()

val JsonElement.objectValue: JsonObject?
    get() = this as? JsonObject

val JsonElement.arrayValue: JsonArray?
    get() = this as? JsonArray

/**
 * Строковое представление числа для интерполяции в stem —
 * паритет с JS String(number): 5.0 -> "5", 0.25 -> "0.25".
 */
fun interpolationText(n: Double): String =
    if (n == Math.rint(n) && kotlin.math.abs(n) < 1e15) n.toLong().toString() else n.toString()

/** Интерполяционный текст произвольного JSON-значения (JSONValue.interpolationText). */
val JsonElement.interpolationText: String
    get() = when (this) {
        is JsonNull -> ""
        is JsonPrimitive -> when {
            isString -> content
            content == "true" || content == "false" -> content
            else -> doubleOrNull?.let { interpolationText(it) } ?: content
        }
        else -> ""
    }
