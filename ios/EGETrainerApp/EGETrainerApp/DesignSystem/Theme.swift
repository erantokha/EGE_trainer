import SwiftUI
#if os(iOS)
import UIKit
#endif

/// Дизайн-токены — порт :root из tasks/trainer/tokens.css.
/// Светлая палитра = :root, тёмная = [data-theme="dark"] (на iOS — системная тема,
/// эквивалент ручного переключателя сайта).
enum Theme {
    static let bg = Color.adaptive(light: 0xF8FAFC, dark: 0x0B1320)          // --surface
    static let surface2 = Color.adaptive(light: 0xF1F5F9, dark: 0x0F1623)    // --surface2
    static let panel = Color.adaptive(light: 0xFFFFFF, dark: 0x111827)       // --panel
    static let panel2 = Color.adaptive(light: 0xE5E7EB, dark: 0x0F1623)      // --panel-2
    static let border = Color.adaptive(light: 0xD1D5DB, dark: 0x232635)      // --border
    static let borderLight = Color.adaptive(light: 0xE5E7EB, dark: 0x232635)
    static let text = Color.adaptive(light: 0x111827, dark: 0xE6E6E6)        // --text
    static let textDim = Color.adaptive(light: 0x6B7280, dark: 0xAEB3C2)     // --text-dim
    static let accent = Color.adaptive(light: 0x2563EB, dark: 0x3B82F6)      // --accent
    static let accent2 = Color.adaptive(light: 0x1D4ED8, dark: 0x2563EB)     // --accent-2
    static let accentLight = Color.adaptive(light: 0xDBEAFE, dark: 0x3B82F6, darkAlpha: 0.16) // --accent-light
    static let success = Color.adaptive(light: 0x059669, dark: 0x10B981)     // --success
    static let danger = Color.adaptive(light: 0xDC2626, dark: 0xEF4444)      // --danger
    static let successBg = Color.adaptive(light: 0xD1FAE5, dark: 0x10B981, darkAlpha: 0.16)
    static let dangerBg = Color.adaptive(light: 0xFEE2E2, dark: 0xEF4444, darkAlpha: 0.16)
    static let warnBg = Color.adaptive(light: 0xFEF3C7, dark: 0xF59E0B, darkAlpha: 0.18)
    static let warnText = Color.adaptive(light: 0xB45309, dark: 0xFBBF24)

    // Радиусы (--radius-sm/md/lg)
    static let radiusSm: CGFloat = 10
    static let radiusMd: CGFloat = 12
    static let radiusLg: CGFloat = 16

    static let cardShadow = Color.adaptive(light: 0x0F172A, dark: 0x000000, lightAlpha: 0.08, darkAlpha: 0.25)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// Адаптивный цвет: светлая/тёмная тема (на macOS dev-harness — всегда светлая).
    static func adaptive(light: UInt32, dark: UInt32,
                         lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
        #if os(iOS)
        return Color(UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(
                    red: CGFloat((dark >> 16) & 0xFF) / 255,
                    green: CGFloat((dark >> 8) & 0xFF) / 255,
                    blue: CGFloat(dark & 0xFF) / 255,
                    alpha: darkAlpha
                )
            }
            return UIColor(
                red: CGFloat((light >> 16) & 0xFF) / 255,
                green: CGFloat((light >> 8) & 0xFF) / 255,
                blue: CGFloat(light & 0xFF) / 255,
                alpha: lightAlpha
            )
        })
        #else
        return Color(hex: light, alpha: lightAlpha)
        #endif
    }
}
