package ru.egetrainer.app.designsystem

import android.annotation.SuppressLint
import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.viewinterop.AndroidView
import ru.egetrainer.core.models.Figure
import ru.egetrainer.core.services.ContentService

/**
 * Картинка задачи — порт FigureView.swift. Контент сайта в основном SVG.
 *
 * Готча Android (найдена в WAND.1, диагностика 2026-06-12): Chromium-WebView
 * НЕ растеризует SVG контента через `<img>`-тег (onload приходит, пиксели не
 * рисуются — pt-размеры + сдвинутый viewBox dvisvgm), но тот же файл как
 * самостоятельный документ рендерит корректно. Поэтому: .svg → прямой
 * loadUrl с вписыванием (overview mode); растровые → `<img>`-обёртка.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun FigureView(
    figure: Figure?,
    modifier: Modifier = Modifier,
    maxHeight: Dp = EgeDims.figureH, // --figure-h:300px
) {
    val url = ContentService.shared.figureURL(figure) ?: return
    val isSvg = url.substringBefore('?').lowercase().endsWith(".svg")

    // language=HTML
    val rasterHtml = """
        <!doctype html><html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html,body{margin:0;padding:0;}
          body{text-align:center;}
          img{max-width:100%;max-height:100vh;display:inline-block;}
        </style></head>
        <body><img src="$url" alt=""></body></html>
    """.trimIndent()

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
            }
        },
        update = { web ->
            if (web.tag != url) {
                web.tag = url
                if (isSvg) {
                    web.loadUrl(url)
                } else {
                    web.loadDataWithBaseURL("https://ege-trainer.ru/", rasterHtml, "text/html", "utf-8", null)
                }
            }
        },
        modifier = modifier
            .fillMaxWidth()
            .height(maxHeight),
    )
}
