package ru.egetrainer.app.designsystem

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import ru.egetrainer.core.services.RutubeUtil

/**
 * Встроенный плеер видео-решения (Rutube embed) — порт RutubePlayerView.swift,
 * паритет с iframe-встройкой сайта (app/video_solutions.js: toRutubeEmbedUrl;
 * сама конвертация — RutubeUtil.embedURL в :core).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun RutubeWebPlayer(videoUrl: String, modifier: Modifier = Modifier) {
    val embed = RutubeUtil.embedURL(videoUrl)
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = true
                settings.domStorageEnabled = true
                webViewClient = WebViewClient()
            }
        },
        update = { web ->
            if (web.tag != embed) {
                web.tag = embed
                web.loadUrl(embed)
            }
        },
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f),
    )
}

/** Шит «Видео-разбор» (точка входа из карточек разбора — WAND.2). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RutubePlayerSheet(videoUrl: String, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EgeTheme.colors.panel,
    ) {
        Text(
            "Видео-разбор",
            color = EgeTheme.colors.text,
            fontSize = EgeDims.fsLg,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        RutubeWebPlayer(videoUrl, Modifier.padding(16.dp))
    }
}
