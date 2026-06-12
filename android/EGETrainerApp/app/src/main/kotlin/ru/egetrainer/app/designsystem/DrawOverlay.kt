package ru.egetrainer.app.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import androidx.compose.foundation.Canvas
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * Позиционирование поповеров рисовалки НАД якорем: тулбар прижат к низу
 * экрана, поповер с default-выравниванием раскрывался бы за нижний край.
 * Кладём над кнопкой; если сверху не влезает — под ней. Горизонталь
 * клампим в окно.
 */
private val AboveAnchor = object : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val m = 8
        val x = anchorBounds.left.coerceIn(
            m, (windowSize.width - popupContentSize.width - m).coerceAtLeast(m),
        )
        val above = anchorBounds.top - popupContentSize.height - m
        val y = if (above >= m) above else anchorBounds.bottom + m
        return IntOffset(x, y)
    }
}

/**
 * Рисовалка-оверлей — порт DrawOverlay.swift (app/ui/draw_overlay.js):
 * перо/линия/прямоугольник±заливка/эллипс±заливка, объектный ластик,
 * толщины THICKS=[2,4,7,12,20], undo/redo/очистить/закрыть, перемещаемый
 * тулбар, поповер инструмент+толщина, выбор цвета. Собственный движок на
 * Compose Canvas; при закрытии reset (на экране пусто).
 * Вне скоупа (как и в iOS): select/drag фигур, вставка картинок.
 */

enum class DrawTool { Pen, Line, Rect, RectF, Ellipse, EllipseF, Eraser }

sealed class DrawKind {
    data class Pen(val points: List<Offset>) : DrawKind()
    data class Line(val a: Offset, val b: Offset) : DrawKind()
    data class RectK(val rect: Rect, val filled: Boolean) : DrawKind()
    data class EllipseK(val rect: Rect, val filled: Boolean) : DrawKind()
}

data class DrawShape(val kind: DrawKind, val color: Color, val width: Float) {
    /** Объектный ластик: попадание по фигуре целиком (порт hitTest iOS). */
    fun hitTest(p: Offset, tolerance: Float): Boolean = when (val k = kind) {
        is DrawKind.Pen -> k.points.any { hypot((it.x - p.x).toDouble(), (it.y - p.y).toDouble()) < tolerance + width }
        is DrawKind.Line -> distanceToSegment(p, k.a, k.b) < tolerance + width
        is DrawKind.RectK -> if (k.filled) k.rect.inflate(tolerance).contains(p) else {
            val outer = k.rect.inflate(tolerance + width)
            val inner = k.rect.inflate(-(tolerance + width))
            outer.contains(p) && !(inner.width > 0 && inner.height > 0 && inner.contains(p))
        }
        is DrawKind.EllipseK -> {
            val r = k.rect
            if (r.width <= 0 || r.height <= 0) false else {
                val nx = (p.x - r.center.x) / (r.width / 2)
                val ny = (p.y - r.center.y) / (r.height / 2)
                val d = nx * nx + ny * ny
                if (k.filled) d <= 1.2 else abs(d - 1) < 0.35
            }
        }
    }
}

private fun distanceToSegment(p: Offset, a: Offset, b: Offset): Float {
    val dx = b.x - a.x; val dy = b.y - a.y
    val len2 = dx * dx + dy * dy
    if (len2 == 0f) return hypot((p.x - a.x).toDouble(), (p.y - a.y).toDouble()).toFloat()
    val t = (((p.x - a.x) * dx + (p.y - a.y) * dy) / len2).coerceIn(0f, 1f)
    return hypot((p.x - (a.x + t * dx)).toDouble(), (p.y - (a.y + t * dy)).toDouble()).toFloat()
}

private fun rectFrom(a: Offset, b: Offset) =
    Rect(minOf(a.x, b.x), minOf(a.y, b.y), maxOf(a.x, b.x), maxOf(a.y, b.y))

val DRAW_THICKS = listOf(2f, 4f, 7f, 12f, 20f)

/** Хост-обёртка: кладёт рисовалку поверх content (кнопка-карандаш справа внизу). */
@Composable
fun DrawOverlayHost(startActive: Boolean = false, content: @Composable () -> Unit) {
    var isActive by remember { mutableStateOf(startActive) }
    val shapes = remember { mutableStateListOf<DrawShape>() }
    val undoStack = remember { mutableStateListOf<List<DrawShape>>() }
    val redoStack = remember { mutableStateListOf<List<DrawShape>>() }
    var tool by remember { mutableStateOf(DrawTool.Pen) }
    var color by remember { mutableStateOf(Color(0xFF2563EB)) } // синий по умолчанию
    var width by remember { mutableStateOf(4f) }
    var current by remember { mutableStateOf<DrawShape?>(null) }
    var toolsOpen by remember { mutableStateOf(false) }
    var toolbarOffset by remember { mutableStateOf(Offset.Zero) }

    fun snapshot() {
        undoStack.add(shapes.toList())
        if (undoStack.size > 50) undoStack.removeAt(0)
        redoStack.clear()
    }
    fun erase(p: Offset) {
        val idx = shapes.indexOfLast { it.hitTest(p, 14f) }
        if (idx >= 0) { snapshot(); shapes.removeAt(idx) }
    }

    Box(Modifier.fillMaxSize()) {
        content()

        if (isActive) {
            Canvas(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.001f))
                    .testTag("drawCanvas")
                    .pointerInput(tool, color, width) {
                        detectDragGestures(
                            onDragStart = { start ->
                                if (tool == DrawTool.Eraser) { erase(start) } else {
                                    current = DrawShape(
                                        when (tool) {
                                            DrawTool.Pen -> DrawKind.Pen(listOf(start))
                                            DrawTool.Line -> DrawKind.Line(start, start)
                                            DrawTool.Rect -> DrawKind.RectK(Rect(start, start), false)
                                            DrawTool.RectF -> DrawKind.RectK(Rect(start, start), true)
                                            DrawTool.Ellipse -> DrawKind.EllipseK(Rect(start, start), false)
                                            DrawTool.EllipseF -> DrawKind.EllipseK(Rect(start, start), true)
                                            DrawTool.Eraser -> DrawKind.Pen(emptyList())
                                        }, color, width,
                                    )
                                }
                            },
                            onDrag = { change, _ ->
                                val p = change.position
                                if (tool == DrawTool.Eraser) { erase(p); return@detectDragGestures }
                                val cur = current ?: return@detectDragGestures
                                val start = when (val k = cur.kind) {
                                    is DrawKind.Pen -> k.points.first()
                                    is DrawKind.Line -> k.a
                                    is DrawKind.RectK -> k.rect.topLeft
                                    is DrawKind.EllipseK -> k.rect.topLeft
                                }
                                current = cur.copy(kind = when (val k = cur.kind) {
                                    is DrawKind.Pen -> DrawKind.Pen(k.points + p)
                                    is DrawKind.Line -> DrawKind.Line(k.a, p)
                                    is DrawKind.RectK -> DrawKind.RectK(rectFrom(start, p), k.filled)
                                    is DrawKind.EllipseK -> DrawKind.EllipseK(rectFrom(start, p), k.filled)
                                })
                            },
                            onDragEnd = {
                                current?.let { snapshot(); shapes.add(it) }
                                current = null
                            },
                        )
                    }
            ) {
                shapes.forEach { drawShape(it) }
                current?.let { drawShape(it) }
            }

            // Поповер инструмента/толщины — inline над тулбаром (не Popup-окно:
            // focusable-Popup над активным жестовым Canvas закрывался в кадре).
            // Слой-перехватчик гасит тап «мимо» без рисования по холсту.
            if (toolsOpen) {
                Box(
                    Modifier.fillMaxSize().pointerInput(Unit) {
                        detectTapGestures { toolsOpen = false }
                    },
                )
                Box(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 78.dp),
                ) {
                    ToolPopover(tool, width,
                        onTool = { tool = it; toolsOpen = false },
                        onWidth = { width = it; toolsOpen = false })
                }
            }

            // Тулбар (порт .dro-bar) — перемещаемый
            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 16.dp)
                    .offset { IntOffset(toolbarOffset.x.roundToInt(), toolbarOffset.y.roundToInt()) }
                    .clip(RoundedCornerShape(EgeDims.radiusPill))
                    .background(EgeTheme.colors.panel)
                    .border(1.dp, EgeTheme.colors.border, RoundedCornerShape(EgeDims.radiusPill))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // ручка перетаскивания
                Text("≡", color = EgeTheme.colors.textDim, fontSize = EgeDims.fsLg,
                    modifier = Modifier.pointerInput(Unit) {
                        detectDragGestures { _, drag -> toolbarOffset += drag }
                    })
                // текущий инструмент → тоггл inline-поповера (см. выше)
                Box(
                    Modifier.clickable { toolsOpen = !toolsOpen }.padding(2.dp).testTag("drawToolBtn"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(toolGlyph(tool), fontSize = EgeDims.fsLg,
                        color = if (tool == DrawTool.Eraser) EgeTheme.colors.textDim else EgeTheme.colors.accent)
                }
                Text("⌫", fontSize = EgeDims.fsLg,
                    color = if (tool == DrawTool.Eraser) EgeTheme.colors.accent else EgeTheme.colors.text,
                    modifier = Modifier.clickable { tool = DrawTool.Eraser }.testTag("drawEraser"))
                ColorDot(color) { color = it }
                HorizontalDivider(Modifier.height(20.dp).width(1.dp), color = EgeTheme.colors.border)
                Text("↶", fontSize = EgeDims.fsLg, color = EgeTheme.colors.text,
                    modifier = Modifier.clickable {
                        undoStack.removeLastOrNull()?.let { redoStack.add(shapes.toList()); shapes.clear(); shapes.addAll(it) }
                    }.testTag("drawUndo"))
                Text("↷", fontSize = EgeDims.fsLg, color = EgeTheme.colors.text,
                    modifier = Modifier.clickable {
                        redoStack.removeLastOrNull()?.let { undoStack.add(shapes.toList()); shapes.clear(); shapes.addAll(it) }
                    }.testTag("drawRedo"))
                Text("🗑", fontSize = EgeDims.fsLg,
                    modifier = Modifier.clickable { if (shapes.isNotEmpty()) { snapshot(); shapes.clear() } }.testTag("drawClear"))
                Text("✕", fontSize = EgeDims.fsLg, color = EgeTheme.colors.danger,
                    modifier = Modifier.clickable {
                        shapes.clear(); current = null; undoStack.clear(); redoStack.clear()
                        toolbarOffset = Offset.Zero; isActive = false
                    }.testTag("drawClose"))
            }
        } else {
            // кнопка-карандаш (правый нижний угол, над таб-баром)
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 84.dp)
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(EgeTheme.colors.panel)
                    .border(1.dp, EgeTheme.colors.border, CircleShape)
                    .clickable { isActive = true }
                    .testTag("drawOpen"),
                contentAlignment = Alignment.Center,
            ) { Text("✏️", fontSize = EgeDims.fsLg) }
        }
    }
}

private fun DrawScope.drawShape(shape: DrawShape) {
    val stroke = Stroke(width = shape.width, cap = androidx.compose.ui.graphics.StrokeCap.Round,
        join = androidx.compose.ui.graphics.StrokeJoin.Round)
    when (val k = shape.kind) {
        is DrawKind.Pen -> {
            if (k.points.size < 2) {
                k.points.firstOrNull()?.let {
                    drawCircle(shape.color, shape.width / 2, it)
                }
            } else {
                val path = Path().apply {
                    moveTo(k.points.first().x, k.points.first().y)
                    k.points.drop(1).forEach { lineTo(it.x, it.y) }
                }
                drawPath(path, shape.color, style = stroke)
            }
        }
        is DrawKind.Line -> drawLine(shape.color, k.a, k.b, strokeWidth = shape.width,
            cap = androidx.compose.ui.graphics.StrokeCap.Round)
        is DrawKind.RectK -> if (k.filled) drawRect(shape.color, k.rect.topLeft, k.rect.size)
            else drawRect(shape.color, k.rect.topLeft, k.rect.size, style = stroke)
        is DrawKind.EllipseK -> if (k.filled) drawOval(shape.color, k.rect.topLeft, k.rect.size)
            else drawOval(shape.color, k.rect.topLeft, k.rect.size, style = stroke)
    }
}

@Composable
private fun ToolPopover(tool: DrawTool, width: Float, onTool: (DrawTool) -> Unit, onWidth: (Float) -> Unit) {
    val colors = EgeTheme.colors
    androidx.compose.foundation.layout.Column(
        Modifier.clip(RoundedCornerShape(EgeDims.radiusSm)).background(colors.panel)
            .border(1.dp, colors.border, RoundedCornerShape(EgeDims.radiusSm)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("инстр.:", color = colors.textDim, fontSize = EgeDims.fsXs)
            listOf(DrawTool.Pen, DrawTool.Line, DrawTool.Rect, DrawTool.RectF, DrawTool.Ellipse, DrawTool.EllipseF).forEach { t ->
                Text(toolGlyph(t), fontSize = EgeDims.fsLg,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp))
                        .background(if (tool == t) colors.accentLight else Color.Transparent)
                        .clickable { onTool(t) }.padding(6.dp).testTag("drawTool_${t.name}"))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("толщина:", color = colors.textDim, fontSize = EgeDims.fsXs)
            DRAW_THICKS.forEach { w ->
                Box(
                    Modifier.size(minOf(w + 8, 26f).dp).clip(CircleShape)
                        .background(if (width == w) colors.accent else colors.textDim)
                        .clickable { onWidth(w) }.testTag("drawW_${w.toInt()}")
                )
            }
        }
    }
}

@Composable
private fun ColorDot(color: Color, onPick: (Color) -> Unit) {
    // Палитра базовых цветов (системного ColorPicker в Compose нет) — порт
    // решения «любой цвет»: набор + сетка, как градиент-сетка веба/iOS.
    var open by remember { mutableStateOf(false) }
    val palette = listOf(
        Color(0xFF2563EB), Color(0xFFDC2626), Color(0xFF059669), Color(0xFFD97706),
        Color(0xFF7C3AED), Color(0xFF111827), Color(0xFFEC4899), Color.White,
    )
    Box {
        Box(Modifier.size(24.dp).clip(CircleShape).background(color)
            .border(1.dp, EgeTheme.colors.border, CircleShape)
            .clickable { open = true }.testTag("drawColor"))
        if (open) {
            Popup(
                popupPositionProvider = AboveAnchor,
                onDismissRequest = { open = false },
                properties = PopupProperties(focusable = true),
            ) {
                Row(
                    Modifier.clip(RoundedCornerShape(EgeDims.radiusSm)).background(EgeTheme.colors.panel)
                        .border(1.dp, EgeTheme.colors.border, RoundedCornerShape(EgeDims.radiusSm)).padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    palette.forEach { c ->
                        Box(Modifier.size(26.dp).clip(CircleShape).background(c)
                            .border(1.dp, EgeTheme.colors.border, CircleShape)
                            .clickable { onPick(c); open = false })
                    }
                }
            }
        }
    }
}

private fun toolGlyph(t: DrawTool): String = when (t) {
    DrawTool.Pen -> "✎"; DrawTool.Line -> "／"; DrawTool.Rect -> "▭"; DrawTool.RectF -> "▬"
    DrawTool.Ellipse -> "◯"; DrawTool.EllipseF -> "●"; DrawTool.Eraser -> "⌫"
}

private fun Rect.inflate(d: Float) = Rect(left - d, top - d, right + d, bottom + d)
