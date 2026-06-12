import SwiftUI

/// Главная преподавателя — повторяет home_teacher.html:
/// выбор ученика, карточка прогноза, фильтры подбора, аккордеон тем
/// с прогрессом/бейджами и счётчиками, бар «Создать ДЗ».
struct TeacherHomeView: View {
    @EnvironmentObject private var app: AppState

    @State private var students: [StudentListItem] = []
    @State private var selectedStudent: StudentListItem?
    @State private var picking: PickingScreen?
    @State private var analytics: AnalyticsScreen?
    @State private var forecast: ScoreForecast.Result?

    @State private var counts: [String: Int] = [:]            // topicId -> кол-во (CHOICE_TOPICS)
    @State private var sectionCounts: [String: Int] = [:]     // sectionId -> кол-во (CHOICE_SECTIONS)
    @State private var protoCounts: [String: ProtoPick] = [:] // baseId -> (topicId, n) (CHOICE_PROTOS)
    @State private var expanded: Set<String> = []
    @State private var filterId: String?

    @State private var shuffleTasks = false
    @State private var isLoadingStudents = true
    @State private var isLoadingScreen = false

    // P4-1: фоновая сборка подборки (дебаунс + seq против гонок)
    @State private var assembledBase: [RunQuestion]?   // каталожный порядок
    @State private var assembled: [RunQuestion]?       // отображаемый (P5-2: с учётом «Перемешать»)
    @State private var assembleSeq = 0
    @State private var isAssembling = false
    @State private var errorMessage: String?
    @State private var createHWPayload: CreateHWPayload?
    @State private var protoModalTopic: ModalTopic?
    // P6-5: каталог для режима «без ученика»
    @State private var catalogSections: [(section: CatalogEntry, topics: [CatalogEntry])] = []

    struct ModalTopic: Identifiable {
        let id: String
        let title: String?
    }
    @State private var showStudentSearch = false
    @State private var previewPayload: PreviewPayload?

    struct CreateHWPayload: Identifiable {
        let id = UUID()
        let student: StudentListItem?   // P6-5: nil — без назначения
        let selection: [String: Int]
        var sectionSelection: [String: Int] = [:]
        var protoSelection: [String: ProtoPick] = [:]
        var prePicked: [QuestionRef]? = nil
    }

    struct PreviewPayload: Identifiable {
        let id = UUID()
        let student: StudentListItem?   // P6-5: nil — каталожный режим без ученика
    }

    struct StartListPayload: Identifiable, Hashable {
        let id = UUID()
        var questions: [RunQuestion]
        static func == (l: Self, r: Self) -> Bool { l.id == r.id }
        func hash(into h: inout Hasher) { h.combine(id) }
    }

    @State private var startList: StartListPayload?

    private let filters: [(String?, String)] = [
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

    /// Все бакеты выбора: proto -> topic -> section (scope-приоритет веба).
    private var resolveRequests: [(kind: String, id: String, n: Int)] {
        var out: [(String, String, Int)] = []
        for (baseId, pick) in protoCounts.sorted(by: { $0.key < $1.key }) {
            out.append(("proto", baseId, pick.count))
        }
        for (topicId, n) in counts.sorted(by: { $0.key < $1.key }) where n > 0 {
            out.append(("topic", topicId, n))
        }
        for (sectionId, n) in sectionCounts.sorted(by: { $0.key < $1.key }) where n > 0 {
            out.append(("section", sectionId, n))
        }
        return out
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        EyebrowText("Подготовка к ЕГЭ по профильной математике")
                        Text(selectedStudent == nil ? "Выберите ученика" : "Подбор задач")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(Theme.text)
                    }

                    // P5-1: поиск ученика + иконка карточки справа, всегда одной строкой
                    HStack(spacing: 8) {
                        studentPicker
                        if let s = selectedStudent {
                            NavigationLink {
                                StudentCardView(student: s)
                            } label: {
                                Image(systemName: "person.text.rectangle")
                                    .font(.body)
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 48, height: 48)
                                    .background(Theme.panel)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.radiusMd)
                                            .stroke(Theme.border, lineWidth: 1)
                                    )
                            }
                            .fixedSize()
                        }
                    }

                    forecastCard

                    if let errorMessage {
                        ErrorStateView(message: errorMessage) { await reloadScreen() }
                    }

                    if selectedStudent != nil {
                        // Ряд контролов — идентичен ученику (P4-2): фильтр первым
                        HStack(spacing: 8) {
                            filterMenu
                            Button {
                                if let p = picking { selectAll(p) }
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
                    }

                    if isLoadingScreen {
                        LoadingStateView(text: "Загружаем статистику ученика...")
                    } else if let picking {
                        accordion(picking)
                    } else if selectedStudent == nil {
                        // P6-5: без ученика — каталожный аккордеон (составить и
                        // распечатать работу можно без статистики)
                        if students.isEmpty == false || !isLoadingStudents {
                            Text("Ученик не выбран — статистика недоступна, но подборку можно собрать и распечатать.")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                        }
                        // ряд контролов каталожного режима (фильтры требуют ученика)
                        HStack(spacing: 8) {
                            Button {
                                for pair in catalogSections {
                                    sectionCounts[pair.section.id] = (sectionCounts[pair.section.id] ?? 0) + 1
                                }
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
                        catalogAccordion
                    }

                    Spacer(minLength: 90)
                }
                .padding(16)
            }
            .background(Theme.bg)

            bottomBar
        }
        .navigationTitle("")
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .task {
            if students.isEmpty { await loadStudents() }
            if catalogSections.isEmpty {
                catalogSections = (try? await app.content.sectionsWithTopics()) ?? []
            }
        }
        .onChange(of: counts) { _, _ in scheduleAssemble() }
        .onChange(of: sectionCounts) { _, _ in scheduleAssemble() }
        .onChange(of: protoCounts) { _, _ in scheduleAssemble() }
        .onChange(of: filterId) { _, _ in scheduleAssemble() }
        .onChange(of: shuffleTasks) { _, _ in applyShuffleToggle() }
        .sheet(item: $createHWPayload) { payload in
            NavigationStack {
                CreateHomeworkView(
                    student: payload.student,
                    selection: payload.selection,
                    sectionSelection: payload.sectionSelection,
                    protoSelection: payload.protoSelection,
                    prePicked: payload.prePicked
                )
            }
        }
        .sheet(item: $protoModalTopic) { topic in
            ProtoPickerSheet(
                topicId: topic.id,
                topicTitle: "\(topic.id). \(topic.title ?? "")",
                studentId: selectedStudent?.studentId,
                protoCounts: $protoCounts
            )
        }
        .navigationDestination(item: $startList) { payload in
            TeacherListView(questions: payload.questions)
        }
        .sheet(item: $previewPayload) { payload in
            AddedTasksPreviewSheet(
                student: payload.student,
                requests: resolveRequests,
                filterId: filterId,
                shuffle: shuffleTasks,
                preAssembled: assembled,
                onCreateHW: { refs in
                    previewPayload = nil
                    createHWPayload = CreateHWPayload(
                        student: payload.student,
                        selection: counts,
                        protoSelection: protoCounts,
                        prePicked: refs
                    )
                }
            )
        }
        .sheet(isPresented: $showStudentSearch) {
            StudentSearchPicker(students: students) { s in
                showStudentSearch = false
                selectStudent(s)
            }
        }
    }

    // MARK: - Выбор ученика (комбобокс с поиском — #studentComboInput)

    private var studentPicker: some View {
        Button {
            showStudentSearch = true
        } label: {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.textDim)
                Text(selectedStudent?.displayName ?? (isLoadingStudents ? "Загрузка учеников..." : "Выберите ученика..."))
                    .foregroundStyle(selectedStudent == nil ? Theme.textDim : Theme.text)
                Spacer()
                if selectedStudent != nil {
                    Button {
                        selectedStudent = nil
                        picking = nil
                        forecast = nil
                        counts = [:]
                        protoCounts = [:]
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Theme.textDim)
                    }
                    .buttonStyle(.plain)
                }
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
            .padding(14)
            .background(Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusMd)
                    .stroke(Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(students.isEmpty)
    }

    // MARK: - Прогноз (плейсхолдеры «—» пока ученик не выбран — как на вебе)

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
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Text("из 100 баллов")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                    Spacer()
                    Text(forecast.map { "+\(ScoreForecast.deltaToGoal(secondary: $0.secondary)) до цели" } ?? "+— до цели")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.accent)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.panel2)
                        if let f = forecast {
                            Capsule()
                                .fill(Theme.accent)
                                .frame(width: geo.size.width * CGFloat(f.secondary) / 100)
                        }
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

    // MARK: - Фильтр (дропдаун со счётчиками, как #teacherFilterDropdown)

    private var filterMenu: some View {
        Menu {
            ForEach(filters, id: \.1) { f in
                Button {
                    filterId = f.0
                    // P4-3: тихое обновление — аккордеон не перезагружается,
                    // раскрытые секции сохраняются
                    Task { await refreshScreenQuiet() }
                } label: {
                    if filterId == f.0 {
                        Label(filterLabel(f), systemImage: "checkmark")
                    } else {
                        Text(filterLabel(f))
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(filters.first(where: { $0.0 == filterId })?.1 ?? "Без фильтра")
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

    private func filterLabel(_ f: (String?, String)) -> String {
        guard let key = f.0, let picking else { return f.1 }
        let count = (picking.sections ?? []).reduce(0) { acc, s in
            acc + filterCount(s.filterCounts, key: key)
        }
        return count > 0 ? "\(f.1) (\(count))" : f.1
    }

    private func filterCount(_ counts: FilterCounts?, key: String) -> Int {
        switch key {
        case "stale": return counts?.stale ?? 0
        case "unstable": return counts?.unstable ?? 0
        case "unseen_low": return counts?.unseenLow ?? 0
        case "weak_spots": return counts?.weakSpots ?? 0
        default: return 0
        }
    }

    // MARK: - Аккордеон секций/тем

    private func accordion(_ picking: PickingScreen) -> some View {
        VStack(spacing: 10) {
            ForEach(picking.sections ?? []) { section in
                sectionRow(section)
            }
        }
    }

    private func sectionRow(_ section: PickSection) -> some View {
        let topics = section.topics ?? []
        let sectionCount = topics.reduce(0) { $0 + (counts[$1.id] ?? 0) }
            + (sectionCounts[section.id] ?? 0)
        let pct = sectionPct(topics)

        return VStack(spacing: 0) {
            VStack(spacing: 8) {
                HStack {
                    Button {
                        if expanded.contains(section.id) {
                            expanded.remove(section.id)
                        } else {
                            expanded.insert(section.id)
                            warmSection(topics)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: expanded.contains(section.id) ? "arrowtriangle.down.fill" : "arrowtriangle.right.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.textDim)
                            Text("\(section.id). \(section.title ?? "")")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Theme.text)
                                .multilineTextAlignment(.leading)
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

    private func topicRow(_ topic: PickTopic) -> some View {
        let protoInTopic = protoCounts.values
            .filter { $0.topicId == topic.id }
            .reduce(0) { $0 + $1.count }
        return HStack {
            // Тап по строке подтемы открывает модалку прототипов (как на вебе)
            Button {
                protoModalTopic = ModalTopic(id: topic.id, title: topic.title)
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
                    HStack(spacing: 6) {
                        let pct = topic.progress?.subtopicLast3AvgPct.map { Int($0.rounded()) }
                        TopicProgressBar(pct: pct)
                            .frame(width: 90)
                        if let pct {
                            Text("\(pct)%").font(.caption.weight(.semibold)).foregroundStyle(Theme.textDim)
                        }
                        if let cov = topic.coverage {
                            Text("\(cov.coveredProtoCount ?? 0)/\(cov.totalProtoCount ?? 0)")
                                .font(.caption2)
                                .foregroundStyle(Theme.textDim)
                        }
                    }
                    topicBadges(topic)
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

    @ViewBuilder
    private func topicBadges(_ topic: PickTopic) -> some View {
        let state = topic.topicState
        HStack(spacing: 6) {
            if state?.isNotSeen == true {
                StatusBadge(text: "не решал", style: .neutral)
            }
            if state?.isStale == true {
                StatusBadge(text: "давно не решал", style: .warning)
            }
            if state?.isUnstable == true {
                StatusBadge(text: "нестабильно", style: .warning)
            }
            if let pct = topic.progress?.subtopicLast3AvgPct, pct < 40, state?.isNotSeen != true {
                StatusBadge(text: "слабое", style: .danger)
            }
        }
    }

    // MARK: - Каталожный аккордеон (P6-5: учитель без выбранного ученика)

    private var catalogAccordion: some View {
        VStack(spacing: 10) {
            ForEach(catalogSections, id: \.section.id) { pair in
                catalogSectionRow(pair.section, topics: pair.topics)
            }
        }
    }

    private func catalogSectionRow(_ section: CatalogEntry, topics: [CatalogEntry]) -> some View {
        let sectionCount = topics.reduce(0) { $0 + (counts[$1.id] ?? 0) }
            + (sectionCounts[section.id] ?? 0)
        return VStack(spacing: 0) {
            HStack {
                Button {
                    if expanded.contains(section.id) { expanded.remove(section.id) }
                    else { expanded.insert(section.id) }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: expanded.contains(section.id) ? "arrowtriangle.down.fill" : "arrowtriangle.right.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.textDim)
                        Text("\(section.id). \(section.title ?? "")")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .multilineTextAlignment(.leading)
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                CountStepper(count: sectionCount) { delta in
                    if delta > 0 {
                        sectionCounts[section.id] = (sectionCounts[section.id] ?? 0) + 1
                    } else if let n = sectionCounts[section.id], n > 0 {
                        sectionCounts[section.id] = n == 1 ? nil : n - 1
                    } else if let target = topics.filter({ (counts[$0.id] ?? 0) > 0 })
                        .max(by: { (counts[$0.id] ?? 0) < (counts[$1.id] ?? 0) }) {
                        let next = (counts[target.id] ?? 0) - 1
                        counts[target.id] = next == 0 ? nil : next
                    }
                }
            }
            .padding(.vertical, 12)

            if expanded.contains(section.id) {
                VStack(spacing: 8) {
                    ForEach(topics) { topic in
                        catalogTopicRow(topic)
                    }
                }
                .padding(.leading, 14)
                .padding(.bottom, 10)
            }
            Divider().overlay(Theme.borderLight)
        }
    }

    private func catalogTopicRow(_ topic: CatalogEntry) -> some View {
        let protoInTopic = protoCounts.values
            .filter { $0.topicId == topic.id }
            .reduce(0) { $0 + $1.count }
        return HStack {
            Button {
                protoModalTopic = ModalTopic(id: topic.id, title: topic.title)
            } label: {
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

    /// Прогрев статистики прототипов раскрытой секции (порт WFX1 для учителя).
    private func warmSection(_ topics: [PickTopic]) {
        guard let sid = selectedStudent?.studentId else { return }
        let teacher = app.teacher
        let content = app.content
        for topic in topics {
            Task.detached(priority: .utility) {
                _ = await ProtoStatsCache.shared.load(
                    studentId: sid, topicId: topic.id,
                    teacher: teacher, content: content
                )
            }
        }
    }

    private func sectionPct(_ topics: [PickTopic]) -> Int? {
        let vals = topics.compactMap { $0.progress?.subtopicLast3AvgPct }
        guard !vals.isEmpty else { return nil }
        return Int((vals.map { $0.rounded() }.reduce(0, +) / Double(vals.count)).rounded())
    }

    /// Счётчик на секции — section-бакет (CHOICE_SECTIONS веба): какой подтемой
    /// закрыть запрос, решает сервер по ранжиру фильтра.
    private func adjustSection(_ section: PickSection, topics: [PickTopic], delta: Int) {
        if delta > 0 {
            sectionCounts[section.id] = (sectionCounts[section.id] ?? 0) + 1
        } else {
            if let n = sectionCounts[section.id], n > 0 {
                sectionCounts[section.id] = n == 1 ? nil : n - 1
            } else if let target = topics.filter({ (counts[$0.id] ?? 0) > 0 })
                .max(by: { (counts[$0.id] ?? 0) < (counts[$1.id] ?? 0) }) {
                let next = (counts[target.id] ?? 0) - 1
                counts[target.id] = next == 0 ? nil : next
            }
        }
    }

    /// «Выбрать все» — +1 в каждую секцию (bulkPickAll веба: 12 задач, не 84).
    private func selectAll(_ picking: PickingScreen) {
        for section in picking.sections ?? [] {
            sectionCounts[section.id] = (sectionCounts[section.id] ?? 0) + 1
        }
    }

    // MARK: - Нижний бар

    private var bottomBar: some View {
        HStack(spacing: 10) {
            // Предпросмотр добавленных задач — «глаз» с бейджем (#addedTasksBtn).
            // P4-1: активен только когда подборка собрана фоном.
            Button {
                previewPayload = PreviewPayload(student: selectedStudent)
            } label: {
                Group {
                    if isAssembling {
                        ProgressView()
                    } else {
                        Image(systemName: "eye")
                            .foregroundStyle(Theme.text)
                    }
                }
                .font(.body)
                .frame(width: 44, height: 44)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radiusMd)
                        .stroke(Theme.border, lineWidth: 1)
                )
                .overlay(alignment: .topTrailing) {
                    if let n = assembled?.count, n > 0 {
                        Text("\(n)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.vertical, 1)
                            .padding(.horizontal, 5)
                            .background(Theme.accent)
                            .clipShape(Capsule())
                            .offset(x: 6, y: -6)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(assembled?.isEmpty != false)
            // P5-3: «Начать» — полноэкранный лист задач (push, свайп вправо),
            // широкая выделенная кнопка как на мобильном вебе
            Button {
                if let qs = assembled, !qs.isEmpty {
                    startList = StartListPayload(questions: qs)
                }
            } label: {
                Text("Начать")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(assembled?.isEmpty != false)
            Button("Создать ДЗ") {
                // P4-1: используем уже собранную подборку (refs без пере-resolve);
                // P6-5: без ученика — ДЗ «Не назначать»
                createHWPayload = CreateHWPayload(
                    student: selectedStudent, selection: counts,
                    sectionSelection: sectionCounts, protoSelection: protoCounts,
                    prePicked: assembled.map { qs in
                        qs.map { QuestionRef(topicId: $0.topicId, questionId: $0.questionId) }
                    }
                )
            }
            .buttonStyle(PrimaryButtonStyle(fullWidth: false))
            .disabled(assembled?.isEmpty != false)
            .opacity(assembled?.isEmpty != false ? 0.5 : 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    // MARK: - Данные

    private func loadStudents() async {
        isLoadingStudents = true
        do {
            students = try await app.teacher.listMyStudents()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingStudents = false
    }

    private func selectStudent(_ s: StudentListItem) {
        selectedStudent = s
        counts = [:]
        sectionCounts = [:]
        protoCounts = [:]
        picking = nil
        forecast = nil
        Task { await reloadScreen() }
    }

    private func reloadScreen() async {
        guard let s = selectedStudent else { return }
        isLoadingScreen = true
        errorMessage = nil
        do {
            picking = try await app.teacher.pickingScreen(studentId: s.studentId, filterId: filterId)
        } catch {
            errorMessage = error.localizedDescription
            isLoadingScreen = false
            return
        }
        // Прогноз — из той же аналитики, что у ученика (teacher scope)
        if let a = try? await app.student.analytics(scope: "teacher", studentId: s.studentId) {
            analytics = a
            forecast = ScoreForecast.compute(topics: a.topics ?? [])
        }
        isLoadingScreen = false
    }

    /// P4-1: фоновая сборка подборки. Кнопки предпросмотра/«Начать»
    /// активируются, когда подборка готова; открытие — мгновенное.
    /// P5-2: тогл «Перемешать» меняет порядок уже собранной подборки —
    /// его видно в предпросмотре, и тот же порядок идёт в «Начать»/ДЗ.
    private func applyShuffleToggle() {
        guard let base = assembledBase else {
            assembled = nil
            return
        }
        assembled = shuffleTasks ? base.shuffled() : base
    }

    private func scheduleAssemble() {
        assembledBase = nil
        assembled = nil
        assembleSeq += 1
        let seq = assembleSeq
        guard totalSelected > 0 else {
            isAssembling = false
            return
        }
        isAssembling = true
        let student = selectedStudent
        let requests = resolveRequests
        let flt = filterId
        let selection = StudentPickEngine.Selection(
            topicCounts: counts, sectionCounts: sectionCounts, protoCounts: protoCounts
        )
        let catalog = catalogSections
        Task {
            try? await Task.sleep(nanoseconds: 700_000_000)   // дебаунс степперов
            guard seq == assembleSeq else { return }
            let qs: [RunQuestion]
            if let s = student {
                let picked = (try? await app.teacher.resolvePickedWithTopUp(
                    studentId: s.studentId, requests: requests, filterId: flt
                )) ?? []
                let refs = picked.map {
                    QuestionRef(topicId: $0.topicId ?? "", questionId: $0.questionId)
                }
                qs = (try? await app.content.buildQuestions(refs: refs)) ?? []
            } else {
                // P6-5: без ученика — клиентский подбор по каталогу (без RPC)
                qs = (try? await StudentPickEngine.pick(
                    selection: selection, sections: catalog, filterId: nil,
                    student: app.student, content: app.content
                )) ?? []
            }
            guard seq == assembleSeq else { return }
            // P6-1: без «Перемешать» — строгий порядок по номерам задач
            assembledBase = qs.sorted { ContentService.numericIdLess($0.questionId, $1.questionId) }
            applyShuffleToggle()
            isAssembling = false
        }
    }

    /// Тихий рефреш экрана подбора (P4-3): без лоадера и без перестройки
    /// аккордеона — данные подменяются на месте, expanded не трогаем.
    private func refreshScreenQuiet() async {
        guard let s = selectedStudent else { return }
        let expected = filterId
        if let fresh = try? await app.teacher.pickingScreen(studentId: s.studentId, filterId: expected),
           filterId == expected {   // защита от гонки при быстрой смене фильтра
            picking = fresh
        }
    }
}
