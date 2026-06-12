package ru.egetrainer.app.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Дизайн-токены — порт tasks/trainer/tokens.css (значения hex 1-в-1):
 * светлая палитра = :root, тёмная = [data-theme="dark"].
 * На Android — системная тема (эквивалент ручного переключателя сайта),
 * как Theme.swift в iOS.
 */
@Immutable
data class EgeColors(
    val bgPlain: Color,      // --bg (фон страницы; контент-зоны используют surface)
    val bg: Color,           // --surface (фон контент-области, как Theme.bg iOS)
    val surface2: Color,     // --surface2 (сайдбар/hover-подложки)
    val panel: Color,        // --panel (карточки)
    val panel2: Color,       // --panel-2 (вторичные элементы/прогресс-подложка)
    val border: Color,       // --border
    val borderLight: Color,  // светлая обводка карточек (iOS borderLight)
    val text: Color,         // --text
    val textDim: Color,      // --text-dim
    val accent: Color,       // --accent
    val accent2: Color,      // --accent-2
    val accentLight: Color,  // --accent-light
    val success: Color,      // --success
    val danger: Color,       // --danger
    val muted: Color,        // --muted
    val focusRing: Color,    // --focus-ring rgba(59,130,246,.35)
    // Статусные подложки (iOS Theme.successBg/dangerBg/warnBg/warnText)
    val successBg: Color,
    val dangerBg: Color,
    val warnBg: Color,
    val warnText: Color,
    // Тени (--shadow / --shadow-md как цвет с альфой)
    val cardShadow: Color,
    // Бейджи точности/давности — фоны 5 классов из base.css
    // (.modal-stats-badge.{gray,green,lime,yellow,red})
    val badgeGrayBg: Color,   // rgba(148,163,184,.10)
    val badgeGreenBg: Color,  // rgba(16,185,129,.12)
    val badgeLimeBg: Color,   // rgba(132,204,22,.14)
    val badgeYellowBg: Color, // rgba(245,158,11,.16)
    val badgeRedBg: Color,    // rgba(239,68,68,.14)
)

private fun c(hex: Long, alpha: Float = 1f): Color =
    Color(
        red = ((hex shr 16) and 0xFF) / 255f,
        green = ((hex shr 8) and 0xFF) / 255f,
        blue = (hex and 0xFF) / 255f,
        alpha = alpha,
    )

/** Светлая палитра = :root tokens.css. */
val EgeLightColors = EgeColors(
    bgPlain = c(0xFFFFFF),      // --bg:#ffffff
    bg = c(0xF8FAFC),           // --surface:#f8fafc
    surface2 = c(0xF1F5F9),     // --surface2:#f1f5f9
    panel = c(0xFFFFFF),        // --panel:#ffffff
    panel2 = c(0xE5E7EB),       // --panel-2:#e5e7eb
    border = c(0xD1D5DB),       // --border:#d1d5db
    borderLight = c(0xE5E7EB),
    text = c(0x111827),         // --text:#111827
    textDim = c(0x6B7280),      // --text-dim:#6b7280
    accent = c(0x2563EB),       // --accent:#2563eb
    accent2 = c(0x1D4ED8),      // --accent-2:#1d4ed8
    accentLight = c(0xDBEAFE),  // --accent-light:#dbeafe
    success = c(0x059669),      // --success:#059669
    danger = c(0xDC2626),       // --danger:#dc2626
    muted = c(0xFFFFFF),        // --muted:#ffffff
    focusRing = c(0x3B82F6, 0.35f),
    successBg = c(0xD1FAE5),
    dangerBg = c(0xFEE2E2),
    warnBg = c(0xFEF3C7),
    warnText = c(0xB45309),
    cardShadow = c(0x0F172A, 0.08f), // --shadow-md rgba(15,23,42,.08)
    badgeGrayBg = c(0x94A3B8, 0.10f),
    badgeGreenBg = c(0x10B981, 0.12f),
    badgeLimeBg = c(0x84CC16, 0.14f),
    badgeYellowBg = c(0xF59E0B, 0.16f),
    badgeRedBg = c(0xEF4444, 0.14f),
)

/** Тёмная палитра = [data-theme="dark"] tokens.css. */
val EgeDarkColors = EgeColors(
    bgPlain = c(0x0E1117),      // --bg:#0e1117
    bg = c(0x0B1320),           // --surface:#0b1320
    surface2 = c(0x0F1623),     // --surface2:#0f1623
    panel = c(0x111827),        // --panel:#111827
    panel2 = c(0x0F1623),       // --panel-2:#0f1623
    border = c(0x232635),       // --border:#232635
    borderLight = c(0x232635),
    text = c(0xE6E6E6),         // --text:#e6e6e6
    textDim = c(0xAEB3C2),      // --text-dim:#aeb3c2
    accent = c(0x3B82F6),       // --accent:#3b82f6
    accent2 = c(0x2563EB),      // --accent-2:#2563eb
    accentLight = c(0x3B82F6, 0.16f), // --accent-light rgba(59,130,246,.16)
    success = c(0x10B981),      // --success:#10b981
    danger = c(0xEF4444),       // --danger:#ef4444
    muted = c(0x1B1D24),        // --muted:#1b1d24
    focusRing = c(0x3B82F6, 0.35f),
    successBg = c(0x10B981, 0.16f),
    dangerBg = c(0xEF4444, 0.16f),
    warnBg = c(0xF59E0B, 0.18f),
    warnText = c(0xFBBF24),
    cardShadow = c(0x000000, 0.35f), // --shadow-md dark rgba(0,0,0,.35)
    badgeGrayBg = c(0x94A3B8, 0.10f),
    badgeGreenBg = c(0x10B981, 0.12f),
    badgeLimeBg = c(0x84CC16, 0.14f),
    badgeYellowBg = c(0xF59E0B, 0.16f),
    badgeRedBg = c(0xEF4444, 0.14f),
)

val LocalEgeColors = staticCompositionLocalOf { EgeLightColors }

/** Размерные токены tokens.css (radius / fs / space / dur). */
object EgeDims {
    // --radius:12px; --radius-sm/md/lg/pill
    val radius: Dp = 12.dp
    val radiusSm: Dp = 10.dp
    val radiusMd: Dp = 12.dp
    val radiusLg: Dp = 16.dp
    val radiusPill: Dp = 999.dp

    // --fs-2xs..--fs-2xl (px ≈ sp)
    val fs2xs = 11.sp
    val fsXs = 12.sp
    val fsSm = 13.sp
    val fsMd = 14.sp
    val fsLg = 16.sp
    val fsXl = 18.sp
    val fs2xl = 20.sp

    // --space-1..--space-6
    val space1 = 2.dp
    val space2 = 4.dp
    val space3 = 6.dp
    val space4 = 8.dp
    val space5 = 10.dp
    val space6 = 12.dp

    // --dur-fast:120ms; --dur-base:.2s
    const val durFastMs = 120
    const val durBaseMs = 200

    // --figure-h:300px (кап высоты рисунка задачи)
    val figureH = 300.dp
}

object EgeTheme {
    val colors: EgeColors
        @Composable get() = LocalEgeColors.current
}

/** Обвязка темы: Ege-палитра + MaterialTheme, перекрашенный в наши токены
 *  (чтобы системные компоненты — поля, индикаторы — не были стоково-фиолетовыми). */
@Composable
fun EgeAppTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = if (dark) EgeDarkColors else EgeLightColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = colors.accent,
            onPrimary = Color.White,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.panel,
            onSurface = colors.text,
            surfaceVariant = colors.surface2,
            onSurfaceVariant = colors.textDim,
            outline = colors.border,
            error = colors.danger,
        )
    } else {
        lightColorScheme(
            primary = colors.accent,
            onPrimary = Color.White,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.panel,
            onSurface = colors.text,
            surfaceVariant = colors.surface2,
            onSurfaceVariant = colors.textDim,
            outline = colors.border,
            error = colors.danger,
        )
    }
    CompositionLocalProvider(LocalEgeColors provides colors) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
