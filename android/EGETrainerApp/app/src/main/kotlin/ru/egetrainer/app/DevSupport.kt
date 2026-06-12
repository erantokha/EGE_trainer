package ru.egetrainer.app

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.egetrainer.app.designsystem.AccuracyBadge
import ru.egetrainer.app.designsystem.BadgeColor
import ru.egetrainer.app.designsystem.EgeCard
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EyebrowText
import ru.egetrainer.app.designsystem.FigureView
import ru.egetrainer.app.designsystem.MathText
import ru.egetrainer.app.designsystem.MetricHelpIcon
import ru.egetrainer.core.models.Figure

/**
 * DEBUG-хуки для скриптовой приёмки (порт DevSupport.swift):
 * intent extras E2E_DEMO / E2E_EMAIL / E2E_PASSWORD / E2E_AUTH_TAB.
 * В release-сборке отключены по построению (BuildConfig.DEBUG).
 */
object DevSupport {
    fun demo(intent: Intent?): String? =
        if (BuildConfig.DEBUG) intent?.getStringExtra("E2E_DEMO") else null

    fun autologin(intent: Intent?): Pair<String, String>? {
        if (!BuildConfig.DEBUG) return null
        val email = intent?.getStringExtra("E2E_EMAIL") ?: return null
        val password = intent.getStringExtra("E2E_PASSWORD") ?: return null
        return Pair(email, password)
    }

    fun authTab(intent: Intent?): String? =
        if (BuildConfig.DEBUG) intent?.getStringExtra("E2E_AUTH_TAB") else null
}

/** Demo-галерея «math»: формулы, картинка, бейджи, тултип — приёмка П-У2. */
@Composable
fun MathDemoScreen() {
    val samples = listOf(
        "Найдите значение выражения \\(\\frac{3}{4} + \\frac{1}{6}\\).",
        "Вычислите \\(\\sqrt{169} - 5^2\\) и запишите ответ.",
        "Решите уравнение ${'$'}x^2 - 5x + 6 = 0${'$'}. В ответе укажите меньший корень.",
        "Площадь треугольника равна \\(S = \\frac{1}{2}ah\\), где ${'$'}a${'$'} — основание, " +
            "${'$'}h${'$'} — высота. Стороны параллелограмма равны 10 и 11, высота, опущенная " +
            "на бóльшую сторону, равна 5. Найдите высоту, опущенную на меньшую сторону.",
        "Текст без формул — рендерится нативным Text, без WebView.",
    )
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(EgeTheme.colors.bg),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                EyebrowText("Demo: формулы и компоненты")
                Spacer(Modifier.width(6.dp))
                MetricHelpIcon("forecast")
            }
        }
        items(samples) { stem ->
            EgeCard { MathText(stem) }
        }
        item {
            EgeCard {
                Text(
                    "Рисунок задачи (SVG с прод-сайта):",
                    color = EgeTheme.colors.textDim,
                    fontSize = EgeDims.fsSm,
                    fontWeight = FontWeight.Medium,
                )
                FigureView(Figure(img = "content/tasks/1/img/1.1_1.svg", alt = "Демо-рисунок"))
            }
        }
        item {
            Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                AccuracyBadge("3/3 · 100%", BadgeColor.Green)
                AccuracyBadge("2/3 · 67%", BadgeColor.Yellow)
                AccuracyBadge("0/3", BadgeColor.Red)
                AccuracyBadge("Не решал", BadgeColor.Gray)
            }
        }
    }
}
