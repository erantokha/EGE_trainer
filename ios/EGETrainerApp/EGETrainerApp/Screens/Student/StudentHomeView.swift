import SwiftUI

/// Главная ученика — повторяет home_student.html:
/// eyebrow, заголовок, карточка «Прогноз ЕГЭ», «Выбрать все/Сбросить все»,
/// аккордеон тем с %-полосками и счётчиками −/N/+, бар «Начать».
struct StudentHomeView: View {
    @EnvironmentObject private var app: AppState

    @State private var sections: [(section: CatalogEntry, topics: [CatalogEntry])] = []
    @State private var analytics: AnalyticsScreen?
    @State private var forecast: ScoreForecast.Result?
    @State private var topicPctById: [String: Int] = [:]
    @State private var weakSectionIds: Set<String> = []

    @State private var counts: [String: Int] = [:]            // topicId -> кол-во (CHOICE_TOPICS)
    @State private var sectionCounts: [String: Int] = [:]     // sectionId -> кол-во (CHOICE_SECTIONS)
    @State private var protoCounts: [String: ProtoPick] = [:] // baseId -> тема+кол-во (CHOICE_PROTOS)
    @State private var protoModalTopic: CatalogEntry?         // модалка прототипов (#protoPickerModal)
    @State private var expanded: Set<String> = []              // развёрнутые секции
    @State private var shuffleTasks = false

    /// Фильтр подбора — id как на вебе (student_pick_filter_id_v2).
    @State private var filterId: String? = nil
    /// Бейджи состояний тем из self-гейта teacher_picking_screen_v2.
    @State private var topicStates: [String: PickTopicState] = [:]
    /// Режим тренировки: всегда «списком» (решение оператора, порция №3;
    /// пошаговый StepTrainingView остаётся в коде отключённым).
    private let trainingMode = "list"
    /// Черновик незавершённой тренировки (восстановление сессии).
    @State private var resumeDraft: TrainingDraftStore.Draft?

    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var runPayload: RunPayload?
    @State private var previewPayload: PreviewQuestions?
    @State private var isPicking = false

    // P4-1: фоновая сборка подборки (дебаунс + seq против гонок)
    @State private var assembledBase: [RunQuestion]?   // каталожный порядок
    @State private var assembled: [RunQuestion]?       // отображаемый (P5-2: с учётом «Перемешать»)
    @State private var assembleSeq = 0
    @State private var isAssembling = false

    struct PreviewQuestions: Identifiable {
        let id = UUID()
        var questions: [RunQuestion]
    }

    struct RunPayload: Identifiable {
        let id = UUID()
        var questions: [RunQuestion]
        var mode: String
        var initialAnswers: [String: String] = [:]
    }

    /// Фильтры главной ученика — те же id, что в #studentFilterDropdown веба.
    static let filters: [(id: String?, title: String)] = [
        (nil, "Без фильтра"),
        ("unseen_low", "Не решал / мало решал"),
        ("stale", "Давно решал"),
        ("unstable", "Нестабильно решает"),
        ("weak_spots", "Слабые места"),
    ]

    private var totalSelected: Int {
        counts.values.reduce(0, +)
            + sectionCounts.values.reduce(0, +)
            + protoCounts.values.reduce(0) { $0 + $1.count }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        EyebrowText("Подготовка к ЕГЭ по профильной математике")
                        Text("Выберите темы для тренировки")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(Theme.text)
                        Text("Полоска показывает вашу точность по теме, число рядом — покрытие задач банка. Начните со слабых тем — это быстрее всего поднимает балл.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textDim)
                    }

                    forecastCard

                    if let draft = resumeDraft {
                        resumeCard(draft)
                    }

                    if let errorMessage {
                        ErrorStateView(message: errorMessage) { await load() }
                    }

                    // Ряд контролов — как мобильный веб: три равные кнопки
                    HStack(spacing: 8) {
                        filterMenu
                        Button {
                            selectAll()
                        } label: {
                            Text("Выбрать все").lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        Button {
                            counts = [:]
                            sectionCounts = [:]
                            protoCounts = [:]
                        } label: {
                            Text("Сбросить").lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }

                    Toggle(isOn: $shuffleTasks) {
                        Text("Перемешать задачи")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textDim)
                    }
                    .toggleStyle(SwitchToggleStyle(tint: Theme.accent))


                    if isLoading {
                        LoadingStateView(text: "Загружаем каталог и статистику...")
                    } else {
                        accordion
                    }

                    Spacer(minLength: 90)
                }
                .padding(16)
            }
            .background(Theme.bg)

            startBar
        }
        .navigationTitle("")
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .task {
            if sections.isEmpty { await load() }
            resumeDraft = TrainingDraftStore.load()
            #if DEBUG
            // скриптовая приёмка: авторазворот первой секции (SIMCTL_CHILD_E2E_EXPAND=1)
            if ProcessInfo.processInfo.environment["E2E_EXPAND"] == "1",
               let first = sections.first {
                expanded.insert(first.section.id)
            }
            #endif
        }
        .sheet(item: $previewPayload) { payload in
            StudentPreviewSheet(questions: payload.questions) { remaining in
                previewPayload = nil
                // порядок уже учитывает «Перемешать» (P5-2)
                runPayload = RunPayload(questions: remaining, mode: trainingMode)
            }
        }
        .sheet(item: $protoModalTopic) { topic in
            ProtoPickerSheet(
                topicId: topic.id,
                topicTitle: "\(topic.id). \(topic.title ?? "")",
                studentId: nil,   // self-режим: proto_last3_for_self_v1
                protoCounts: $protoCounts
            )
        }
        .runCoverCompat(item: $runPayload) { payload in
            if payload.mode == "test" {
                StepTrainingView(questions: payload.questions,
                                 initialAnswers: payload.initialAnswers)
            } else {
                TrainingRunView(questions: payload.questions,
                                shuffled: shuffleTasks,
                                initialAnswers: payload.initialAnswers)
            }
        }
        .onChange(of: runPayload == nil) { _, isClosed in
            if isClosed { resumeDraft = TrainingDraftStore.load() }
        }
        .onChange(of: counts) { _, _ in scheduleAssemble() }
        .onChange(of: sectionCounts) { _, _ in scheduleAssemble() }
        .onChange(of: protoCounts) { _, _ in scheduleAssemble() }
        .onChange(of: filterId) { _, _ in scheduleAssemble() }
        .onChange(of: shuffleTasks) { _, _ in applyShuffleToggle() }
    }

    /// P4-1: фоновая сборка подборки — «Предпросмотр»/«Начать» активируются
    /// по готовности, открытие мгновенное.
    /// P5-2: тогл «Перемешать» меняет порядок уже собранной подборки.
    private func applyShuffleToggle() {
        guard let base = assembledBase else {
            assembled = nil
            return
        }
        assembled = shuffleTasks ? base.shuffled() : base
    }

    private func scheduleAssemble() {
        assembleSeq += 1
        let seq = assembleSeq
        guard totalSelected > 0 else {
            assembledBase = nil
            assembled = nil
            isAssembling = false
            return
        }
        isAssembling = true
        let selection = StudentPickEngine.Selection(
            topicCounts: counts, sectionCounts: sectionCounts, protoCounts: protoCounts
        )
        let flt = filterId
        Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard seq == assembleSeq else { return }
            let qs = (try? await StudentPickEngine.pick(
                selection: selection,
                sections: sections,
                filterId: flt,
                student: app.student,
                content: app.content
            )) ?? []
            guard seq == assembleSeq else { return }
            // P6-1: без «Перемешать» — строгий порядок по номерам задач
            assembledBase = qs.sorted { ContentService.numericIdLess($0.questionId, $1.questionId) }
            applyShuffleToggle()
            isAssembling = false
        }
    }

    // MARK: - Фильтр (дропдаун, паритет #studentFilterDropdown)

    private var filterMenu: some View {
        Menu {
            ForEach(Self.filters, id: \.title) { f in
                Button {
                    filterId = f.id
                    Task { await reloadTopicStates() }
                } label: {
                    if filterId == f.id {
                        Label(f.title, systemImage: "checkmark")
                    } else {
                        Text(f.title)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(Self.filters.first(where: { $0.id == filterId })?.title ?? "Без фильтра")
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .font(.body.weight(.medium))
            .foregroundStyle(filterId == nil ? Theme.text : Theme.accent)
            .padding(.vertical, 12)
            .padding(.horizontal, 10)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusMd)
                    .stroke(filterId == nil ? Theme.border : Theme.accent, lineWidth: 1)
            )
        }
    }

    /// Бейджи состояний тем при активном фильтре — self-гейт picking screen.
    private func reloadTopicStates() async {
        guard filterId != nil else {
            topicStates = [:]
            return
        }
        guard let screen = try? await app.student.pickingScreenSelf(filterId: filterId) else { return }
        var map: [String: PickTopicState] = [:]
        for sec in screen.sections ?? [] {
            for t in sec.topics ?? [] {
                if let st = t.topicState { map[t.topicId] = st }
            }
        }
        topicStates = map
    }

    // MARK: - Продолжить тренировку (восстановление сессии)

    private func resumeCard(_ draft: TrainingDraftStore.Draft) -> some View {
        Card(padding: 14) {
            HStack(spacing: 10) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Незавершённая тренировка")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                    Text("\(draft.refs.count) \(Fmt.plural(draft.refs.count, "задача", "задачи", "задач"))")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }
                Spacer()
                Button {
                    Task { await resumeTraining(draft) }
                } label: {
                    Text("Продолжить").lineLimit(1).fixedSize()
                }
                .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                Button {
                    TrainingDraftStore.clear()
                    resumeDraft = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func resumeTraining(_ draft: TrainingDraftStore.Draft) async {
        isPicking = true
        defer { isPicking = false }
        guard let questions = try? await app.content.buildQuestions(refs: draft.refs),
              !questions.isEmpty else {
            TrainingDraftStore.clear()
            resumeDraft = nil
            return
        }
        runPayload = RunPayload(
            questions: questions,
            mode: "list",   // режим всегда списком (включая старые test-черновики)
            initialAnswers: draft.answers
        )
    }

    // MARK: - Прогноз

    private var forecastCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    EyebrowText("Прогноз ЕГЭ")
                    MetricHelpButton(key: .forecast)
                    Spacer()
                    HStack(spacing: 4) {
                        Text("первичные").font(.subheadline).foregroundStyle(Theme.textDim)
                        Text(forecast?.primaryText ?? "—").font(.subheadline.weight(.bold))
                        MetricHelpButton(key: .primary)
                    }
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(forecast.map { "\($0.secondary)" } ?? "—")
                        .font(.system(size: 38, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Text("из 100 баллов")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                    Spacer()
                    if let f = forecast {
                        Text("+\(ScoreForecast.deltaToGoal(secondary: f.secondary)) до цели")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Theme.accent)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.panel2)
                        Capsule()
                            .fill(Theme.accent)
                            .frame(width: geo.size.width * CGFloat(forecast?.secondary ?? 0) / 100)
                        Rectangle()
                            .fill(Theme.accent2)
                            .frame(width: 3, height: 14)
                            .offset(x: geo.size.width * 0.7)
                    }
                }
                .frame(height: 8)
                HStack {
                    Text("0").font(.caption).foregroundStyle(Theme.textDim)
                    Spacer()
                    Text("цель 70").font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                    Spacer()
                    Text("100").font(.caption).foregroundStyle(Theme.textDim)
                }
            }
        }
    }

    // MARK: - Аккордеон

    private var accordion: some View {
        VStack(spacing: 10) {
            ForEach(sections, id: \.section.id) { pair in
                sectionRow(pair.section, topics: pair.topics)
            }
        }
    }

    private func sectionRow(_ section: CatalogEntry, topics: [CatalogEntry]) -> some View {
        let sectionCount = topics.reduce(0) { $0 + (counts[$1.id] ?? 0) } + (sectionCounts[section.id] ?? 0)
        let pct = forecast?.sectionPctById[section.id]
        let coveredText = sectionCoverageText(section, topics: topics)

        return VStack(spacing: 0) {
            VStack(spacing: 8) {
                HStack {
                    Button {
                        toggleExpanded(section.id)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: expanded.contains(section.id) ? "arrowtriangle.down.fill" : "arrowtriangle.right.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.textDim)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(section.id). \(section.title ?? "")")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Theme.text)
                                    .multilineTextAlignment(.leading)
                                if weakSectionIds.contains(section.id) {
                                    Text("слабая тема")
                                        .font(.caption2)
                                        .foregroundStyle(Theme.textDim)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    CountStepper(count: sectionCount) { delta in
                        adjustSection(section, topics: topics, delta: delta)
                    }
                }
                HStack(spacing: 10) {
                    TopicProgressBar(pct: pct)
                    if let pct {
                        Text("\(pct)%")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Theme.text)
                    }
                    Spacer()
                    Text(coveredText)
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }
            }
            .padding(.vertical, 12)

            if expanded.contains(section.id) {
                VStack(spacing: 8) {
                    ForEach(topics) { topic in
                        topicRow(topic)
                    }
                }
                .padding(.leading, 14)
                .padding(.bottom, 10)
            }

            Divider().overlay(Theme.borderLight)
        }
    }

    private func topicRow(_ topic: CatalogEntry) -> some View {
        let pct = topicPctById[topic.id]
        let protoInTopic = protoCounts.values
            .filter { $0.topicId == topic.id }
            .reduce(0) { $0 + $1.count }
        return HStack {
            // Тап по строке подтемы открывает модалку прототипов (как на вебе)
            Button {
                protoModalTopic = topic
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("\(topic.id). \(topic.title ?? "")")
                            .font(.subheadline)
                            .foregroundStyle(Theme.text)
                            .multilineTextAlignment(.leading)
                        if protoInTopic > 0 {
                            Text("+\(protoInTopic)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.vertical, 1)
                                .padding(.horizontal, 6)
                                .background(Theme.accent)
                                .clipShape(Capsule())
                        }
                    }
                    HStack(spacing: 8) {
                        TopicProgressBar(pct: pct)
                            .frame(width: 110)
                        if let pct {
                            Text("\(pct)%").font(.caption.weight(.semibold)).foregroundStyle(Theme.textDim)
                        }
                    }
                    if let badge = stateBadgeText(topic.id) {
                        Text(badge)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(Theme.warnText)
                            .padding(.vertical, 2)
                            .padding(.horizontal, 6)
                            .background(Theme.warnBg)
                            .clipShape(Capsule())
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            CountStepper(count: counts[topic.id] ?? 0) { delta in
                let next = max(0, (counts[topic.id] ?? 0) + delta)
                counts[topic.id] = next == 0 ? nil : next
            }
        }
    }

    /// Бейдж состояния темы при активном фильтре (как у учителя).
    private func stateBadgeText(_ topicId: String) -> String? {
        guard filterId != nil, let st = topicStates[topicId] else { return nil }
        if st.isNotSeen == true { return "не решал" }
        if st.isLowSeen == true { return "мало решал" }
        if st.isStale == true { return "давно не решал" }
        if st.isUnstable == true { return "нестабильно" }
        return nil
    }

    private func sectionCoverageText(_ section: CatalogEntry, topics: [CatalogEntry]) -> String {
        guard let stat = analytics?.sections?.first(where: { $0.sectionId == section.id }),
              let cov = stat.coverage, let total = cov.unicsTotal
        else { return "\(topics.count)/\(topics.count)" }
        return "\(cov.unicsAttempted ?? 0)/\(total)"
    }

    // MARK: - Действия

    private func toggleExpanded(_ id: String) {
        if expanded.contains(id) {
            expanded.remove(id)
        } else {
            expanded.insert(id)
            warmSection(id)
        }
    }

    /// Прогрев статистики прототипов раскрытой секции (порт WFX1) —
    /// модалка откроется с готовыми бейджами, без мигания.
    private func warmSection(_ sectionId: String) {
        guard let pair = sections.first(where: { $0.section.id == sectionId }) else { return }
        let teacher = app.teacher
        let content = app.content
        for topic in pair.topics {
            Task.detached(priority: .utility) {
                _ = await ProtoStatsCache.shared.load(
                    studentId: nil, topicId: topic.id,
                    teacher: teacher, content: content
                )
            }
        }
    }

    /// Счётчик на секции — section-бакет (CHOICE_SECTIONS веба): какой именно
    /// подтемой закрыть запрос, решает подбор (с фильтром — сервер по ранжиру).
    private func adjustSection(_ section: CatalogEntry, topics: [CatalogEntry], delta: Int) {
        if delta > 0 {
            sectionCounts[section.id] = (sectionCounts[section.id] ?? 0) + 1
        } else {
            // −1: сначала снимаем секционный бакет, затем перетёкшие в темы
            if let n = sectionCounts[section.id], n > 0 {
                sectionCounts[section.id] = n == 1 ? nil : n - 1
            } else if let target = topics.filter({ (counts[$0.id] ?? 0) > 0 })
                .max(by: { (counts[$0.id] ?? 0) < (counts[$1.id] ?? 0) }) {
                let next = (counts[target.id] ?? 0) - 1
                counts[target.id] = next == 0 ? nil : next
            }
        }
    }

    /// «Выбрать все» — +1 в каждую секцию (bulkPickAll веба).
    private func selectAll() {
        for pair in sections {
            sectionCounts[pair.section.id] = (sectionCounts[pair.section.id] ?? 0) + 1
        }
    }

    // MARK: - Нижний бар «Предпросмотр | Начать» (как мобильный веб)

    private var startBar: some View {
        HStack(spacing: 10) {
            // P4-1: активен только когда подборка собрана фоном; открытие мгновенное
            Button {
                if let qs = assembled, !qs.isEmpty {
                    previewPayload = PreviewQuestions(questions: qs)
                }
            } label: {
                Group {
                    if isAssembling {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Label("Предпросмотр", systemImage: "eye")
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(isAssembling || assembled?.isEmpty != false)
            .opacity(totalSelected == 0 ? 0.5 : 1)

            Button {
                startAssembled()
            } label: {
                Text("Начать\(totalSelected > 0 ? " (\(totalSelected))" : "")")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isAssembling || assembled?.isEmpty != false)
            .opacity(totalSelected == 0 ? 0.5 : 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    /// «Начать» с готовой подборкой (P4-1; порядок уже учитывает «Перемешать» — P5-2).
    private func startAssembled() {
        guard let qs = assembled, !qs.isEmpty else { return }
        runPayload = RunPayload(questions: qs, mode: trainingMode)
    }

    // MARK: - Данные

    private func load() async {
        isLoading = true
        errorMessage = nil
        Task {
            if let sid = await app.student.selfUserId() {
                await PickSnapshotCache.shared.prewarm(for: sid, client: app.student.client)
            }
        }
        do {
            sections = try await app.content.sectionsWithTopics()
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return
        }
        // Каталог уже готов: статистика обогащает видимый аккордеон асинхронно.
        isLoading = false
        Task { await loadAnalytics() }
    }

    private func loadAnalytics() async {
        do {
            let a = try await app.student.analytics(scope: "self", days: 30, source: "all")
            analytics = a
            let topics = a.topics ?? []
            let f = ScoreForecast.compute(topics: topics)
            forecast = f
            var byId: [String: Int] = [:]
            for t in topics {
                if let raw = t.subtopicLast3AvgPct, raw.isFinite {
                    byId[t.topicId] = Int(raw.rounded())
                }
            }
            topicPctById = byId
            weakSectionIds = Set(
                f.sectionPctById.filter { $0.value < 40 }.map(\.key)
            )
        } catch {
            // Прогноз недоступен — каталог всё равно показываем
        }
    }

}

/// Счётчик «− N +» как на вебе.
struct CountStepper: View {
    let count: Int
    let onChange: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            stepperButton("minus") { onChange(-1) }
            Text("\(count)")
                .font(.body.weight(.bold))
                .foregroundStyle(Theme.text)
                .frame(width: 44, height: 36)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radiusSm)
                        .stroke(Theme.border, lineWidth: 1)
                )
            stepperButton("plus") { onChange(1) }
        }
    }

    private func stepperButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.text)
                .frame(width: 34, height: 34)
                .background(Theme.panel)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - fullScreenCover c item (хелпер; на macOS — sheet для dev-harness)

extension View {
    @ViewBuilder
    func runCoverCompat<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        #if os(iOS)
        self.fullScreenCover(item: item) { content($0) }
        #else
        self.sheet(item: item) { content($0) }
        #endif
    }
}
