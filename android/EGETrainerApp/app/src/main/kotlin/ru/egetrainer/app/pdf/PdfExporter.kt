package ru.egetrainer.app.pdf

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.suspendCancellableCoroutine
import ru.egetrainer.core.models.RunQuestion
import ru.egetrainer.core.services.SupabaseConfig
import kotlin.coroutines.resume

/**
 * PDF-экспорт листа задач — порт PDFExporter.swift (печать сайта print_btn.js):
 * заголовок, нумерованные условия с формулами (MathJax из assets) и рисунками,
 * опционально ответы. Рендер: HTML → offscreen WebView →
 * PrintDocumentAdapter (createPrintDocumentAdapter) → PDF-файл → share.
 *
 * Готча (как iOS): ждём typeset MathJax + загрузку картинок (JS-сигнал ready,
 * максимум 20 с) перед печатью, иначе формулы/рисунки не попадут в PDF.
 */
object PdfExporter {

    /** HTML-лист (паритет print-вёрстки сайта; charset utf-8, A4 page-break). */
    fun html(title: String?, questions: List<RunQuestion>, withAnswers: Boolean): String {
        fun esc(s: String): String {
            var r = s
            for ((raw, ent) in listOf("&" to "&amp;", "<" to "&lt;", ">" to "&gt;")) r = r.replace(raw, ent)
            return r
        }
        val sb = StringBuilder()
        if (!title.isNullOrEmpty()) sb.append("<h1>${esc(title)}</h1>")
        questions.forEachIndexed { idx, q ->
            sb.append("<div class=\"task\"><div class=\"num\">${idx + 1}</div><div class=\"stem\">${esc(q.stem)}")
            q.figure?.img?.takeIf { it.isNotEmpty() }?.let { fig ->
                val src = if (fig.startsWith("http")) fig else "${SupabaseConfig.CONTENT_BASE_URL}/${fig.trimStart('/')}"
                sb.append("<div class=\"fig\"><img src=\"$src\"></div>")
            }
            if (withAnswers) {
                val ans = ru.egetrainer.app.designsystem.Fmt.answer(q.spec.text, q.spec.value)
                sb.append("<div class=\"ans\">Ответ: ${esc(ans)}</div>")
            }
            sb.append("</div></div>")
        }
        // language=HTML
        return """
            <!doctype html><html><head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body{font-family:sans-serif;font-size:13px;color:#111;margin:0;padding:16px;}
              h1{font-size:18px;margin:0 0 14px;}
              .task{display:flex;gap:10px;margin-bottom:14px;page-break-inside:avoid;}
              .num{font-weight:700;min-width:22px;}
              .fig img{max-width:300px;max-height:200px;display:block;margin-top:6px;}
              .ans{margin-top:6px;font-weight:600;color:#047857;}
              mjx-container svg{vertical-align:middle;}
            </style>
            <script>
              window.MathJax = {
                tex: { inlineMath: [['\\(','\\)'], ['$', '$']] },
                svg: { fontCache: 'local' },
                startup: { pageReady: function () {
                  return MathJax.startup.defaultPageReady().then(function () {
                    if (window.EgePdf) window.EgePdf.ready();
                  });
                } }
              };
            </script>
            <script src="mathjax-tex-svg.js" async></script>
            </head><body>$sb</body></html>
        """.trimIndent()
    }

    /**
     * Рендерит лист и отдаёт его системному PrintManager (A4). Системный
     * диалог печати Android даёт «Сохранить как PDF» и «Отправить» —
     * ближе к browser print веба, чем самописный экспорт; держит WebView
     * до завершения задания. Должен вызываться на главном потоке.
     */
    suspend fun printViaSystem(
        context: Context,
        title: String?,
        questions: List<RunQuestion>,
        withAnswers: Boolean,
    ) {
        val htmlStr = html(title, questions, withAnswers)
        // offscreen WebView, ждём ready (MathJax typeset + load), максимум 20 с
        val web = suspendCancellableCoroutine<WebView> { cont ->
            val w = WebView(context)
            w.settings.javaScriptEnabled = true
            w.settings.allowFileAccess = true
            w.settings.loadWithOverviewMode = true
            // Готча: offscreen WebView НЕ присоединена к окну, поэтому View.post/
            // postDelayed (HandlerActionQueue) не выполнятся никогда. Диспетчеризуем
            // через главный Looper — иначе ready/onPageFinished/таймаут не сработают
            // и printViaSystem зависнет на «Готовим PDF...».
            val main = Handler(Looper.getMainLooper())
            var resumed = false
            fun done() { if (!resumed) { resumed = true; cont.resume(w) } }
            w.addJavascriptInterface(object {
                @android.webkit.JavascriptInterface fun ready() { main.post { done() } }
            }, "EgePdf")
            w.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { main.postDelayed({ done() }, 1500) }
            }
            main.postDelayed({ done() }, 20_000)
            w.loadDataWithBaseURL("file:///android_asset/", htmlStr, "text/html", "utf-8", null)
        }
        val jobName = (title?.takeIf { it.isNotEmpty() } ?: "Задачи EGE")
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
        val adapter = web.createPrintDocumentAdapter(jobName)
        webHolder = web // держим ссылку, чтобы WebView не собрался GC до конца печати
        printManager.print(jobName, adapter,
            PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
    }

    // удерживаем последний печатаемый WebView от GC на время системного задания
    private var webHolder: WebView? = null
}
