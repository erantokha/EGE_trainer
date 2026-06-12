import SwiftUI

// MARK: - Карточка (белая панель с мягкой тенью — паритет с .panel веба)

struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusLg))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusLg)
                    .stroke(Theme.borderLight, lineWidth: 1)
            )
            .shadow(color: Theme.cardShadow, radius: 8, x: 0, y: 4)
    }
}

// MARK: - Eyebrow (синий капс-заголовок «ПОДГОТОВКА К ЕГЭ…», «ПРОГНОЗ ЕГЭ»)

struct EyebrowText: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .kerning(1.0)
            .foregroundStyle(Theme.accent)
    }
}

// MARK: - Бейджи статусов (Сдано / Не сдано / слабая тема ...)

enum BadgeStyle {
    case success, danger, warning, neutral

    var fg: Color {
        switch self {
        case .success: return Theme.success
        case .danger: return Theme.danger
        case .warning: return Theme.warnText
        case .neutral: return Theme.textDim
        }
    }

    var bg: Color {
        switch self {
        case .success: return Theme.successBg
        case .danger: return Theme.dangerBg
        case .warning: return Theme.warnBg
        case .neutral: return Theme.surface2
        }
    }
}

struct StatusBadge: View {
    let text: String
    let style: BadgeStyle

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(style.bg)
            .foregroundStyle(style.fg)
            .clipShape(Capsule())
    }
}

// MARK: - Прогресс-полоска темы (синяя на сером, как в аккордеоне)

struct TopicProgressBar: View {
    let pct: Int? // nil -> пустая серая полоска

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.panel2)
                if let pct, pct > 0 {
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: geo.size.width * CGFloat(min(max(pct, 0), 100)) / 100)
                }
            }
        }
        .frame(height: 7)
    }
}

// MARK: - Главная кнопка (синий градиент, как «Войти»/«Начать»)

struct PrimaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 14)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .padding(.horizontal, fullWidth ? 0 : 20)
            .background(
                LinearGradient(
                    colors: [Theme.accent, Theme.accent2],
                    startPoint: .top, endPoint: .bottom
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Theme.text)
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusMd)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// MARK: - Метрика-карточка статистики («ПОСЛЕДНИЕ 10 / 30% / Верно/всего: 3/10»)

struct MetricCard: View {
    let title: String
    let bigValue: String
    let caption: String?
    var valueStyle: BadgeStyle = .danger

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text(title.uppercased())
                    .font(.caption.weight(.semibold))
                    .kerning(0.6)
                    .foregroundStyle(Theme.textDim)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(bigValue)
                        .font(.system(size: 30, weight: .bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 2)
                        .background(valueStyle.bg)
                        .foregroundStyle(Theme.text)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                    if let caption {
                        Text(caption)
                            .font(.subheadline)
                            .foregroundStyle(Theme.textDim)
                    }
                }
            }
        }
    }
}

// MARK: - Состояния: загрузка / ошибка / пусто

struct LoadingStateView: View {
    var text: String = "Загрузка..."

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(text).font(.subheadline).foregroundStyle(Theme.textDim)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

struct ErrorStateView: View {
    let message: String
    var retry: (() async -> Void)?

    var body: some View {
        Card {
            VStack(alignment: .center, spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.title)
                    .foregroundStyle(Theme.danger)
                Text(message)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.text)
                if let retry {
                    Button("Повторить") {
                        Task { await retry() }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    var subtitle: String?

    var body: some View {
        Card {
            VStack(alignment: .center, spacing: 8) {
                Image(systemName: icon)
                    .font(.title)
                    .foregroundStyle(Theme.textDim)
                Text(title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.text)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Theme.textDim)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }
}

// MARK: - Хелперы форматирования

enum Fmt {
    /// ISO8601 (с фракциями секунд и без) -> "11.06.2026 05:07"
    static func dateTime(_ iso: String?) -> String {
        guard let date = parseISO(iso) else { return "—" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "dd.MM.yyyy HH:mm"
        return f.string(from: date)
    }

    static func parseISO(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFrac.date(from: iso) { return d }
        let plain = ISO8601DateFormatter()
        return plain.date(from: iso)
    }

    static func duration(ms: Int?) -> String {
        let totalSec = max(0, (ms ?? 0) / 1000)
        let h = totalSec / 3600, m = (totalSec % 3600) / 60, s = totalSec % 60
        if h > 0 { return "\(h) ч \(m) мин" }
        if m > 0 { return "\(m) мин \(s) с" }
        return "\(s) с"
    }

    static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        let mod10 = n % 10, mod100 = n % 100
        if mod10 == 1 && mod100 != 11 { return one }
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return few }
        return many
    }

    /// Ответ задачи (P5-4): text — как есть; числовое значение — целое без
    /// «.0», дробное — с запятой (формат ege_decimal сайта).
    static func answer(text: String?, value: Double?) -> String {
        if let text, !text.isEmpty { return text }
        guard let v = value else { return "—" }
        if v == v.rounded(), abs(v) < 1e15 { return String(Int(v)) }
        return String(v).replacingOccurrences(of: ".", with: ",")
    }
}
