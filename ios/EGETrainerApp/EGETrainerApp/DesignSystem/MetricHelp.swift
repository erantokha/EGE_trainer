import SwiftUI

/// Подсказки к метрикам — словарь METRIC_HELP из app/ui/metric_help.js (1-в-1 тексты).
enum MetricHelp: String, CaseIterable {
    case coverage, form, prototype, weak, stale, unstable, accuracy, forecast, primary, secondary

    var label: String {
        switch self {
        case .coverage: return "Покрытие"
        case .form: return "Форма"
        case .prototype: return "Прототип"
        case .weak: return "Слабая тема"
        case .stale: return "Давно не решал"
        case .unstable: return "Нестабильно"
        case .accuracy: return "Точность"
        case .forecast: return "Прогноз ЕГЭ"
        case .primary: return "Первичный балл"
        case .secondary: return "Вторичный балл"
        }
    }

    var text: String {
        switch self {
        case .coverage: return "Сколько типов заданий по теме ученик уже решал хотя бы один раз."
        case .form: return "Результаты по последним попыткам. Помогает понять, как ученик решает тему сейчас, а не за всё время."
        case .prototype: return "Типовая модель задания ЕГЭ. Внутри одной темы может быть несколько прототипов с разными способами решения."
        case .weak: return "Тема или прототип, где низкая точность или мало успешных попыток."
        case .stale: return "Ученик давно не возвращался к этой теме или прототипу — стоит повторить."
        case .unstable: return "Есть и верные, и неверные решения: результат пока не закрепился."
        case .accuracy: return "Доля верных решений среди попыток по этой теме, подтеме или прототипу."
        case .forecast: return "Оценка ожидаемого результата на основе текущей статистики в тренажёре. Это не официальный результат, а ориентир для подготовки."
        case .primary: return "Балл за задания до перевода в тестовую шкалу ЕГЭ."
        case .secondary: return "Итоговый балл по 100-балльной шкале после перевода первичных баллов."
        }
    }
}

/// Иконка «?» с поповером-подсказкой — эквивалент data-help/data-tip сайта.
struct MetricHelpButton: View {
    let key: MetricHelp
    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            Image(systemName: "questionmark.circle")
                .font(.footnote)
                .foregroundStyle(Theme.textDim)
        }
        .buttonStyle(.plain)
        .popover(isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: 6) {
                Text(key.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                Text(key.text)
                    .font(.footnote)
                    .foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: 280, alignment: .leading)
            #if os(iOS)
            .presentationCompactAdaptation(.popover)
            #endif
        }
        .accessibilityLabel("Подсказка: \(key.label)")
    }
}
