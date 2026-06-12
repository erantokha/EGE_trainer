package ru.egetrainer.core.services

import java.net.URI
import java.net.URLEncoder

/**
 * Порт toRutubeEmbedUrl (app/video_solutions.js / RutubePlayerView.swift):
 * rutube.ru/video/<id> | /video/embed/<id> | /play/embed/<id>
 * -> https://rutube.ru/play/embed/<id>; иначе исходный URL.
 */
object RutubeUtil {
    fun embedURL(from: String): String {
        val uri = runCatching { URI(from) }.getOrNull() ?: return from
        val host = uri.host?.lowercase() ?: return from
        if (!host.contains("rutube")) return from
        val parts = (uri.path ?: "").split("/").filter { it.isNotEmpty() }

        var id: String? = null
        val playIdx = parts.indexOf("play")
        val videoIdx = parts.indexOf("video")
        if (playIdx >= 0 && parts.getOrNull(playIdx + 1) == "embed" && parts.getOrNull(playIdx + 2) != null) {
            id = parts[playIdx + 2]
        } else if (videoIdx >= 0) {
            id = if (parts.getOrNull(videoIdx + 1) == "embed" && parts.getOrNull(videoIdx + 2) != null) {
                parts[videoIdx + 2]
            } else {
                parts.getOrNull(videoIdx + 1)
            }
        }
        val safe = id?.takeIf { it.isNotEmpty() }
            ?.let { URLEncoder.encode(it, "UTF-8") }
            ?: return from
        return "https://rutube.ru/play/embed/$safe"
    }
}
