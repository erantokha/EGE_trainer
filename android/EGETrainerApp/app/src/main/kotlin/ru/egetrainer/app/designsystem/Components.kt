package ru.egetrainer.app.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/**
 * Переиспользуемые компоненты — порт Components.swift (паритет с вебом:
 * .panel-карточки, бейджи, кнопки «Войти»/«Начать», состояния).
 */

// MARK: Карточка (белая панель с мягкой тенью — паритет с .panel веба)

@Composable
fun EgeCard(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = EgeTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(EgeDims.radiusLg), clip = false,
                ambientColor = colors.cardShadow, spotColor = colors.cardShadow)
            .clip(RoundedCornerShape(EgeDims.radiusLg))
            .background(colors.panel)
            .border(1.dp, colors.borderLight, RoundedCornerShape(EgeDims.radiusLg))
            .padding(padding),
        content = content,
    )
}

// MARK: Eyebrow (синий капс-заголовок «ПРОГНОЗ ЕГЭ» и т.п.)

@Composable
fun EyebrowText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        color = EgeTheme.colors.accent,
        fontSize = EgeDims.fsXs,
        fontWeight = FontWeight.Bold,
        letterSpacing = androidx.compose.ui.unit.TextUnit(1f, androidx.compose.ui.unit.TextUnitType.Sp),
    )
}

// MARK: Бейджи статусов (Сдано / Не сдано / нейтральный)

enum class BadgeStyle { Success, Danger, Warning, Neutral }

@Composable
fun StatusBadge(text: String, style: BadgeStyle, modifier: Modifier = Modifier) {
    val colors = EgeTheme.colors
    val (fg, bg) = when (style) {
        BadgeStyle.Success -> colors.success to colors.successBg
        BadgeStyle.Danger -> colors.danger to colors.dangerBg
        BadgeStyle.Warning -> colors.warnText to colors.warnBg
        BadgeStyle.Neutral -> colors.textDim to colors.surface2
    }
    Text(
        text = text,
        modifier = modifier
            .clip(RoundedCornerShape(EgeDims.radiusPill))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        color = fg,
        fontSize = EgeDims.fsXs,
        fontWeight = FontWeight.Medium,
    )
}

// MARK: Бейджи точности/давности — 5 классов веба (picker_common.js)

enum class BadgeColor { Gray, Red, Yellow, Lime, Green }

/** badgeClassByPct: ≥90 green, ≥70 lime, ≥50 yellow, <50 red, null/NaN gray. */
fun badgeColorByPct(p: Int?): BadgeColor = when {
    p == null -> BadgeColor.Gray
    p >= 90 -> BadgeColor.Green
    p >= 70 -> BadgeColor.Lime
    p >= 50 -> BadgeColor.Yellow
    else -> BadgeColor.Red
}

/** badgeClassByLastAttemptAt: <7д green, <14д lime, ≤30д yellow, >30 red, нет gray. */
fun badgeColorByLastAttemptAt(isoDate: String?, nowMs: Long = System.currentTimeMillis()): BadgeColor {
    val ts = Fmt.parseISO(isoDate)?.toEpochMilli() ?: return BadgeColor.Gray
    val diffDays = ((nowMs - ts).coerceAtLeast(0)) / 86_400_000.0
    return when {
        diffDays < 7 -> BadgeColor.Green
        diffDays < 14 -> BadgeColor.Lime
        diffDays <= 30 -> BadgeColor.Yellow
        else -> BadgeColor.Red
    }
}

@Composable
fun accuracyBadgeBg(color: BadgeColor): Color = when (color) {
    BadgeColor.Gray -> EgeTheme.colors.badgeGrayBg
    BadgeColor.Green -> EgeTheme.colors.badgeGreenBg
    BadgeColor.Lime -> EgeTheme.colors.badgeLimeBg
    BadgeColor.Yellow -> EgeTheme.colors.badgeYellowBg
    BadgeColor.Red -> EgeTheme.colors.badgeRedBg
}

/** На вебе текст бейджа всегда var(--text) (base.css:914) — паритет (находка П-У1). */
@Composable
fun accuracyBadgeFg(@Suppress("UNUSED_PARAMETER") color: BadgeColor): Color = EgeTheme.colors.text

@Composable
fun AccuracyBadge(text: String, color: BadgeColor, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier
            .clip(RoundedCornerShape(EgeDims.radiusSm))
            .background(accuracyBadgeBg(color))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        color = accuracyBadgeFg(color),
        fontSize = EgeDims.fsXs,
        fontWeight = FontWeight.Medium,
    )
}

// MARK: Прогресс-полоска темы (синяя на сером, как в аккордеоне)

@Composable
fun TopicProgressBar(pct: Int?, modifier: Modifier = Modifier) {
    val colors = EgeTheme.colors
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(7.dp)
            .clip(RoundedCornerShape(EgeDims.radiusPill))
            .background(colors.panel2),
    ) {
        val clamped = (pct ?: 0).coerceIn(0, 100)
        if (clamped > 0) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(clamped / 100f)
                    .height(7.dp)
                    .clip(RoundedCornerShape(EgeDims.radiusPill))
                    .background(colors.accent),
            )
        }
    }
}

// MARK: Кнопки («Войти»/«Начать» — синий градиент; вторичная — панель с обводкой)

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val colors = EgeTheme.colors
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(EgeDims.radiusMd))
            .background(
                Brush.verticalGradient(listOf(colors.accent, colors.accent2)),
                alpha = if (enabled && !loading) 1f else 0.6f,
            )
            .clickable(enabled = enabled && !loading, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.height(16.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            }
            Text(
                text = if (loading) "Загрузка..." else text,
                color = Color.White,
                fontSize = EgeDims.fsLg,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = EgeTheme.colors
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(EgeDims.radiusMd))
            .background(colors.panel)
            .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusMd))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (enabled) colors.text else colors.textDim,
            fontSize = EgeDims.fsMd,
            fontWeight = FontWeight.Medium,
        )
    }
}

// MARK: Состояния: загрузка / ошибка / пусто

@Composable
fun LoadingStateView(text: String = "Загрузка...") {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 160.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = EgeTheme.colors.accent)
        Text(
            text,
            color = EgeTheme.colors.textDim,
            fontSize = EgeDims.fsMd,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

@Composable
fun ErrorStateView(message: String, retry: (() -> Unit)? = null) {
    EgeCard {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("⚠", fontSize = EgeDims.fs2xl, color = EgeTheme.colors.danger)
            Text(
                message,
                color = EgeTheme.colors.text,
                fontSize = EgeDims.fsMd,
                textAlign = TextAlign.Center,
            )
            if (retry != null) {
                SecondaryButton(text = "Повторить", onClick = retry)
            }
        }
    }
}

@Composable
fun EmptyStateView(title: String, subtitle: String? = null) {
    EgeCard {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                title,
                color = EgeTheme.colors.text,
                fontSize = EgeDims.fsMd,
                fontWeight = FontWeight.Medium,
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    color = EgeTheme.colors.textDim,
                    fontSize = EgeDims.fsSm,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

// MARK: Хелперы форматирования (порт Fmt из Components.swift)

object Fmt {
    private val dateTimeFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")

    /** ISO8601 (с фракциями секунд и без) -> "11.06.2026 05:07". */
    fun dateTime(iso: String?): String {
        val instant = parseISO(iso) ?: return "—"
        return dateTimeFmt.format(instant.atZone(ZoneId.systemDefault()))
    }

    fun parseISO(iso: String?): Instant? {
        if (iso.isNullOrEmpty()) return null
        runCatching { return Instant.parse(iso) }
        // PostgREST может отдавать без 'Z' и/или без фракций — пробуем с офсетом
        return runCatching {
            java.time.OffsetDateTime.parse(iso).toInstant()
        }.getOrElse {
            runCatching {
                java.time.LocalDateTime.parse(iso).atZone(ZoneId.of("UTC")).toInstant()
            }.getOrNull()
        }
    }

    fun duration(ms: Int?): String {
        val totalSec = ((ms ?: 0) / 1000).coerceAtLeast(0)
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return when {
            h > 0 -> "$h ч $m мин"
            m > 0 -> "$m мин $s с"
            else -> "$s с"
        }
    }

    fun plural(n: Int, one: String, few: String, many: String): String {
        val mod10 = n % 10
        val mod100 = n % 100
        if (mod10 == 1 && mod100 != 11) return one
        if (mod10 in 2..4 && mod100 !in 12..14) return few
        return many
    }

    /** Ответ задачи: text — как есть; целое без «.0», дробное — с запятой (ege_decimal). */
    fun answer(text: String?, value: Double?): String {
        if (!text.isNullOrEmpty()) return text
        val v = value ?: return "—"
        if (v == Math.rint(v) && abs(v) < 1e15) return v.toLong().toString()
        return v.toString().replace('.', ',')
    }
}
