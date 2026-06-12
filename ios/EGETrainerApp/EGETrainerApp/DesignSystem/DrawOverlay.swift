import SwiftUI

/// Рисовалка-оверлей — порт тулбара и инструментов app/ui/draw_overlay.js
/// (порция №3): перо, линия, прямоугольник (контур/заливка), эллипс
/// (контур/заливка), объектный ластик, толщины THICKS=[2,4,7,12,20],
/// undo/redo/очистить/закрыть. Цвет — системный пикер iOS (решение
/// оператора: сетка/градиенты лучше фиксированных 15 цветов веба).
/// Собственный движок на SwiftUI Canvas — никаких системных панелей,
/// при закрытии на экране не остаётся ничего.
/// Вне скоупа (как на вебе есть, здесь нет): select/drag панели,
/// вставка/копирование картинок.

// MARK: - Модель фигур

struct DrawShape: Identifiable {
    enum Kind {
        case pen([CGPoint])
        case line(CGPoint, CGPoint)
        case rect(CGRect, filled: Bool)
        case ellipse(CGRect, filled: Bool)
    }

    let id = UUID()
    var kind: Kind
    var color: Color
    var width: CGFloat

    /// Объектный ластик веба: попадание по фигуре целиком.
    func hitTest(_ p: CGPoint, tolerance: CGFloat) -> Bool {
        switch kind {
        case .pen(let pts):
            return pts.contains { hypot($0.x - p.x, $0.y - p.y) < tolerance + width }
        case .line(let a, let b):
            return Self.distance(p, toSegment: a, b) < tolerance + width
        case .rect(let r, let filled):
            if filled { return r.insetBy(dx: -tolerance, dy: -tolerance).contains(p) }
            let outer = r.insetBy(dx: -tolerance - width, dy: -tolerance - width)
            let inner = r.insetBy(dx: tolerance + width, dy: tolerance + width)
            return outer.contains(p) && !(inner.width > 0 && inner.height > 0 && inner.contains(p))
        case .ellipse(let r, let filled):
            guard r.width > 0, r.height > 0 else { return false }
            let cx = r.midX, cy = r.midY
            let nx = (p.x - cx) / (r.width / 2), ny = (p.y - cy) / (r.height / 2)
            let d = nx * nx + ny * ny
            if filled { return d <= 1.2 }
            return abs(d - 1) < 0.35
        }
    }

    private static func distance(_ p: CGPoint, toSegment a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y
        let len2 = dx * dx + dy * dy
        guard len2 > 0 else { return hypot(p.x - a.x, p.y - a.y) }
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
}

// MARK: - Состояние

final class DrawBoard: ObservableObject {
    enum Tool: String, CaseIterable {
        case pen, line, rect, rectF, ellipse, ellipseF, eraser
    }

    @Published var shapes: [DrawShape] = []
    @Published var current: DrawShape?
    @Published var tool: Tool = .pen
    @Published var color: Color = .blue   // P6-3c: синий по умолчанию
    @Published var width: CGFloat = 4

    static let thicknesses: [CGFloat] = [2, 4, 7, 12, 20]  // THICKS веба

    private var undoStack: [[DrawShape]] = []
    private var redoStack: [[DrawShape]] = []

    private func snapshot() {
        undoStack.append(shapes)
        if undoStack.count > 50 { undoStack.removeFirst() }
        redoStack = []
    }

    func begin(at p: CGPoint) {
        if tool == .eraser {
            erase(at: p)
            return
        }
        let kind: DrawShape.Kind
        switch tool {
        case .pen: kind = .pen([p])
        case .line: kind = .line(p, p)
        case .rect: kind = .rect(CGRect(origin: p, size: .zero), filled: false)
        case .rectF: kind = .rect(CGRect(origin: p, size: .zero), filled: true)
        case .ellipse: kind = .ellipse(CGRect(origin: p, size: .zero), filled: false)
        case .ellipseF: kind = .ellipse(CGRect(origin: p, size: .zero), filled: true)
        case .eraser: return
        }
        current = DrawShape(kind: kind, color: color, width: width)
    }

    func move(to p: CGPoint, from start: CGPoint) {
        if tool == .eraser {
            erase(at: p)
            return
        }
        guard var cur = current else { return }
        switch cur.kind {
        case .pen(var pts):
            pts.append(p)
            cur.kind = .pen(pts)
        case .line:
            cur.kind = .line(start, p)
        case .rect(_, let filled):
            cur.kind = .rect(CGRect(x: min(start.x, p.x), y: min(start.y, p.y),
                                    width: abs(p.x - start.x), height: abs(p.y - start.y)),
                             filled: filled)
        case .ellipse(_, let filled):
            cur.kind = .ellipse(CGRect(x: min(start.x, p.x), y: min(start.y, p.y),
                                       width: abs(p.x - start.x), height: abs(p.y - start.y)),
                                filled: filled)
        }
        current = cur
    }

    func end() {
        guard let cur = current else { return }
        snapshot()
        shapes.append(cur)
        current = nil
    }

    private func erase(at p: CGPoint) {
        if let idx = shapes.lastIndex(where: { $0.hitTest(p, tolerance: 14) }) {
            snapshot()
            shapes.remove(at: idx)
        }
    }

    func undo() {
        guard let prev = undoStack.popLast() else { return }
        redoStack.append(shapes)
        shapes = prev
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(shapes)
        shapes = next
    }

    func clear() {
        guard !shapes.isEmpty else { return }
        snapshot()
        shapes = []
    }

    func reset() {
        shapes = []
        current = nil
        undoStack = []
        redoStack = []
    }
}

// MARK: - Оверлей

struct DrawOverlayModifier: ViewModifier {
    var startActive = false
    @StateObject private var board = DrawBoard()
    @State private var isActive = false
    @State private var showToolPopover = false
    @State private var dragStart: CGPoint?
    // P6-3b: перемещаемый тулбар
    @State private var toolbarOffset: CGSize = .zero
    @State private var toolbarDrag: CGSize = .zero

    func body(content: Content) -> some View {
        content
            .overlay {
                if isActive {
                    canvasLayer
                        .ignoresSafeArea(edges: .bottom)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !isActive {
                    openButton
                }
            }
            .overlay(alignment: .bottom) {
                if isActive {
                    toolbar
                        .padding(.bottom, 8)
                }
            }
            .onAppear {
                if startActive { isActive = true }
                #if DEBUG
                if ProcessInfo.processInfo.environment["E2E_DRAW"] == "1" {
                    isActive = true
                }
                #endif
            }
    }

    private var openButton: some View {
        Button {
            isActive = true
        } label: {
            Image(systemName: "pencil.and.outline")
                .font(.body)
                .frame(width: 44, height: 44)
                .background(.regularMaterial)
                .clipShape(Circle())
                .shadow(color: Theme.cardShadow, radius: 6)
        }
        .padding(.trailing, 16)
        .padding(.bottom, 84)
    }

    private var canvasLayer: some View {
        Canvas { ctx, _ in
            for shape in board.shapes { draw(shape, in: &ctx) }
            if let cur = board.current { draw(cur, in: &ctx) }
        }
        .background(Color.black.opacity(0.001)) // ловим жесты по всей площади
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    if dragStart == nil {
                        dragStart = v.startLocation
                        board.begin(at: v.startLocation)
                    }
                    board.move(to: v.location, from: v.startLocation)
                }
                .onEnded { _ in
                    board.end()
                    dragStart = nil
                }
        )
    }

    private func draw(_ shape: DrawShape, in ctx: inout GraphicsContext) {
        let style = StrokeStyle(lineWidth: shape.width, lineCap: .round, lineJoin: .round)
        switch shape.kind {
        case .pen(let pts):
            guard pts.count > 1 else {
                if let p = pts.first {
                    let dot = CGRect(x: p.x - shape.width / 2, y: p.y - shape.width / 2,
                                     width: shape.width, height: shape.width)
                    ctx.fill(Path(ellipseIn: dot), with: .color(shape.color))
                }
                return
            }
            var path = Path()
            path.addLines(pts)
            ctx.stroke(path, with: .color(shape.color), style: style)
        case .line(let a, let b):
            var path = Path()
            path.move(to: a)
            path.addLine(to: b)
            ctx.stroke(path, with: .color(shape.color), style: style)
        case .rect(let r, let filled):
            let path = Path(r)
            if filled { ctx.fill(path, with: .color(shape.color)) }
            else { ctx.stroke(path, with: .color(shape.color), style: style) }
        case .ellipse(let r, let filled):
            let path = Path(ellipseIn: r)
            if filled { ctx.fill(path, with: .color(shape.color)) }
            else { ctx.stroke(path, with: .color(shape.color), style: style) }
        }
    }

    // MARK: - Тулбар (порт .dro-bar веба)

    private var toolbar: some View {
        HStack(spacing: 12) {
            // P6-3b: ручка перетаскивания — тулбар можно увезти в любое место
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(Theme.textDim)
                .gesture(
                    DragGesture()
                        .onChanged { v in toolbarDrag = v.translation }
                        .onEnded { v in
                            toolbarOffset.width += v.translation.width
                            toolbarOffset.height += v.translation.height
                            toolbarDrag = .zero
                        }
                )

            // «перо» — текущий инструмент, открывает поповер инструменты+толщина
            Button {
                showToolPopover = true
            } label: {
                Image(systemName: toolIcon(board.tool))
                    .foregroundStyle(board.tool == .eraser ? Theme.textDim : Theme.accent)
            }
            .popover(isPresented: $showToolPopover) {
                toolPopover
                    #if os(iOS)
                    .presentationCompactAdaptation(.popover)
                    #endif
            }

            // ластик (объектный, как на вебе)
            Button {
                board.tool = .eraser
            } label: {
                Image(systemName: "eraser")
                    .foregroundStyle(board.tool == .eraser ? Theme.accent : Theme.text)
            }

            // цвет — системный пикер (любой цвет, сетка/градиенты)
            ColorPicker("", selection: $board.color, supportsOpacity: false)
                .labelsHidden()
                .frame(width: 28)

            Divider().frame(height: 20)

            Button { board.undo() } label: { Image(systemName: "arrow.uturn.backward") }
            Button { board.redo() } label: { Image(systemName: "arrow.uturn.forward") }
            Button { board.clear() } label: { Image(systemName: "trash") }

            Button {
                board.reset()
                isActive = false
                showToolPopover = false
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(Theme.danger)
            }
        }
        .font(.body)
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(.regularMaterial)
        .clipShape(Capsule())
        .shadow(color: Theme.cardShadow, radius: 8)
        .offset(x: toolbarOffset.width + toolbarDrag.width,
                y: toolbarOffset.height + toolbarDrag.height)
    }

    /// Поповер «инстр. + толщина» — порт .dro-pop-pen.
    private var toolPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("инстр.:").font(.caption).foregroundStyle(Theme.textDim)
                ForEach([DrawBoard.Tool.pen, .line, .rect, .rectF, .ellipse, .ellipseF], id: \.self) { t in
                    Button {
                        board.tool = t
                        showToolPopover = false
                    } label: {
                        Image(systemName: toolIcon(t))
                            .frame(width: 30, height: 30)
                            .background(board.tool == t ? Theme.accentLight : .clear)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 10) {
                Text("толщина:").font(.caption).foregroundStyle(Theme.textDim)
                ForEach(DrawBoard.thicknesses, id: \.self) { w in
                    Button {
                        board.width = w
                        showToolPopover = false
                    } label: {
                        Circle()
                            .fill(board.width == w ? Theme.accent : Theme.textDim)
                            .frame(width: min(w + 6, 24), height: min(w + 6, 24))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
    }

    private func toolIcon(_ t: DrawBoard.Tool) -> String {
        switch t {
        case .pen: return "pencil.tip"
        case .line: return "line.diagonal"
        case .rect: return "rectangle"
        case .rectF: return "rectangle.fill"
        case .ellipse: return "circle"
        case .ellipseF: return "circle.fill"
        case .eraser: return "eraser"
        }
    }
}

extension View {
    /// Включает рисовалку поверх экрана (кнопка-карандаш в правом нижнем углу).
    /// startActive — рисовалка активна сразу (фокус-режим карточки, P6-3a).
    func drawOverlay(startActive: Bool = false) -> some View {
        modifier(DrawOverlayModifier(startActive: startActive))
    }
}
