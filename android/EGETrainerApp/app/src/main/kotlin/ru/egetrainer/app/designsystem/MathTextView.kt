package ru.egetrainer.app.designsystem

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Текст условия с TeX-формулами — порт MathTextView.swift (паритет с
 * task-stem сайта: MathJax 3, разделители `\( \)` и `$ $`, SVG-вывод).
 * Движок — vendored assets/mathjax-tex-svg.js, офлайн. Текст без TeX —
 * нативный Text.
 *
 * Готчи iOS (обязательные):
 * - `<meta charset="utf-8">` — без него кириллица в моджибейк;
 * - высота меряется по ВНУТРЕННЕМУ контейнеру #c (не по viewport) и
 *   пересообщается ResizeObserver'ом при КАЖДОМ изменении размеров —
 *   LazyColumn может создать ячейку до назначения полной ширины.
 */
fun containsTeX(s: String): Boolean {
    if (s.contains("\\(") || s.contains("\\[")) return true
    val first = s.indexOf('$')
    if (first >= 0 && s.indexOf('$', first + 1) > first) return true
    return false
}

@Composable
fun MathText(
    text: String,
    modifier: Modifier = Modifier,
    fontSizeSp: Int = 17,
) {
    if (containsTeX(text)) {
        MathWebView(text = text, fontSizeSp = fontSizeSp, modifier = modifier)
    } else {
        Text(
            text = text,
            modifier = modifier,
            color = EgeTheme.colors.text,
            fontSize = fontSizeSp.sp,
            lineHeight = (fontSizeSp * 1.45f).sp,
        )
    }
}

/** JS-bridge: страница сообщает высоту контейнера #c (CSS px ≈ dp при initial-scale=1). */
private class SizeBridge(@Volatile var onSize: (Int) -> Unit) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun postSize(h: Int) {
        if (h > 0) main.post { onSize(h) }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun MathWebView(text: String, fontSizeSp: Int, modifier: Modifier) {
    var heightDp by remember(text) { mutableIntStateOf(30) }
    val dark = isSystemInDarkTheme()
    val textColor = if (dark) "#e6e6e6" else "#111827"
    val html = remember(text, fontSizeSp, textColor) { buildHtml(text, fontSizeSp, textColor) }

    androidx.compose.ui.viewinterop.AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.allowFileAccess = true
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                addJavascriptInterface(SizeBridge { }, BRIDGE)
            }
        },
        update = { web ->
            // перенацеливаем bridge на актуальный state (recomposition-safe)
            web.removeJavascriptInterface(BRIDGE)
            web.addJavascriptInterface(SizeBridge { h -> heightDp = h }, BRIDGE)
            if (web.tag != html) {
                web.tag = html
                // base = android_asset: <script src="mathjax-tex-svg.js"> грузится
                // из assets (офлайн, аналог loadFileURL из workDir в iOS)
                web.loadDataWithBaseURL(
                    "file:///android_asset/", html, "text/html", "utf-8", null,
                )
            }
        },
        modifier = modifier
            .fillMaxWidth()
            .height(heightDp.dp),
    )
}

private const val BRIDGE = "EgeBridge"

private fun buildHtml(stem: String, fontSizeSp: Int, textColor: String): String {
    var escaped = stem
    for ((raw, ent) in listOf("&" to "&amp;", "<" to "&lt;", ">" to "&gt;")) {
        escaped = escaped.replace(raw, ent)
    }
    // language=HTML
    return """
        <!doctype html><html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          :root{color-scheme: light dark;}
          html,body{margin:0;padding:0;background:transparent;}
          body{
            font-family: sans-serif;
            font-size: ${fontSizeSp}px;
            line-height: 1.45;
            color: $textColor;
            overflow-wrap: break-word;
          }
          mjx-container svg{vertical-align:middle;}
        </style>
        <script>
          window.MathJax = {
            /* Kotlin raw-string: '\\(' здесь — ДВА символа в HTML, JS видит '\(' .
               (Готча порта: в Swift-строке тот же литерал требовал четырёх '\'.) */
            tex: { inlineMath: [['\\(','\\)'], ['${'$'}', '${'$'}']] },
            svg: { fontCache: 'local' }
          };
          function reportSize(){
            var c = document.getElementById('c');
            if (!c) return;
            var h = Math.ceil(c.getBoundingClientRect().height);
            if (h > 0 && window.$BRIDGE) { $BRIDGE.postSize(h); }
          }
          window.addEventListener('load', function(){
            reportSize();
            var c = document.getElementById('c');
            if (window.ResizeObserver && c) {
              new ResizeObserver(reportSize).observe(c);
            }
            window.addEventListener('resize', reportSize);
          });
        </script>
        <script src="mathjax-tex-svg.js" async></script>
        </head><body><div id="c">$escaped</div></body></html>
    """.trimIndent()
}
