package ru.egetrainer.core.services

/** Бакет resolve-батча: scope_kind 'proto'|'topic'|'section', scope_id, n (уже с over-fetch). */
data class ResolveRequest(
    val scopeKind: String,
    val scopeId: String,
    val n: Int,
)
